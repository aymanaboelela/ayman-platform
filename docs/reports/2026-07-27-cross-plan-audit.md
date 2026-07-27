# Cross-plan audit — plans 1 through 5

**Audited commit:** `0618449` (tip of `plan-5-quiz`)
**Date:** 2026-07-27
**Scope:** plan-1-foundation, plan-2-auth, plan-3-content, plan-4-player, plan-5-quiz. Plans 6 and 7 (in progress on `plan-6-admin`) were explicitly out of scope.
**Method:** adversarial. Every claim below was written up, then attacked by three independent skeptics whose job was to refute it. Only claims that survived at least two of three refutation attempts appear here, and where a skeptic materially corrected a claim, the correction is folded in rather than the original overstated wording.

---

## 1. Verdict

**Merge it. Do not put students on it yet.** The architecture is genuinely good — better than most codebases at this stage. Authorization is deny-by-default at the guard, permissions are `resource:action` string lookups rather than role equality, the answer-leak defence is three real layers deep, the database carries ~35 CHECK constraints and three immutability triggers that the application role cannot work around, and grading is a pure function over frozen question versions. I went looking for the classic launch-killers — SQL injection, XSS through the rich-text path, mass assignment, IDOR, an unauthenticated data path — and found none. What I did find is concentrated in three narrow seams, and that concentration is the good news: **(a)** a single cross-plan interface, `LessonProgressService.recordQuizResult`, was written in Plan 4 to open its own transaction and then consumed in Plan 5 from inside three transactions that were already open — this one function accounts for the two worst defects in the report and wedges the connection pool at exactly the traffic shape of an exam deadline; **(b)** floating-point `1/n` option weights being written into a `numeric(10,6)` column, which makes a 3-correct multi-select unpublishable through the admin UI and, if bulk-imported, grades a perfect answer as "partial"; and **(c)** the student-facing feedback surface, where the only `<Toaster/>` in the app is mounted in the admin layout, so every failure message a student could receive during a graded attempt renders nothing at all. Eleven items on the blocker list, all with local, well-understood fixes; none requires rearchitecting anything.

---

## 2. Confirmed findings

Severities are my own calibration after refutation, not the initial triage. Where a skeptic successfully narrowed a claim, that narrowing is stated.

---

### B1 — CRITICAL — `recordQuizResult` opens a second pooled transaction inside the caller's, wedging the pool and breaking documented atomicity

**`apps/api/src/modules/progress/lesson-progress.service.ts:237`** (and `:231`)

`recordQuizResult` takes no `Prisma.TransactionClient` and unconditionally calls `this.prisma.$transaction(...)` at line 237, plus a non-transactional `this.access.require(...)` at line 231. All three of its callers invoke it from inside an already-open interactive transaction:

- `attempt.service.ts:836` (inside `submit`'s tx opened at `:501`)
- `attempt.service.ts:836` again (inside `closeOverdue`'s tx opened at `:719`)
- `appeals.service.ts:171` (inside `applyOutcome`'s tx opened at `:125`)

`PrismaService` is a bare `PrismaClient` with a `PrismaPg` adapter and no connection-limit config (`prisma.service.ts:14`), so `pg.Pool` defaults to `max: 10`, `connectionTimeoutMillis` is unset (waiters queue forever), and `@prisma/adapter-pg`'s `startTransaction` checks out a dedicated connection per transaction. No `transactionOptions` are set anywhere in `apps/api`, so Prisma's defaults apply (`maxWait` 2 s, interactive `timeout` 5 s). There is no CLS/AsyncLocalStorage transaction propagation in the repo, so the nested call provably cannot reuse the caller's connection.

**Failure (a) — pool wedge.** Ten students confirm submission at the same timer deadline. Each holds one pooled connection inside its outer `submit` transaction and then requests a second for the nested call. All ten connections are held by transactions that only their own blocked continuation could release. A skeptic reproduced this empirically against the project's real database with the exact stack: **10 concurrent flows → all 10 fail; 9 concurrent flows → all 9 succeed.** Every outer transaction rolls back at its 5 s timeout, `submittedAt` reverts, and all ten students get an HTTP 500 on submit.

**Failure (b) — split commit.** In `applyOutcome`, the nested transaction commits `lesson_progress.state='passed'`, `completed_at` and `enrollment.progress_percent` independently at `:171`, and execution then continues to `tx.gradeAppeal.update` (`:181`) and a second `events.append` (`:191`) in the still-open outer transaction. If the outer transaction fails after that point — the 5 s timeout, or the `attempt_events` `MAX(seq)+1` unique collision described in I2 — the mark rewrite, the recomputed attempt score and the appeal resolution all roll back while the student stays permanently marked as having passed the lesson at a score that no longer exists, with the appeal still reading `open`.

This directly contradicts two doc comments in the codebase. `attempt.service.ts:634-638` states `recomputeScoreTx` exists because "Prisma has no nested-transaction support," making "the three writes (mark, score, lesson progress) atomic." `appeals.service.ts:110-118` claims "ONE transaction for the whole outcome." The tx-threading discipline was applied to `recomputeScore`/`recomputeScoreTx` and simply never extended to `recordQuizResult`.

**Fix.** Add `recordQuizResultTx(tx: Prisma.TransactionClient, args)` mirroring the existing `recomputeScore` / `recomputeScoreTx` pair, and have all three call sites pass their own `tx`. Hoist the `access.require` call at `:231` out of the function entirely (see B2). Separately, set an explicit `connection_limit` and `transactionOptions` so the pool ceiling is a deliberate number rather than a library default.

**Why tests miss it.** `attempt.service.spec.ts:771` is the only concurrency test and runs exactly two concurrent submits — 4 connections against a pool of 10, below the wedge threshold. The outer and inner transactions touch disjoint tables (`quiz_attempts`/`attempt_questions`/`attempt_events` vs `lesson_progress`/`enrollments`), so there is no row-lock self-deadlock to expose it serially; the nesting silently succeeds on the happy path. `attempt.service.spec.ts:891` asserts `recordQuizResult` was called once — which passes *because* the inner transaction commits independently. That assertion is testing the symptom.

---

### B2 — CRITICAL — the same call re-runs the publication gate inside the grading transaction, making an in-flight attempt permanently unsubmittable

**`apps/api/src/modules/progress/lesson-progress.service.ts:231`**, reached from **`apps/api/src/modules/quiz/attempt.service.ts:836`**

`recordQuizResult`'s first statement is `await this.access.require(args.userId, args.lessonId)`, whose WHERE clause hard-codes `isPublished: true` and `course: { status: 'published' }` and throws `NotFoundException('lesson not found')` on a miss. That call now sits inside `submit`'s transaction.

**Failure.** A student starts a graded attempt on lesson L in course C. Mid-attempt, an admin archives the course (`PATCH /api/admin/courses/{C}/status {"status":"archived"}` → `course.service.ts:124`, which validates only the *publish* direction) or unpublishes the lesson (`PATCH /api/admin/lessons/{L} {"isPublished":false}` → `lesson.service.ts:58`, unconditional). The student submits. The transaction claims the attempt, grades every question, persists every mark — then line 231 matches no row and throws. Nothing catches it, the whole transaction rolls back, and the student receives a bare 404 reading "lesson not found." Every retry is byte-identical. On a timed quiz, `quiz-runner.tsx:189` (`onTimeUp={() => void submitOnce()}`) fires this automatically with zero student action, and `OverdueService.sweep` then re-selects the attempt every 60 s forever, hitting the same wall through `closeOverdue`.

**Corrections from refutation.** The student's *answers* survive — they were committed by earlier autosave transactions; only this submit's grading writes roll back. And re-publishing the lesson or course makes the next submit succeed. So the accurate framing is "permanently stuck attempt plus a per-minute sweeper error loop, recoverable only by an admin undoing the publication change," not "exam unrecoverably lost." The perpetual sweeper loop is also confined to timed quizzes whose `overdueHandling` is not `autoabandon`. It is still critical: nothing in the product tells anyone why, and the quiz admin surface (`reopen`/`grantExtraTime`/`grantExtraAttempt`) cannot fix it.

`AppealsService.applyOutcome` (`appeals.service.ts:171`) carries the same exposure — an admin accepting an appeal on an archived course loses the mark rewrite, the regrade event, the recomputed score and the appeal resolution together.

**Fix.** The caller has already authorized the request; a progress write inside an already-authorized grading transaction must not re-run an entitlement check. Remove `access.require` from `recordQuizResult` and have it take the already-resolved `enrollmentId`/context from the caller. Deliberate mid-attempt publication changes should be handled by an explicit policy (refuse to unpublish with live attempts, or drain them), not by an incidental 404 from a progress write.

---

### B3 — HIGH — `attempt_events.created_at` stores Africa/Cairo local time while every other timestamp stores UTC

**`apps/api/src/modules/quiz/attempt-events.service.ts:31`**

The raw INSERT column list is `("attempt_id","attempt_question_id","seq","kind","payload","actor_id")` — `created_at` is omitted, so it falls through to the migration's `DEFAULT CURRENT_TIMESTAMP` (`20260726150032_attempts/migration.sql:76`). Postgres casts that `timestamptz` into the naive `timestamp(3)` column through the **session** timezone, which on this deployment is `Africa/Cairo` (server-level GUC, `source = configuration file`; `pg_db_role_setting` sets no timezone for `ayman_runtime`, and `DATABASE_URL` carries no `options=-c timezone`). Every other timestamp in the schema is supplied by Prisma as a true UTC instant.

**Verified on the live database.** One appeal and its own `appeal_opened` event, written by the same application transaction: `grade_appeals.created_at = 2026-07-27 15:02:34.772`, `attempt_events.created_at = 2026-07-27 18:02:34.772` — identical milliseconds, exactly +3 h. `max(attempt_events.created_at)` sits three hours in the future of `now() AT TIME ZONE 'UTC'`, while every other table's max is coherent.

**Worse than a uniform offset.** 51 of 53 rows are skewed; rows written on 2026-07-26 (ids 1 and 117) are clean, because the server GUC was UTC then. So the append-only ledger already contains rows on two different clocks, which cannot be mechanically backfilled without knowing the exact instant the config changed. And migration `20260726150111` does `REVOKE UPDATE, DELETE ON "app"."attempt_events" FROM "ayman_runtime"` plus a `BEFORE UPDATE OR DELETE` trigger, so the runtime role cannot repair these rows at all.

**Correction from refutation.** At `0618449` nothing in production *reads* `attempt_events.created_at` — every reference outside `generated/` and specs is a write. The wrong-output consequence (an admin timeline placing every event three hours after the attempt it records) is prospective, arriving with Plan 6. The present harm is that the ledger whose own migration comment calls its integrity "the property that makes a regrade defensible" is being permanently corrupted right now, and every day of delay adds rows.

**Fix.** Add `created_at` explicitly as `(now() AT TIME ZONE 'UTC')`, exactly as `overdue.service.ts:56`, `heartbeat.service.ts:76` and `content/reorder.sql.ts:69` already do — those three sites carry comments naming this exact hazard. Then an owner-role migration to backfill the skewed range, using the id boundary (skew starts at id 8729) to distinguish the two clocks.

---

### B4 — HIGH — practice-mode review hands over every question's model-answer explanation before the student answers anything

**`apps/api/src/modules/quiz/serializers/review.serializer.ts:132`**, reachable via **`apps/api/src/modules/quiz/attempt.service.ts:556`**

`AttemptService.review`'s WHERE clause is `{ id: attemptId, userId }` — no `submittedAt`, no `state` predicate, unlike `submit` (`:505`) and `checkAnswer` (`:960`), which both pin `submittedAt: null, state: {in: [...]}`. An unsubmitted attempt therefore resolves, `resolveReviewWindow` returns `'during'`, and `DEFAULT_REVIEW_OPTIONS_PRACTICE.during` sets `generalFeedback: true` (`quiz-settings.ts:60-68`). `nothingVisible` is false, so the response is `locked: false` with every question serialized.

Line 132 gates `generalFeedbackHtml` on the window flag **alone**. There is no per-question condition on `row.state`, `row.gradedAt` or `row.response` — unlike `feedbackHtml`/`rightAnswerText`, which are columns on `attempt_questions` written only at grade time and are therefore *incidentally* gated by being null. `generalFeedbackHtml` comes from `row.version` (the question bank) and is always populated.

**Failure.** Practice mode is the default in `QuizSettingsSchema`, in `schema.prisma`, and in the admin create page. A student POSTs `/api/quiz/quizzes/{quizId}/attempts`, then immediately GETs `/api/quiz/attempts/{attemptId}/review` (or just opens the review URL in a second tab — the page has no in-progress guard). The response carries `correctness: "unanswered"` *and* `generalFeedbackHtml` — the author's «الشرح العام» explaining the correct answer — for every question. `review-question.tsx:158-161` renders it verbatim. A skeptic executed the unmodified serializer from `0618449` against a row in exactly the state `start()` leaves it and confirmed the payload.

This bypasses both intended controls: `checkAnswer` refuses an unanswered question (`not_answered`, `attempt.service.ts:1015`) and locks it afterwards via `gradedAt`. Layer 3 cannot catch it either — the review route deliberately carries no `@NoAnswerLeak()` (documented at `attempt.controller.ts:88`), even though `generalFeedbackHtml` is itself in `FORBIDDEN_ANSWER_KEYS`.

The code documents the opposite intent in four places: `quiz-settings.ts:56-58` ("the model answer is still withheld until submission — otherwise practice is just an answer key with extra steps"), the admin label «الشرح بعد الإجابة» — literally *the explanation **after** the answer* (`ar.ts:397`), `learner.serializer.ts:5-6`, and the field's membership in the forbidden-key set.

**Scope.** Graded mode is unaffected (`DEFAULT_REVIEW_OPTIONS_GRADED.during` is all-false → correctly `{locked: true}`). The leak only fires where the author actually filled the optional explanation field.

**Fix.** Add the per-question gate the intended path already enforces: emit `generalFeedbackHtml` only when `row.response != null || row.gradedAt != null`. Better, refuse `review()` on an unsubmitted attempt entirely and let `checkAnswer` be the only during-window feedback vehicle — the `during` flags were designed for the single just-checked question `checkAnswer` passes to `toReviewQuestion` at `:1046`, not for the whole paper at once.

---

### B5 — HIGH — every toast in the student area is a silent no-op

**`apps/web/app/(app)/layout.tsx`** (no mount) — symptom at **`apps/web/components/quiz/quiz-runner.tsx:131`**

`<Toaster/>` is rendered exactly once, at `app/(admin)/layout.tsx:48`. The root layout mounts none; `app/(app)/layout.tsx` is a bare `return children`. `(app)` and `(admin)` are sibling route groups, so the admin layout is provably not an ancestor of `/quizzes/*`. Verified in sonner 2.0.7's source: `publish` is `this.subscribers.forEach(...)` and `subscribers` is populated only by a mounted `<Toaster/>`; `useSonner` never replays `ToastState.toasts`, so nothing is buffered for a later mount. With zero subscribers, `toast()` returns an id, renders no DOM, creates no `aria-live` region, and never throws.

Five reachable call sites sit outside the admin tree:

- `quiz-runner.tsx:131` — submit failed (any non-409). `apiPost` throws on any non-ok response.
- `quiz-runner.tsx:127` — 409 already-submitted (least harmful; line 128 immediately navigates to review).
- `quiz-runner.tsx:156` — practice-mode "check answer" failure. The spinner stops and **literally nothing else changes on screen.**
- `appeal-dialog.tsx:38` — appeal submitted *successfully*. The dialog closes with zero confirmation, and because `review/page.tsx:115` passes no `onSubmitted` prop, nothing refreshes, so the "فتح تظلم" button still reads as available. The student re-clicks, gets a clean 409 from `appeals.service.ts:83`, and **that** toast is also dropped — a silent loop.
- `appeal-dialog.tsx:43` — appeal failed.

**Worst path.** On a timed quiz, `quiz-runner.tsx:189` auto-submits at the deadline with no dialog. If that POST 500s, `quiz-timer.tsx`'s `firedRef` guarantees `onTimeUp` never fires again, so there is no retry, and the swallowed `toast.error` was the only feedback that existed.

**Correction from refutation.** On the *manual* path the submit dialog does not close on failure — `SubmitDialog.confirm` only resets `submitting` in its `finally` and never calls `onOpenChange` — so the student is left staring at an open dialog with the confirm button re-enabled. That is an unlabelled implicit signal, not "zero indication." The auto-submit and check-answer paths genuinely have none.

**Fix.** Move the single mount from `app/(admin)/layout.tsx` to `app/layout.tsx`. Do **not** add a second — the admin layout's own comment is correct that two mounts render every toast twice. While there, pass `containerAriaLabel` from `@ayman/contracts` (see M5).

---

### B6 — HIGH — catastrophic regex backtracking in the short-answer grader blocks the event loop inside the grading transaction

**`apps/api/src/modules/quiz/grading/wildcard.ts:42`**

Every non-escaped `*` becomes an unbounded `.*` in a single anchored expression built with `new RegExp(...)` and run through `.test()` — no step limit, no length guard, no worker isolation, synchronous on the main event loop. The student's text is capped only at 20,000 characters (`dto/save-answers.dto.ts:12`) and is stored and re-read verbatim (`attempt.service.ts:418`, `:889`). The instructor's pattern is `z.string().min(1)` with no max length and no wildcard-count cap (`packages/contracts/src/quiz/question.ts:48`). `settings.maxWords` is display-only — `learner.serializer.ts:126-128` projects it to the UI and nothing enforces it server-side.

Reached from `grade-question.ts:81`, inside `gradeAndFinalise`, inside `submit`'s `$transaction` (`attempt.service.ts:501`). Also reachable from practice-mode `checkAnswer` (`attempt.service.ts:985`), which is cheaper to abuse because it does not consume the attempt.

**No adversarial instructor is required.** Measured on this machine with the exact ported implementation:

| pattern | answer | time |
|---|---|---|
| `*for*loop*end*` | 20,000 chars of repeated "forloop" | **29.0 s** |
| `*قانون*نيوتن*الأول*` | 20,000 chars | **50.6 s** |
| `*for*loop*end*done*` | 3,900 chars | 6.3 s |
| `*a*b*c*d` | 8,000 chars | 44.2 s |
| `*a*a*a*a*a*b` | 150 chars | 36.1 s |
| `*for*` (control) | 20,000 chars | 0.1 ms |

Three wildcards — the canonical "the answer must mention X, then Y, then Z" — is enough. The student does not need to see the pattern; the stem names the expected words, and repeating them while omitting one is enough. Meanwhile a Prisma transaction holds the `quiz_attempts` row lock with `submittedAt` already written, the transaction's own 5 s timer is itself starved by the blocked loop, and the in-memory throttler cannot run either.

**Fix.** Three cheap layers: cap the graded slice for `short_answer` (2,000 chars is generous), cap wildcard count and pattern length at authoring time in `PatternOptionSchema`, and — best — replace the regex with a linear two-pointer glob matcher, which is a 20-line function with no backtracking at all. The `wildcard.spec.ts:68` "does not let a pattern escape into a catastrophic regex" test should be rewritten: its `'***'` pattern compiles to `/^.*.*.*$/`, which is linear and matches on the first greedy pass, so it proves nothing.

---

### B7 — HIGH — the scoring denominator is read live and never snapshotted, so the paper and the divisor can disagree

**`apps/api/src/modules/quiz/grading/grade-attempt.ts:43`** — `roundMark((rawScore / quiz.sumMarks) * quiz.gradeOutOf)`

The numerator comes from the attempt's own snapshotted `attempt_questions.maxMark`. The denominator is looked up live from `quizzes.sum_marks` at `attempt.service.ts:814` (and again at `:665` in `recomputeScoreTx`). `QuizAttempt` has no `sumMarks`, `gradeOutOf` or `passPercent` column. Two independent triggers make them diverge:

**Trigger A — edit during an attempt.** `QuizBuilderService.addSlot` (`:159`), `addPool` (`:181`) and `removeSlot` (`:220`) call `recomputeSumMarks` with no `isPublished` check and no in-flight-attempt check, and the admin quiz page renders `AddSlotDialog`/`AddPoolDialog`/`RemovableSlotList` unconditionally alongside the publish button. Student starts a 2-slot × 5-mark quiz (`sumMarks=10`, `passPercent=70`); instructor adds a third 5-mark slot; `sumMarks=15`. The student answers both questions they were shown perfectly: `rawScore=10`, `scaledScore = roundMark((10/15)*100) = 66.66667`, `passed: false`. **A perfect paper fails.** Removing a slot inverts it: `grade-attempt.ts:41` clamps only the lower bound, so `(10/5)*100 = 200` is stored in `scaled_score Decimal(10,4)` and served to the student.

**Trigger B — a paper that could never add up.** `resolveSlots` skips a fixed slot whose bank entry has no `ready` version (`attempt.service.ts:1088`, `if (!version) continue`) and under-fills a pool via `shuffle(candidates).slice(0, pickCount)` (`:1111`), while `recomputeSumMarks` already counted both at full value. `publish()`'s `slot_has_no_ready_version` / `pool_cannot_fill_pick_count` preflight only runs on an explicit re-publish — and `publish-quiz-button.tsx:37` renders a static badge once published, so that preflight becomes permanently unreachable for that quiz. Fully UI-reachable: add a pool to an already-published quiz whose category holds fewer ready questions than `pickCount` (`add-pool-dialog.tsx` posts `sourceFilter: {}` with `pickCount` defaulting to 5, `min={1}` and no max).

**Also exposed.** `passPercent` and `gradeOutOf` are written by `upsertForLesson` (`quiz-builder.service.ts:55`) and read live at grade time, so the same drift applies to the pass threshold — despite that method's doc comment claiming it "Never touches an in-flight attempt." And `recomputeScoreTx` re-reads current values, so resolving an appeal months later silently rescales the original attempt against whatever the quiz looks like now.

**This is an oversight, not a trade-off.** `schema.prisma:1157-1159` documents the correct invariant for `deadlineAt` in so many words: *"PERSISTED AT START AND NEVER RECOMPUTED. An instructor editing `durationSeconds` must not shorten or extend an in-flight attempt."* The same discipline was applied to `questionVersionId`, `optionOrder`, `maxMark`, `minFraction` and `maxFraction`. It was not extended to the scoring triple.

**Fix.** Snapshot `sumMarks`, `gradeOutOf` and `passPercent` onto `quiz_attempts` at `start()`, and have `resolveSlots` compute the stored `sumMarks` from what it *actually resolved* rather than from the quiz's declared total. Add an upper clamp on `scaledScore` as a belt-and-braces guard, and refuse slot/pool mutation on a quiz with live attempts.

---

### B8 — HIGH — `1/n` option weights truncate through `numeric(10,6)`: a 3-correct question can never be published, and if imported, grades a perfect answer as "partial"

**`apps/api/src/modules/quiz/question-bank.service.ts:41`** (write) → **`:182-187`** (publish re-validation) and **`apps/api/src/modules/quiz/grading/fraction.ts:23`** (grading)

Both authoring paths emit `1/n` at full double precision: `option-rows.tsx:65` (`share = 1 / tickedIds.size`, wired to the correctness checkbox in the primary admin form) and `import.ts:185` (`share = 1 / correctIndexes.length`). `optionRows` writes `fraction: option.fraction` verbatim; the column is `Decimal(10, 6)`. Verified on the live DB: `SELECT 0.3333333333333333::numeric(10,6)` → `0.333333`. Draft validation passes because `1/3 + 1/3 + 1/3 === 1` exactly in IEEE-754.

**Symptom A — the question can never go live.** `publish()` re-validates the *stored* rows through `QuestionInputSchema`. Three stored `0.333333` sum to `0.999999`, and `|0.999999 - 1| = 1.0000000000287557e-6`, which is not `< WEIGHT_EPSILON` (1e-6). `safeParse` fails and the endpoint 400s with «مجموع أوزان الإجابات الصحيحة لازم يساوي 1» — a message that does not describe the actual failure. Reproduced against the real schema for **n = 3, 6, 9, 12, 13**. It is worse than a dead end at publish: `admin/questions/[bankEntryId]/page.tsx:18` parses the hydrated draft through the same schema, so after `create()` succeeds the form's `router.push` lands on a page that throws a ZodError hydrating the draft it just saved. The instructor never even sees the publish button. (An obscure workaround exists: the «وزن الاختيار» raw-weight disclosure accepts hand-typed `0.34 / 0.33 / 0.33`, which sums cleanly.) `duplicate()` copies the already-truncated values, so a duplicate is equally unpublishable.

**Symptom B — the same question grades wrong if it gets in.** `bulkImport` (`question-bank.service.ts:405`) flips `status` to `ready` with a direct UPDATE, bypassing `publish()` entirely — which is exactly how such a question reaches the runner. A student ticks all three correct options; `grade-question.ts:65` sums them and `0.333333 + 0.333333 + 0.333333 === 0.999999` exactly; `fraction.ts:23` tests `fraction > RIGHT_THRESHOLD` where `RIGHT_THRESHOLD = 0.999999`, which is false, so `fractionToState` returns `graded_partial`. The review page renders the orange «إجابة صح جزئيًا» chip on a perfectly answered question, and `passed` is false at `passPercent: 100`. Reproduced by executing the repo's own `gradeQuestion`/`gradeAttempt` against round-tripped values. Affected: **n = 3, 9, 12** (n = 6 sums to 1.000002 and is rescued by the clamp; n = 7 and 11 survive only by floating-point luck — the pass/fail boundary is decided by accumulation noise, which is its own argument for fixing this).

`fraction.spec.ts:29` asserts `fractionToState(RIGHT_THRESHOLD) === 'graded_partial'`, locking in the exact failing boundary. No test anywhere round-trips a fraction through the `numeric(10,6)` column before grading or publishing it.

**Fix.** Quantize at write time: round each weight to 6 dp and give the largest correct option the remainder, so the stored values sum to exactly `1.000000`. Independently, change `fraction.ts:23` from `> 0.999999` to `>= 1 - WEIGHT_EPSILON` (or quantize before comparing) — Moodle can use `> 0.999999` safely only because it stores fractions at 7 dp.

---

### I1 — IMPORTANT — `closeOverdue` writes unconditionally by id, so the sweeper can clobber an attempt the student just submitted

**`apps/api/src/modules/quiz/attempt.service.ts:735`** (and **`:727`**)

`closeOverdue` reads with a plain `findFirst` (`:720`, no `FOR UPDATE`) and then writes with `where: { id: attemptId }` — no `state`, no `submittedAt` predicate. Its own doc comment (`:713-716`) claims it "Claims the attempt with the same conditional `updateMany` shape as `submit()` (minus the token)." It does not. Under READ COMMITTED (verified: `SHOW default_transaction_isolation` = `read committed`, no `isolationLevel` anywhere in the repo), the blocked UPDATE re-evaluates its WHERE against the new row version — `id = $1` always matches — and proceeds.

The two paths genuinely contend because `submit` has **no deadline predicate**: `saveAnswers` enforces the hard stop at `:375-383`, but `submit` (`:505-514`) accepts an attempt already past deadline + extra time + grace, which is precisely the population `overdue.service.ts:47-58` selects.

**Worst case is the `autoabandon` branch** (`:727-730`), which carries the same unguarded write and is not idempotent: the student submits and is graded 18/20 with `state: 'submitted'`, and the sweeper stamps `state: 'abandoned'` over it while the scores stay populated. `quiz_attempts_submitted_state_consistent` explicitly permits `abandoned` with a non-null `submitted_at`, so nothing stops it. Downstream, `analytics.service.ts:57-61` excludes it from mean/median/pass rate and the admin list renders it "abandoned" for a student who actually submitted and passed.

On the `autosubmit` branch the damage is narrower than first claimed: the score does not change (re-grading identical responses is deterministic) and `recordQuizResult` early-returns on an identical outcome. What is destroyed is `submitted_at` (feeding `retryCooldownHours` at `:186-203` and `resolveReviewWindow`), plus permanent duplicate `autosubmitted` and per-question `graded` rows in a table the runtime role cannot clean.

Related: `OverdueService.sweep` holds `pg_try_advisory_xact_lock` only inside the candidate-selection transaction, which commits before the grading loop runs — so the stated "a second replica no-ops instead of double grading" property does not hold either.

**Fix.** Make `:727` and `:735` `updateMany` carrying `{ submittedAt: null, state: { in: ['in_progress','overdue'] } }` and bail when `count === 0`, exactly as `:505-519` already does. Move the advisory lock to wrap the grading loop.

---

### I2 — IMPORTANT — `saveAnswers` and `submit` take row locks in opposite orders, and the runner fires both concurrently by construction

**`apps/api/src/modules/quiz/attempt.service.ts:437`** vs **`:505`/`:907`**, plus **`apps/api/src/modules/quiz/attempt-events.service.ts:35`**

`saveAnswers` locks `attempt_questions` first (`:411`) and `quiz_attempts` last (`:437`, unconditional, outside the loop). `submit` locks `quiz_attempts` first (`:505`) and `attempt_questions` last (`:907`). ABBA. The relation filter at `:415` does not serialize anything — it compiles to a non-locking subquery that, under READ COMMITTED, sees the pre-submit row and passes.

A second edge closes the same cycle: `AttemptEventsService.append` computes `COALESCE(MAX("seq"),0)+1` inside the caller's transaction against `@@unique([attemptId, seq])`, so overlapping save and submit compute the same `seq` and the second inserter blocks on the first's uncommitted index entry. That widens the window from a microsecond race to essentially the whole submit transaction.

**The client guarantees the overlap.** `quiz-runner.tsx:189` is `onTimeUp={() => void submitOnce()}` — the timer path reaches `submit()` with no prior flush, so `:117` dispatches `PUT /answers` (unawaited) and `:119` dispatches `POST /submit` in the same tick. `setAnswer` only marks dirty and flushes are 15 s / nav / blur, so any answer touched in the final seconds is still pending. That is the modal state at the end of a timed exam.

**Outcome.** Postgres raises 40P01 after `deadlock_timeout` and kills one side. If submit is the victim: `PrismaClientKnownRequestError` is not an `HttpException`, so `AllExceptionsFilter` returns a bare 500; `quiz-runner.tsx:126` special-cases only 409, so the student gets the generic `saveFailed` toast — which renders nothing (B5) — and the attempt stays `in_progress` with the clock running. If the save is the victim: `use-attempt-autosave.ts:117` treats only 409 as stale, so it enters exponential backoff against a now-submitted attempt. Partial mitigation: `OverdueService` eventually grades it, but only after deadline + grace fully elapses.

`closeOverdue` (`:735` → `:907`) uses the same `quiz_attempts`-first order, so the inversion is also reachable server-side with no client involvement.

**Fix.** Move the `lastActivityAt` write in `saveAnswers` to the **top** of its transaction, before the `attempt_questions` updates, so both paths acquire `quiz_attempts` first. Independently, allocate `seq` from a per-attempt sequence or take `pg_advisory_xact_lock(attemptId)` in `append`, and add a P2034/40P01 retry with a mapped 409/503 so the student never sees a bare 500 at the buzzer.

---

### I3 — IMPORTANT — `GET /attempts/:id/review` has no enrollment or publication gate

**`apps/api/src/modules/quiz/attempt.service.ts:556`** — `where: { id: attemptId, userId }`

Ownership only. `review()` never calls `LessonAccessService.require` and, unlike `start`/`resume`, never calls `assertCanAttempt`. This contradicts the contract stated in the same module: `quiz-access.service.ts:50-53` says *"Every non-attempt quiz read (`GET /api/quiz/lessons/:lessonId`, **review**, history) routes through `LessonAccessService.require(userId, lessonId)` directly."* `getLessonOverview` honours it at `:123`; `review` does not. `AttemptService` does not even import `LessonAccessService`.

`QuizAttempt` has no FK to `Enrollment`, so revocation (a status change, not a delete) leaves the row fully readable. `ACTIVE_ENROLLMENT_STATUSES` is `['active','completed']`, so after an admin sets `enrollment.status = 'revoked'` (or the course goes to `draft`, or the lesson to `isPublished: false`), `GET /api/quiz/lessons/{lessonId}` 404s while `GET /api/quiz/attempts/{attemptId}/review` still returns 200 with the full payload — `stemHtml` and `options` unconditionally (they are in the base payload, before any flag test), plus `rightAnswerText`, `feedbackHtml` and `generalFeedbackHtml` in the `afterClose` window, which is `allFlags(true)` in both defaults.

**Strongest variant — a genuinely new disclosure, not just retained access.** A graded quiz with `openUntil` in the future: the student sits it, submits, and during `laterWhileOpen` the graded default is `rightAnswer: false`, so they have *never* seen the model answer. The admin then unpublishes the lesson. After `openUntil` passes, the same student re-requests review with their existing session, the window resolves to `afterClose = allFlags(true)`, and they receive `rightAnswerText` for every slot — data they were never entitled to see while enrolled, delivered *after* access was revoked. For a question bank reused next term that is the whole paper.

`AppealsService.open` (`:67`) and `listForStudent` (`:344`) have the same ownership-only shape; they leak far less (marks and resolver notes, not stems), but a revoked student can still open new appeals.

**Fix.** Call `this.access.require(userId, lessonId)` at the top of `review()`, matching `getLessonOverview`. Same for the two appeals methods.

---

### I4 — IMPORTANT — deleting a lesson/section/course that has any attempt fails with an opaque 500, permanently

**`apps/api/src/modules/content/lesson.service.ts:163`** (also `section.service.ts:58`, `course.service.ts:157`)

Verified on the live database: the FK chain `courses → course_sections → lessons → quizzes → quiz_attempts → attempt_events` is `ON DELETE CASCADE` at every hop (`confdeltype='c'` for all six), and `attempt_events_append_only` is an enabled `BEFORE DELETE OR UPDATE ... FOR EACH ROW` trigger (`tgtype=27`) whose function raises unconditionally. Postgres fires user row triggers on rows removed by an RI cascade. `attempt.service.ts:245` appends `attempt_started` in the same transaction that creates every attempt, so any started attempt guarantees at least one event row.

`LessonService.remove` has **no** guard at all — not even a publish check — so `DELETE /api/admin/lessons/:id` on a quiz lesson of a live published course 500s immediately. `CourseService.remove` checks only `status !== 'published'`, and its refusal message tells the admin to "unpublish before deleting," which then also fails. The Prisma error is not an `HttpException`, so `AllExceptionsFilter` returns a bare `{"statusCode":500,"message":"Internal server error"}`. The runtime role has `UPDATE, DELETE` revoked on `attempt_events` and is blocked by the trigger, so there is no in-app remediation.

**The repo already proved this to itself.** `schema.spec.ts:79-87` must run `ALTER TABLE "app"."attempt_events" DISABLE TRIGGER` as the owner role before executing, at line 85, the identical `tx.course.delete({ where: { id: courseId } })` call that `CourseService.remove` makes. Its comment at `:16-18` states the mechanism verbatim. `quiz-fixtures.ts:238` does the same dance. The workaround was solved in test code and never carried into the service layer.

To be clear: the trigger refusing to erase graded history is **correct and deliberate**, and a production path must never work around it. The defect is the missing pre-check and the unmapped error.

**Fix.** Pre-check for existing attempts in all three `remove` methods and throw `ConflictException` with an actionable Arabic message. Optionally add a `PrismaClientKnownRequestError` filter so DB-level refusals never surface as a naked 500.

---

### I5 — IMPORTANT — `--ok`/`--err`/`--warn`/`--info` are never redefined for light mode; the exam countdown sits at 2.19:1

**`packages/ui/src/tokens/color.css:22-25`**

The four semantic tokens are declared once, in the light `:root` block, and appear in **neither** dark block (`47-63`, `66-81`) — unlike every `--n-*` and `--a-*` token, which are redefined per theme. They were tuned against a near-black background. `globals.css:23-26` maps them straight through, so `text-warn` is literally `var(--warn)` in both themes.

Computed sRGB / WCAG ratios (independently reproduced by two skeptics with their own OKLCH→sRGB converters, matching to two decimals):

| usage | ratio | required |
|---|---|---|
| `text-warn` — last-5-minutes countdown, `quiz-timer.tsx:125`, 17 px regular | **2.19:1** | 4.5:1 |
| `text-warn` — grace countdown, `quiz-timer.tsx:112`, 15 px | **2.19:1** | 4.5:1 |
| `text-ok` — «صحيح» verdict, `review-question.tsx:41` | 2.63:1 | 4.5:1 |
| `Badge tone="ok"` over its own 8% tint — every dashboard score, `recent-scores.tsx:35`, 12 px | 2.36:1 | 4.5:1 |
| `text-err` — every form error in the product (11 sites) + `button.tsx:18` danger | 3.91:1 / 3.77:1 | 4.5:1 |
| `border-ok` marking the correct option, `review-question.tsx:118` | 2.54:1 | 3:1 (1.4.11) |

Dark mode passes everywhere (4.75:1 worst case), which is why this was never noticed. Light mode is the default for any light-preference OS, and the theme toggle offers it explicitly. **A student on a light-mode phone in daylight cannot read the amber countdown during the exact five minutes it exists to warn them about.**

`tokens.test.ts` asserts token presence and naming and even has a luma helper, but no test resolves a token to a colour or computes a contrast ratio, and its "dark blocks are byte-identical" test compares the two dark blocks *to each other* — precisely the shape that omitting a token from both will pass.

**Correction.** `text-accent` on the lesson-complete check (`course-outline.tsx:65`, 2.07:1) is a *separate* bug — `--a-9` **is** redefined per theme; it fails because step 9 is the solid-background step of the Radix contract while step 11 (`--a-11`, 5.57:1) is the text step. Fix it in the same pass, but it is a wrong-ramp-step issue, not a missing override.

**Fix.** Add `--ok/--err/--warn/--info` to both dark blocks with dark-tuned values, and retune the light values to clear 4.5:1 on `--n-1`/`--n-2` (and 3:1 for `border-ok` against `bg-surface-2`). Add a token contrast test — the ratio math is 20 lines and would have caught all six rows above.

---

### I6 — IMPORTANT — question-navigator arrow keys move focus opposite to the arrow under `dir="rtl"`

**`apps/web/components/quiz/question-navigator.tsx:44-51`**

The grid is `grid grid-cols-8` (`:67`) inside `<html lang="ar" dir="rtl">` (`layout.tsx:29`), with no `dir` override anywhere on the path, so CSS Grid places column 1 at the **right**: Q1 rightmost, Q2 to its left. The handler hardcodes `ArrowRight → move(index + 1)` and `ArrowLeft → move(index - 1)`, and calls `preventDefault()` on both, so no native behaviour can compensate.

Focus Q1, press **Left** (the key pointing at Q2) → `move(-1)` clamps to 0, focus does not move. Press **Right** → focus jumps to Q2, on the left. Every horizontal arrow is inverted, for every keyboard user, on the default configuration (`navMethod` defaults to `free` in both `schema.prisma:1021` and `quiz-settings.ts:111`).

The comment at `:38-42` asserts "the browser already handles for us: ArrowRight advances in LTR reading order and ArrowLeft in RTL." That is a false premise, not a stated trade-off: `KeyboardEvent.key` derives from the physical key and keyboard layout, never from CSS `direction`. The browser's RTL arrow reversal applies to caret movement in editable text and native scroll containers only. WAI-ARIA APG is explicit: *"In right-to-left languages, the direction of the arrow keys is reversed."*

**Correction.** The claim's Home/End assertion is wrong and is dropped — `move(0)` / `move(length-1)` are logical first/last, which is correct in both directions. Only the horizontal arrows are defective. (Separate gap: there is no ArrowUp/ArrowDown handling at all in an 8–10 column grid; vertical arrows fall through and scroll the page.)

The ESLint rule cannot see this — `packages/config/eslint/rules/no-physical-direction.js` inspects Tailwind class strings via `PREFIX_MAP`/`EXACT_MAP` and structurally cannot flag `case 'ArrowRight'`. There is no test file for the component.

**Fix.** Swap the two cases (or multiply the delta by the document direction). The codebase already knows the pattern — `dialog.tsx:42` carries an explicit `rtl:translate-x-1/2` with a comment about exactly this hazard.

---

### I7 — IMPORTANT — `aria-live="assertive"` on a per-second countdown makes the last five minutes unusable with a screen reader

**`apps/web/components/quiz/quiz-timer.tsx:124`** (and **`:112`**)

`role="timer"` carries an implicit `aria-live="off"` precisely to prevent this, but an author-supplied `aria-live` overrides the implicit value. At `totalSeconds <= 300` the region flips from `"off"` to `"assertive"` over text that changes once per second (React dedups the identical string, so ~300 announcements, not the ~1,200 the 250 ms tick would suggest — the rate correction does not change anything).

A blind student on a 30-minute graded attempt reaches T−5:00 and from then on every announcement **interrupts** whatever is being read. The question stem and every option are cut off mid-sentence, on repeat, for the whole warn window — during the period they most need to work fast. The grace-period region at `:112` is unconditionally assertive over `graceRemaining`, which also ticks per second, with `graceSeconds` defaulting to 60. The two windows chain into ~360 consecutive interrupts, the last 60 landing while the student is trying to hear the submit dialog.

This is a house-style violation, not a considered choice: every other live region in the repo is `polite` (`quiz-runner.tsx:181`, `field.tsx:157`, `slot-list.tsx:109`, `sortable-lesson-list.tsx:90`, `course-editor.tsx:38`), and the plan document for the timer specifies only the visual `--warn` behaviour and never mentions `aria-live`. `isWarn` — a colour-token predicate — was reused to drive an announcement policy that was never specified.

**Fix.** Drop the attribute entirely (`role="timer"`'s implicit `off` is correct) and add a separate `aria-live="polite"` region that announces discrete milestones — 5 minutes, 1 minute, 30 seconds, time up. `quiz-timer.test.tsx` has six cases and asserts on none of this.

---

### I8 — IMPORTANT — the correct MCQ option is marked with colour alone

**`apps/web/components/quiz/review-question.tsx:118`**

Each option `<li>` (`:113-127`) carries exactly two props — `key` and `className` — and one child, `<RichText>`. Correct gets `border-ok` plus an 8% green tint; the student's wrong pick gets `border-err` plus a red tint; merely-chosen gets `border-accent`. No text marker, no icon, no `aria-label`, no `aria-current`. All four branches share the same `rounded-sm border p-3` base, so even border *width* is identical — hue is the only channel. A grep for `aria-|role=|sr-only` in that file returns zero hits, and the page renders no legend.

`rightAnswerText` — the string that names the correct option in words — is rendered only in the **else** branch for short_answer/essay (`:142-147`), so choice questions never emit it to the DOM at all; it is consumed purely as a `Set` lookup feeding a CSS class.

A red-green colour-blind student (~8% of males, this platform's core demographic) or any screen-reader user opens the review of an MCQ they failed and gets four undifferentiated option texts with no indication of which was right — on the screen whose entire purpose is telling them. Compounded by I5: in light mode that green border is 2.54:1 against the card, below the 3:1 non-text minimum.

**The codebase's own sibling component does it correctly.** `question-view.tsx:195-217` (practice-mode check panel, fed by the *same* `toReviewQuestion`) renders a check/cross SVG **plus** a text label, and prints the model answer as literal text: `<span>{copy.quiz.rightAnswer}: </span>{checkResult.rightAnswerText}`. The review screen is the only place in the quiz UI that dropped both.

The default review settings make this the ordinary path, not an edge case: `immediatelyAfter` is `allFlags(true)` for both practice and graded.

**Fix.** Port `question-view.tsx`'s treatment: an aria-hidden icon plus a visible text marker on the correct row, and render `rightAnswerText` as words for choice questions too.

---

### I9 — IMPORTANT — `rightAnswerText` is joined and re-split on «، », so an option containing an Arabic list comma highlights the wrong answer

**`apps/api/src/modules/quiz/attempt.service.ts:91`** (join) / **`apps/web/components/quiz/review-question.tsx:81`** (split)

`describeRightAnswer` joins the stripped bodies of every positive-credit option with `copy.quiz.answerListSeparator` — «، », U+060C plus a space (`ar.ts:352`) — with no escaping. The client splits that string back apart and matches options by `stripHtml` equality (`:111`). The round trip is lossy for any option whose own text contains that separator, which is the ordinary Arabic list comma. `ChoiceOptionSchema.bodyHtml` is `z.string().min(1)` with no character restriction, and `sanitizeRichText` (verified by running the repo's actual `sanitize-html` config) leaves U+060C byte-identical.

Reproduced with the real sanitizer and both `stripHtml` implementations (which are byte-identical on both sides):

- Correct option A = «القاهرة، الإسكندرية», distractor B = «القاهرة».
- Server sends `rightAnswerText = "القاهرة، الإسكندرية"`; client splits into `{"القاهرة", "الإسكندرية"}`.
- **A → `isCorrectOption: false`. B → `isCorrectOption: true`.** The distractor gets the green border. Because `isCorrectOption` is the first arm of the `cn()` ladder, it even overrides `border-err`, so a student who picked B sees their own wrong pick marked as the model answer.

**The more common variant is silent, not wrong.** Without a distractor that happens to equal a fragment, *nothing* is highlighted — and since `rightAnswerText` is never rendered as text for choice questions (I8), the model answer becomes entirely invisible. List-style Arabic options («الإسكندرية، بورسعيد») trigger this routinely.

Grading is unaffected — marks derive from option ids, never this string.

**Fix.** Ship the correct option **ids** in the review payload and drive the highlight off id membership; keep `rightAnswerText` as display prose only. `describeResponse` (`:103`) shares the same lossy join and is not currently affected only because the client reads `response.optionIds`; fix it at the same time.

---

### I10 — IMPORTANT — the item-analysis expand row is mouse-only, so distractor analysis is unreachable by keyboard

**`apps/web/components/admin/quiz/item-analysis-table.tsx:66`**

`<tr className="cursor-pointer …" onClick={() => setExpanded(...)}>` — no `tabIndex`, no `role`, no `onKeyDown`, no `aria-expanded`. A `<tr>` has no implicit tab stop, and line 67 is the only writer of the `expanded` state, so the panel gated at `:93` can never be opened without a pointer. That panel is the **only** surface for `distractorPicks` anywhere in the product (grep across `apps/web` and `packages` returns only the schema, the interface and this render), so the whole distractor-analysis feature is unavailable to a keyboard-only or screen-reader admin. WCAG 2.1.1 (A); also 4.1.2, since even a mouse-plus-screen-reader user gets no expanded/collapsed state.

The route is reachable — `/admin/quizzes/:id` and `.../attempts` both link to it with real focusable `<Link>`s — so the admin gets to the page and then hits a dead end.

Nothing would have caught it: `eslint-plugin-jsx-a11y` is absent from the repo (`packages/config/eslint/index.js` composes only `@eslint/js`, `typescript-eslint`, `react-hooks` and the custom `ayman/no-physical-direction` rule), and there is no test file for the component. This is an outlier against the codebase's own standard — `sortable-list.tsx:117` deliberately wires a `KeyboardSensor` with `sortableKeyboardCoordinates` for exactly this reason.

**Fix.** Put a real `<button aria-expanded>` in the first cell rather than making the `<tr>` interactive (`role="button"` on a `<tr>` would destroy table row semantics). Add `eslint-plugin-jsx-a11y` to the shared config.

---

### I11 — IMPORTANT — `SubmitDialog`'s preflight fetch has no `.catch`, so one failed request disables the confirm button

**`apps/web/components/quiz/submit-dialog.tsx:52`**

`void apiGet(...).then(...)` with no `.catch()` and no error state. `apiGet` throws on any non-2xx, on a fetch network rejection, and on schema mismatch. `setUnansweredCount` is called at exactly one place (`:53`) inside that uncaught `.then`, so on failure it stays `null`: `:78` renders `copy.common.loading` indefinitely and `:114`'s `disabled={submitting || unansweredCount === null}` keeps the confirm button dead. There is no retry affordance, no error message (and a toast would not render anyway — B5), and an unhandled promise rejection. `SubmitDialog` is rendered with no `key` and its `useState` lives above Radix's `DialogContent`, so the state survives.

**Corrections.** It is not literally permanent — the effect's deps are `[open, attemptId]`, so cancel-and-reopen refetches. Recovery is two clicks, undiscoverable but present. And a persistent backend outage would break `POST /submit` too, so the genuinely exploitable case is the **transient** one: one blip, the network heals in seconds, submit would now succeed, and the button stays dead. Note also that for an **untimed** attempt there is no auto-submit fallback at all (`QuizTimer` bails when `deadlineAt` is null), so the student is fully locked out until they guess to reopen the dialog.

This is an omission, not fail-closed design: `devices-list.tsx:30-36` and `lesson-player.tsx:26` both use `apiGet(...).then(...).catch(...)` with an error state, and `use-attempt-autosave.ts:116` has a full catch with 409 handling and exponential backoff. `submit-dialog.tsx` is the only `apiGet().then()` in `apps/web` without one.

**Fix.** Add `.catch(() => setError(true))` plus an inline error message and a retry button, and let the confirm button remain enabled on preflight failure — the count is advisory, and the server recomputes it anyway.

---

### M1 — MINOR — admin grants use read-modify-write, so a lost update leaves the append-only log contradicting the row

**`apps/api/src/modules/quiz/attempt-admin.service.ts:113`** (also `:141`, `:71`)

`grantExtraTime` reads `extraTimeSeconds` at `:104-107` **outside** the transaction, then writes the computed sum `attempt.extraTimeSeconds + seconds` at `:113` inside it. The row lock serializes the two transactions but the SET value is an app-computed constant, so Read Committed re-evaluation re-applies the stale sum. Two proctors each granting 300 s both read 0 and both write 300 — the attempt gains 300 s — yet both append an `extra_time_granted` event with `{seconds: 300}`. The log says 600 s; the column says 300; the student's hard stop fires five minutes before the audit trail claims. Same shape at `:141` (`extraAttempts + 1`, where `start()`'s allowance check then refuses an attempt the log says was granted) and at `:71` in `reopen` — where `ReopenAttemptSchema` defaults `extraSeconds` to 0, so a reopen concurrent with a grant can **erase** it rather than merely fail to add.

The `attempt_events` seq guard does not save it: the UPDATE precedes the append in all three methods, so the row lock fully orders the transactions and the second appender sees a committed `MAX(seq)`.

**Correction.** The claim's "no in-flight guard" is false — `attempt-actions.tsx` holds a `pending` flag with `disabled={pending}` and two of the three actions sit behind `window.confirm`, so the single-admin double-click vector is closed. Only two concurrent admins (or two tabs, or a direct POST) reach it, inside a few-millisecond window. Fails safe in the security direction: the student gets less time, never more.

**Fix.** `{ increment: seconds }` inside the transaction. `LessonProgressService.open` already uses `{ increment: 1 }` for `openCount`, and `attempt.service.ts:165` already uses `pg_advisory_xact_lock` for this class of race — the admin service is the outlier.

---

### M2 — MINOR — `roundMark` rounds to 5 dp but every mark column is `numeric(10,4)`

**`apps/api/src/modules/quiz/grading/fraction.ts:38-40`**

The doc comment states *"Marks are stored as numeric(10,4); rounding to five places before persisting keeps the in-memory value and the stored value identical."* Five places into a four-place column is one digit too many. `attempt_questions.mark`, `quiz_attempts.raw_score` and `quiz_attempts.scaled_score` are all `Decimal(10,4)`; verified live, `SELECT 33.33333::numeric(10,4)` → `33.3333`.

No exotic input needed: `grade-attempt.ts:43` is `roundMark((rawScore / sumMarks) * gradeOutOf)`, so three 1-mark questions with the default `gradeOutOf: 100` and one correct gives `33.33333` stored as `33.3333`. `POST /submit` returns the unrounded object (`attempt.service.ts:844`) while `GET .../review` returns the stored value — the same attempt reports two different scores on two endpoints. `attempt_events.payload` is JSONB and keeps the 5-dp value, so the append-only ledger permanently disagrees with the row it audits.

`fraction.spec.ts:65` actively enshrines it: `expect(roundMark(2 / 3)).toBe(0.66667)` under the title "rounds to five decimal places so stored marks are stable," asserting a value the database provably stores as `0.6667`.

**Corrections.** No student ever sees the divergence — `quiz-runner.tsx` parses the submit response with `z.object({ attemptId: z.string() })`, so zod strips the score, and every displayed number is a DB read. `recomputeScoreTx` rebuilds from the stored `fraction` (`numeric(10,6)`, which round-trips exactly), never from the stored `mark`, so the truncation is idempotent and cannot drift or flip pass/fail. And the claim's "lesson progress and the attempt record disagree" is a *different* issue (a 0..1 ratio into `numeric(5,4)`) that fixing `roundMark` would not touch.

**Fix.** One character: round to 1e4. Update the spec and the doc comment.

---

### M3 — MINOR — dnd-kit announces drags to Arabic screen readers in English, naming raw UUIDs

**`apps/web/components/admin/quiz/option-rows.tsx:115`**

This `<DndContext>` passes no `accessibility` prop at all, so @dnd-kit/core 6.3.1 falls back to `defaultAnnouncements`: `"Picked up draggable item " + active.id`. The ids are `crypto.randomUUID()` values (`:97-98`) or `uuid(7)` database ids, so an Arabic admin reordering answer options hears *"Picked up draggable item 4f1c9a02-…"*. `onDragOver` names **two** UUIDs.

Separately, **both** sortable surfaces render dnd-kit's English `defaultScreenReaderInstructions` ("To pick up a draggable item, press the space bar…") into the hidden div that every handle's `aria-describedby` points at — `sortable-list.tsx:145` overrides `announcements` but not `screenReaderInstructions`. That is the longer and more frequently announced string, heard on every drag-handle focus in the lesson reorder and quiz slot reorder.

Contradicts `sortable-list.tsx:52`'s own contract: *"Arabic screen-reader announcements per drag lifecycle event — required, never a hardcoded default."* The Arabic strings already exist and are unused here (`ar.ts:267-274`).

**Corrections.** `aria-roledescription` renders `"sortable"`, not `"draggable"` (@dnd-kit/sortable overrides it) — still English. And the "Sortable item … is in position 3 of 5" string does not exist in any installed package; it is from dnd-kit's docs example of *custom* announcements.

**Fix.** Pass `accessibility={{ announcements: dndAnnouncements, screenReaderInstructions: { draggable: copy.admin.reorder.hint } }}` on both contexts.

---

### M4 — MINOR — required fields are marked with an `aria-hidden` asterisk and no `aria-required`

**`packages/ui/src/components/label.tsx:20-24`**

`Label`'s `required` prop renders `<span aria-hidden="true">*</span>` and wires nothing else. `aria-required` appears **zero times** in the entire repo. `shouldUseNativeValidation` is never set, so React Hook Form's `register` injects no native `required` either. The one primitive that does this wiring correctly — `field.tsx`'s `useFieldControlProps` (id + `aria-invalid` + `aria-describedby`) — is exported and used by no file outside its own definition.

Sharpest instance: `question-form.tsx:198` renders `<Label htmlFor="stemHtml" required>` over `<Textarea id="stemHtml" {...form.register('stemHtml')} />` at `:201`. `stemHtml` is genuinely mandatory (`question.ts:67`) and seeded as `''`, so empty is the starting state. The rendered DOM has no `required`, no `aria-required`, no `aria-invalid` and no `aria-describedby`; the error at `:203` is a `<p role="alert">` with no `id`, so it is announced once as a live region and is thereafter unreachable from a field that is not even marked invalid. WCAG 3.3.2 plus 3.3.1.

**Correction.** Five of the seven originally-cited sites are native `<select>`s with no empty placeholder option and a pre-seeded value, so they can never fail validation and `required` on them would be a no-op — the loss there is informational only. Conversely `defaultMark` (`:210`) is *worse* than reported: clearing it yields NaN, `z.number().positive().default(1)` only defaults on `undefined`, and there is no per-field error render at all.

The tell that it is an oversight: `course-form.tsx:64` and `:71` **do** set `required` on their `<Input>`s, and `auth/form-field.tsx` wires `errorId` + `aria-describedby` + `aria-invalid` correctly. The same form is inconsistent with itself.

**Fix.** Have `Label required` publish through context (or have consumers pass `required`/`aria-required` to the control), give error `<p>`s an `id`, and wire `aria-describedby`. Adopting the already-written `Field` primitive would fix all of it at once.

---

### M5 — MINOR — the toast region is labelled "Notifications alt+T" in English

**`apps/web/components/toaster.tsx:12`**

`<SonnerToaster dir="rtl" position="bottom-center" />` sets neither `containerAriaLabel` nor `hotkey`. sonner 2.0.7 defaults them to `'Notifications'` and `['altKey','KeyT']` and renders ``aria-label={`${containerAriaLabel} ${hotkeyLabel}`}`` on the `aria-live` `<section>` — verified by rendering the component with the repo's own installed dependencies: `<section aria-label="Notifications alt+T" aria-live="polite" …>`. The section renders even with zero toasts, so the English landmark name is in the DOM of every admin page inside `<html lang="ar">`. `closeButtonAriaLabel` is likewise unset but never renders, since `closeButton` is not enabled anywhere.

**Corrections.** The claim's "sole aria-live surface in the admin app" is false — there are at least eight others (`bulk-import-dialog.tsx:119`, `slot-list.tsx:109`, `sortable-lesson-list.tsx:90`, `course-editor.tsx:38`, three in `question-form.tsx`, plus dnd-kit's own). And "the one user-facing string not sourced from `@ayman/contracts`" is false — M3 is a larger instance of the same root cause. A live region announces its *inserted content* (correctly Arabic), not the container's accessible name, so the English string surfaces only via landmark navigation or the alt+T hotkey.

**Fix.** Pass `containerAriaLabel` from `@ayman/contracts` (and an explicit `hotkey` if the suffix is unwanted). Do this in the same commit as B5.

---

### M6 — MINOR — the theme toggle's `aria-label` erases both its visible label and its state

**`apps/web/components/theme-toggle.tsx:94`**

The button's visible text is the **current** mode — «فاتح» / «داكن» / «حسب النظام» (`:98`) — but `aria-label={copy.theme.toggle}` («تبديل المظهر») replaces the entire accessible name (`aria-label` beats name-from-content, and the only other child is `aria-hidden`). There is no `aria-live` and no state exposure; the applied theme lives only as a `data-theme` attribute on `<html>`, which is invisible to AT. A screen-reader user hears the identical string in all three states, can cycle it, and can never learn which mode is active or that anything changed. A speech-input user who says the visible word gets no match — WCAG 2.5.3 Label in Name (A). Rendered on the public home page (`app/page.tsx:9`) and `/dev/tokens`.

**Corrections.** `aria-pressed`/`aria-checked` are the **wrong** fix — `ORDER` is a three-value cycle and neither ARIA attribute can model three named modes. The correct fix is to delete the `aria-label` (name-from-content then yields the visible label, satisfying 2.5.3 and exposing state) or use ``aria-label={`${copy.theme.toggle}: ${label}`}``, plus a `role="status"` region for the change. Blast radius is two pages, not site-wide.

The secondary instance the claim cited, `player/video-lesson.tsx:90`, is **refuted** and should be dropped: `copy.player.play` («شغّل الفيديو») is a correct and complete name for a play control, the lesson title it suppresses is already the page `<h1>` directly above, and removing the label would leave the button named "«title» 12:34" with no affordance at all — strictly worse.

---

### M7 — MINOR — skeleton shimmer sweeps against the reading direction (and is half-broken independently)

**`packages/ui/src/components/skeleton.tsx:27`**

`after:-translate-x-full` plus `@keyframes shimmer { 100% { transform: translateX(100%) } }` are physical-axis; `translateX` has no logical form and nothing mirrors under `dir`. The highlight's motion is rightward on an RTL page, on every loading state in the product. The ESLint rule cannot see it (`translate-x-*` is in neither `PREFIX_MAP` nor `EXACT_MAP`), and there is no skeleton test file at all.

**This is the weakest confirmed finding and its stated mechanism is wrong.** Compiled with the repo's own Tailwind 4.3.3, `-translate-x-full` emits on the **`translate`** property while the keyframes animate **`transform`** — different properties that compose. Net offset therefore runs −100% → **0%**, not −100% → +100%: the highlight enters at the physical left edge, decelerates to the element's **center**, parks there for the last ~40% of the cycle, then hard-cuts to invisible. Also, `after:bg-gradient-to-r` is a symmetric `transparent → highlight → transparent` gradient, so mirroring it is a pixel-identical no-op — the proposed "flip the gradient by `--dir-x`" would do nothing, and naively multiplying the keyframe endpoints by `--dir-x` would push the pseudo-element permanently off-screen.

The plan document (`2026-07-25-plan-1-foundation.md:1865`) lists a manual-verification item reading *"the shimmer sweeps right-to-left"* — the shipped code does not. Note that `--dir-x` (`direction.css:1-7`) is scoped by its own comment to *directional icons* whose meaning inverts, not to decorative animation, so "the codebase already owns the fix" overstates it.

**Fix.** Put both the start and end offsets on the same property, and make the direction follow the writing mode. Cosmetic — no wrong output, no correctness or a11y consequence.

---

## 3. Contested — probably fine

No finding was refuted by two or more skeptics. These three survived 2 of 3, with substantive dissent worth a second look before spending time on them:

- **M7 (skeleton shimmer)** — one skeptic compiled the real Tailwind output and showed the claimed mechanism is wrong; what survives is "motion is rightward on an RTL page," a taste call with no wrong output. Fix it opportunistically, not deliberately.
- **M2 (`roundMark` 5 dp)** — one skeptic showed no user ever observes the divergence (zod strips the score from the submit response; every displayed number is a DB read) and that it cannot drift or flip pass/fail. A one-character fix, but not urgent.
- **M5 (toast container label)** — one skeptic showed the English string is a landmark *name*, reachable only via landmark navigation, and that the claim's "only live region" / "only untranslated string" premises are both false. Fold it into the B5 commit.

---

## 4. What I checked and found clean

This section matters as much as the findings. Concretely:

**Authorization and routing.** Counted **56 parameterised routes across 20 controllers**. `AuthGuard` is registered as `APP_GUARD`, is deny-by-default, and **fails closed** — a session-lookup exception is logged and converted to 401, never treated as "no session, let it through" (`auth.guard.ts:88-93`). Exactly **five** `@Public()` routes exist in the whole API: health, the two catalog reads, the CSP report sink, and taxonomy. Nothing student-scoped is public. Permissions are `resource:action` string lookups through `roleHasPermission`, never role-equality checks. The quiz module's 17 parameterised routes are covered by a **64-case table-driven authz matrix** (`quiz.authz.spec.ts`) that runs the *real* guard and the *real* permission map against real Postgres fixtures and asserts exact status codes for every route × role × owner/non-owner — including that a non-owner gets **404, not 403** (no enumeration oracle) and that admin has no ownership bypass on attempt-scoped routes. Every attempt-scoped query I read scopes by `{ id, userId }` in the WHERE clause rather than fetching-then-comparing. The two gaps I found (I3) are missing *entitlement* re-checks, not missing ownership scoping.

**Answer-leak defence — all three layers verified.** Layer 1: `LEARNER_QUESTION_SELECT` is an explicit `select` that omits `fraction`, `answerPattern`, `feedbackHtml`, `generalFeedbackHtml` and `penalty`, so those values never enter the process — with a comment warning that replacing it with `include` is the single most likely way it gets broken. Layer 2: the serializers build payloads by **addition**, not by nulling fields out, with a doc comment explaining that a null-valued key is itself information. Layer 3: `NoAnswerLeakInterceptor` against a 24-key `FORBIDDEN_ANSWER_KEYS` set, applied to seven of the nine attempt routes. The two deliberate opt-outs are documented at both the controller and the service; one of them (`review` in the `during` window) is finding B4, and the other (`checkAnswer`) is correctly gated per-question by `not_answered` plus a `gradedAt` re-probe lock.

**SQL.** No `$queryRawUnsafe` or `$executeRawUnsafe` anywhere in `apps/api/src` — the only two mentions are comments explaining that the ESLint config hard-fails on them. All eight production raw-SQL sites use tagged templates with bound parameters. Three of the four that touch timestamps correctly cast through `(now() AT TIME ZONE 'UTC')` with comments naming the Africa/Cairo hazard; the fourth is B3.

**Sanitization and embeds.** `RICH_TEXT_OPTIONS` is a tight allowlist (14 tags), `iframe` is explicitly absent and documented to stay absent, `nonTextTags` drops the *contents* of script/style/iframe rather than leaking them as prose, `allowProtocolRelative: false`, `enforceHtmlBoundary: true`, and `target="_blank"` has `rel` **forced** (not defaulted) so an author-supplied `rel="opener"` is overwritten. Video embeds go through a single validated path — an 11-character YouTube id enforced by a regex **and** a database CHECK (`lesson_videos_youtube_id_only`).

**Database layer — the strongest part of this codebase.** 18 migrations. Roughly 35 CHECK constraints encoding real invariants (`courses_year1_has_no_track`, `courses_published_has_timestamp`, `lesson_progress_completed_is_full`, `quiz_slots_source_exactly_one`, `quiz_attempts_submitted_state_consistent`, `access_grants_window_ordered`, …). Three immutability triggers (`question_versions_freeze`, `question_options_freeze`, `attempt_events_append_only`). Two partial unique indexes doing real work (`access_grants_one_live_platform_per_user`, `grade_appeals_one_open_per_question`). Deferrable position uniques enabling the one-write reorder. `REVOKE UPDATE, DELETE ON attempt_events FROM ayman_runtime` so a compromised runtime cannot rewrite grading history — belt-and-braces alongside the trigger. And a composite-FK trick (`lessons_section_matches_course`) that makes it structurally impossible for a lesson to point at a section belonging to a different course. Several of these are the reason findings above are *bounded* rather than catastrophic.

**Snapshot-at-start discipline** is real where it was applied: `attempt_questions` freezes `questionVersionId`, `optionOrder`, `maxMark`, `minFraction` and `maxFraction`; `quiz_attempts` freezes `deadlineAt` with an explicit comment forbidding mid-attempt recomputation. Grading reads only those frozen rows plus the stored response, so `gradeQuestion` is pure and deterministic — re-grades and appeal regrades converge on the identical value, and shuffled option order carries no correctness signal. The one column that escaped this discipline is B7.

**Concurrency where it *was* handled.** `submit()` claims the attempt with a conditional `updateMany` — the state transition **is** the lock, so a second submitter updates zero rows and gets a clean 409 with no read-then-write window. `start()` takes `pg_advisory_xact_lock` on `(quizId, userId)` to serialize attempt creation. Both are correct, and both are the pattern the three concurrency findings (B1, I1, I2) fail to follow.

**Tests.** 72 spec files, 880 green. Critically, the API specs run against a **real Postgres**, not mocks — which is why the DB-level facts in this report (trigger types, `confdeltype`, session timezone, actual stored values) were verifiable at all. Several findings above were confirmed by executing unmodified source from `0618449`.

**Not found:** no SQL injection, no XSS reachable through the rich-text or video paths, no mass assignment (contract schemas are strict and there is a dedicated mass-assignment battery), no authorization bypass, no unauthenticated data exposure, no missing ownership scoping on any parameterised route, no secret in source, no `dangerouslySetInnerHTML` without sanitization, and no 403-vs-404 enumeration oracle.

---

## 5. Launch blockers

These must be fixed before real students sit a graded attempt. Ordered by what breaks first under real load.

1. **B1 — thread `recordQuizResult` through the caller's transaction.** Ten concurrent submits at one deadline is not a stress test, it is a Tuesday. This one wedges the pool and 500s every student in flight. Set an explicit `connection_limit` and `transactionOptions` in the same change.
2. **B2 — hoist `access.require` out of `recordQuizResult`.** Any mid-attempt unpublish makes attempts permanently unsubmittable with a misleading 404, plus a per-minute sweeper error loop. Same file as B1; fix together.
3. **B6 — bound the wildcard grader.** A single authenticated student can freeze the entire Node process for 18–50 seconds, repeatedly, with a benign three-wildcard instructor pattern and a long answer. Cap the graded slice today; replace the regex with a linear matcher this week.
4. **B7 — snapshot the scoring denominator onto the attempt.** A perfect paper scoring 66.67% and failing is the single worst possible outcome for a البكالوريا platform's credibility. Any instructor edit during any live attempt triggers it.
5. **B8 — quantize option weights and fix the RIGHT threshold.** A 3-correct multi-select currently cannot be authored through the admin UI at all, and if bulk-imported it marks perfect answers "partial."
6. **B4 — add the per-question gate to `generalFeedbackHtml` in the review serializer.** Practice mode ships the model-answer explanation for every question before the student touches one. Practice is the default.
7. **B5 — move `<Toaster/>` to the root layout.** Every failure a student can hit during a graded attempt — including a failed auto-submit at the buzzer — currently renders nothing at all. This also makes B1, B2, I2 and I11 diagnosable in the field instead of invisible.
8. **I2 — fix the lock ordering in `saveAnswers`.** Move the `lastActivityAt` write to the top of its transaction. The client fires the colliding pair by construction at every timer expiry; the outcome is a bare 500 at the worst possible moment.
9. **I1 — make `closeOverdue`'s writes conditional.** The sweeper can currently stamp `abandoned` over a student's submitted, graded attempt, which then silently drops out of analytics.
10. **B3 — write `attempt_events.created_at` as UTC, and backfill.** No read path exists yet, so nothing is visibly wrong today — but the ledger is accruing permanently unrepairable rows on two different clocks, and the runtime role cannot fix them. Every day of delay makes the backfill harder.
11. **I5 — give the semantic colour tokens light-mode values.** A student on a light-mode phone cannot read the countdown at 2.19:1 during the final five minutes of a timed exam. That is an exam-fairness issue, not a polish issue.

**Fix in the first patch after launch, not before:** I3 (revoked students keep reading the answer key — IP exposure, not student harm), I4 (admins cannot delete content that has attempts — operational, and the transaction rolls back cleanly), I6–I8 and I10 (accessibility defects that lock keyboard and screen-reader users out of the navigator, the review verdict and distractor analysis), I9, I11, and the minors.

**Two known-accepted items intersect this list and should be reconsidered.** `@playwright/test` is not installed, so `apps/web/e2e/quiz.spec.ts` cannot run — that E2E spec is the only test in the repo positioned to catch B5, B6, I2 and I11, all of which are launch blockers. And the in-memory throttler is per-tracker rate limiting; it does not cap concurrent interactive transactions, which is precisely the ceiling B1 needs. The Redis swap does not fix B1 on its own.
