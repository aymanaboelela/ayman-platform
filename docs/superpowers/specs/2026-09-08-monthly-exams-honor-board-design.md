# امتحانات الشهر ولوحة الشرف — design

**Date:** 2026-09-08
**Status:** approved
**Builds on:** `2026-08-07-exam-improvement-design.md`, `2026-08-10-mastery-map-design.md`,
`2026-08-11-mistakes-notebook-design.md`
**Scope:** scheduled mid-month / end-of-month exams over a course and a chosen
subset of its lessons; the dashboard countdown that announces one and the shelf
it retires to; manual grading of an essay question; the honor board «لوحة الشرف»
and its «طالب متميز» section; and the extension of the approved mistakes
notebook into a current/past split with a retakeable practice paper.
**Out of scope:** changing the 4×7 review matrix or its defaults; any change to
`attemptAllowance` for a real exam sitting; recurrence/templating of exams.

---

## 0. The deadline this design is shaped by

A real exam runs **Friday 2026-09-11 at 20:00 Cairo**. Slice 1 exists to make
that exam authorable by the owner himself and visible to students. Every later
slice is deliberately separable and lands after it.

Two consequences are load-bearing and are not negotiable inside this design:

- **Nothing in slice 1 edits the attempt hot path.** Not `AttemptService.start`,
  not `QuizAccessService.assertCanAttempt`, not `LessonAccessService`, not
  `attemptAllowance`. The machine that runs the exam is the machine that ran
  last month's quizzes, byte for byte. A feature that adds a countdown must not
  be able to break the paper.
- **Deploy Wednesday or Thursday, never Friday.** CI's slowest shard is ~21
  minutes and the VPS build is ~8 more; `next build` bakes an empty settings
  cache for minutes after every deploy; and Turbopack module ids outliving a
  deploy 404s tabs opened against the previous build. Budget two failed
  attempts.

---

## 1. Why the exam stays a lesson

`quizzes.lesson_id` is `@unique NOT NULL`, and three of four independent designs
proposed relaxing it. This design does not, and the reason is in the repo's own
words — `20260802140000_course_exam/migration.sql`:

> modelling it as a lesson rather than as a second kind of quiz owner is what
> lets the entire quiz engine apply to it unchanged.

That is not sentiment. Verified consequences of keeping it:

- **Thirteen analytics joins keep working.** `overview.service.ts` INNER JOINs
  `lessons ON l.id = q.lesson_id` at lines 208, 299, 341, 361, 379, 438, 482,
  531 and 578; `student-analytics.service.ts:542`; `lesson-analytics.service.ts`
  at 120/177/231; and `MasteryService`'s raw CTE selects `q."lesson_id"` at :96
  and :116. A nullable `lesson_id` silently empties every one of them — a
  monthly exam would vanish from participation rate, mean score, item analysis
  and the cohort roster, which is the admin's own dashboard on the assessment he
  cares most about.
- **Grade notifications keep arriving.** `NotificationsService.toEntry` returns
  `null` for any quiz payload without a `lessonId` (`notifications.service.ts:825`).
  A lesson-free exam drops every grade notice with no error anywhere, and the
  only symptom is a student saying they were never told.
- **`resolveReviewWindow` gets a real `openUntil`,** so `afterClose` actually
  fires and the model answer unlocks when the exam closes.

**Recorded for whoever is tempted later:** the synthetic lesson is load-bearing,
not laziness. This paragraph and the join inventory above go in the migration
header so nobody "cleans it up".

### What that costs, and why it is paid

`LESSON_KINDS` in `apps/web/components/admin/course/lesson-panel.tsx:533` is
`['video','text','attachment']` — a standalone quiz lesson **cannot be created
from the admin UI at all**, and that was deliberate. Its docblock quotes the
owner: «ما يبقاش يضاف الكويز لوحده. لأ، بيضاف مع المحاضرة.», because a quiz
sitting in the outline as an equal sibling of the lectures was counted as one,
numbered as one, and could shut the rest of the course behind one failed sitting.

A monthly exam is the case that rule was not about, and it must not reopen the
case it was about. So:

- The exam is **never** created from the lesson panel. It is created from its own
  screen, `/admin/exams`, and `LESSON_KINDS` is not touched.
- It lives in a per-course system section «امتحانات الشهر», created on first use
  with `isPublished: true`.
- `resolveGate` no longer treats quizzes as chain links, so the exam cannot shut
  the course. This is checked by a test, not assumed.

### The three leaks that arrangement opens, and their fixes

All three were found by reading the code, and all three are in slice 1:

1. **`path.service.ts:89-94` filters sections only on `isPublished`,** so the
   published exam shelf would grow exam nodes on «مسارك». One added clause
   excluding the exam shelf.
2. **`LessonAccessService.resolve` does not check `section.isPublished` while
   `LessonGateService.resolveCourse` does.** If the shelf is ever unpublished
   the intro page 404s while `assertCanAttempt` still opens attempts — a
   404-for-everyone at 20:01 with no guard. The admin exam row therefore shows
   the shelf's publish state on every row, and the wizard creates it published.
3. **The exam title reaches the public catalog outline** (`catalog.service.ts`
   maps every lesson kind + title). The exam shelf is excluded there too — a
   marketing page nobody asked to change must not change.

---

## 2. Slice 1 — the exam

### Storage: one table, zero new columns, zero new enums

`app.exam_coverage` — the one fact the lesson arrangement cannot already
express, «الامتحان ده على الوحدة ١ ٢ ٣».

```prisma
model ExamCoverage {
  examLessonId    String @map("exam_lesson_id") @db.Uuid
  coveredLessonId String @map("covered_lesson_id") @db.Uuid
  /// Denormalised from BOTH lessons and LOAD-BEARING: the two composite FKs in
  /// the migration point at lessons(id, course_id) — the unique index
  /// 20260802140000_course_exam already created — so "an exam only ever covers
  /// lessons of its own course" is a database fact, not a service `if`. Same
  /// arrangement and same reason as courses_exam_lesson_in_same_course.
  courseId        String @map("course_id") @db.Uuid
  position        Int

  examLesson    Lesson @relation("ExamCoverageExam", fields: [examLessonId], references: [id], onDelete: Cascade)
  coveredLesson Lesson @relation("ExamCoverageCovered", fields: [coveredLessonId], references: [id], onDelete: Cascade)

  @@id([examLessonId, coveredLessonId])
  // Redefined DEFERRABLE in the hand-written migration, like
  // quiz_slots_quiz_id_paper_position_key. Prisma cannot express deferrability
  // and must never "correct" it away — replace() rewrites the whole ordered set
  // in one statement and needs the deferral.
  @@unique([examLessonId, position], map: "exam_coverage_exam_position_key")
  @@index([coveredLessonId])
  @@map("exam_coverage")
  @@schema("app")
}
```

It hangs off the exam's **lesson**, not its quiz: both reads are keyed on the
lesson, and a quiz rebuilt from scratch on the same lesson keeps its syllabus.

Scheduling adds nothing. `quizzes.open_from` / `open_until` already exist, are
already validated (`openUntil > openFrom`), and are already enforced by
`assertCanAttempt` as `quiz_not_open_yet` / `quiz_closed`. The countdown
qualifies on `open_from` — **a column that already exists** — which is what lets
coverage slip without taking the countdown with it.

### `examPhase()` — one predicate, two callers, never three

```ts
// packages/contracts/src/quiz/scheduled.ts
export type ExamPhase = 'upcoming' | 'open' | 'closed';
export function examPhase(openFrom, openUntil, now): ExamPhase
```

Its thresholds are byte-identical to `assertCanAttempt`'s comparisons
(`quiz-access.service.ts:94-101`), so the banner can never invite a student into
a 403. It is imported by the API serializer and by the dashboard component, and
is **never** re-derived client-side from two dates. Same failure family as a
second `GRADED_STATES` literal; a test asserts the two agree.

### Admin: `/admin/exams`

The wizard is not a nicety — without it the owner cannot author Friday's exam at
all, and a developer has to `curl POST /api/admin/sections/:sectionId/lessons`.
It is in the Wednesday minimum.

One form: course · title · the covered lessons (multi-select over that course's
published lectures) · opens at · closes at · duration · marks. Under the two
date fields, a **live echo line** rendered back in Cairo wall clock before
submit — «هيفتح الجمعة ١١ سبتمبر ٨:٠٠ م بتوقيت القاهرة». It costs one line of
`Intl` and it is the cheapest possible defence against the one mistake that
cannot be recovered at 19:45.

Timezone: `QuizSettingsForm`'s existing `datetime-local` handling is reused
whole (`quiz-settings-form.tsx:44-52`). **No new Cairo conversion code is
written.** Egypt is UTC+3 until the last Thursday of October, so the same wall
clock in November is an hour different; a unit test pins 2026-09-11 20:00 Cairo
to `2026-09-11T17:00:00.000Z` and a November date to its own offset.

Other decisions, each from a judge's graft list:

- **Publish is ONE endpoint** (`POST /api/admin/exams/:lessonId/publish`) that
  runs `QuizBuilderService.publish` then the lesson publish in order, returning
  the existing machine-readable codes (`quiz_has_no_slots`,
  `slot_has_no_ready_version`, `pool_cannot_fill_pick_count`,
  `sum_marks_must_be_positive`). A two-call server action can leave a
  half-published exam.
- **Unpublish is the loud button; delete is the quiet one.** Delete cascades the
  quiz, its attempts and coverage permanently and only refuses once an attempt
  exists. An exam he wants off the dashboard before it opens must be
  unpublished.
- **`allowsImprovement: false` is written explicitly,** and
  `QuizBuilderService.settingsData` gains a refusal so the flag cannot be
  flipped through the builder API on a monthly exam (400
  `improvement_is_course_exam_only`). `assertPaperAllowed` only reads the
  boolean (`:565`) and `settingsData` writes it unconditionally (`:29`) — the
  course-exam restriction is today a UI and publish-time convention, not a
  check. **This is the open door to a student sitting a monthly exam twice**, and
  it is closed here.
- **PATCH schemas are written out by hand as all-optional objects.** Never
  `AdminExamCreateSchema.partial()` — `.partial()` keeps every `.default()`,
  which is how a rename once unpublished a lesson in this repo.
- **«كرر الامتحان ده على باقي الكورسات»** duplicates a created exam onto the
  other courses with their own lesson selections. His real rhythm is four
  courses, one per part — but as a button, not as a `UNIQUE(year, month, slot)`
  constraint that would refuse him a make-up paper at 19:45.

### Student: the countdown, and where it goes

`GET /api/me/exams` (`quiz:read`, no id parameter, on `MeQuizzesController`)
returns the student's scheduled exams with `phase`, `openFrom`, `openUntil`,
`durationSeconds`, the covered lesson titles, and their attempt state.

It is **not** on the dashboard's critical path in the sense that matters: it is a
seventh per-view API call against a `short` throttle of 10/sec (the page has ten
`Promise.all` entries but only six per-view API calls — verified), so it is
comfortably under. It gets an `…OrEmpty` wrapper that swallows its own failure,
like every other optional dashboard read.

Placement, against the dashboard's stated rule (main column = the student's own
work; exactly one accent-filled primary action on screen):

| phase | where it renders |
|---|---|
| `upcoming` | a full-width band directly under `DashboardHero`, above `NextUpBlock` — the same shape as the hero's «مواعيد المحاضرات» strip, which is also "a date you must not scroll past". Live countdown, the date in Cairo wall clock, and the covered lessons as quiet chips. **Not** the accent action — there is nothing to press yet. |
| `open` | the same band, now carrying the one accent CTA «ادخل الامتحان»; `NextUpBlock` stands down while it is there, so the one-primary-action rule holds. |
| `closed` | gone from the dashboard entirely. It appears in `ExamsSection` «امتحاناتك» in the main column, where review and score already live. |

The countdown reuses `useServerCountdown(deadlineAt, serverTime)` from
`components/quiz/quiz-timer.tsx` — already anchored on `performance.now()`
against a server-supplied time, so a wrong device clock cannot warp it. Below
~48 hours it counts down live; above that it prints a calendar-day line through
`subscriptionExpiryLabel`'s existing UTC-midnight arithmetic, because a
per-second clock on a five-day wait is noise.

### Manual grading — new, and required

The owner wants one essay question. Verified: there is **no manual-grading route
in the product**. `admin-attempts.controller.ts` exposes only `reopen`,
`extra-time` and `extra-attempt`, and `AttemptService.recomputeScore` /
`recomputeScoreTx` exist with **zero callers**. So an essay sits `needs_grading`
inside `GRADED_STATES` and scores **0 forever** — silently, and it would rank
that student last on the honor board.

The grading machinery is built; only the route and the screen are missing.

- `PATCH /api/admin/attempts/:attemptId/questions/:attemptQuestionId/grade`
  — permission `attempt:grade` (it already exists), body `{ mark, feedbackHtml? }`,
  writes `mark`/`fraction`/`state`/`feedback_html`/`graded_at` through the same
  `fractionToState` thresholds, then calls `recomputeScoreTx` in the same
  transaction. Audited. `mark` is clamped to the slot's `max_mark`.
- A screen at `/admin/attempts/[attemptId]` listing that attempt's
  `needs_grading` questions with the student's response, a mark box and a
  feedback box, plus a queue «ورقات محتاجة تصحيح» so he can find them.
- Marking a question re-runs `gradeAttempt` over the snapshots, so
  `scaled_score`, `passed` and `attemptState` all move to their true values, and
  the honor board's shortlist stops being wrong.

---

## 3. Slice 2 — the honor board placeholder (ships with slice 1)

He asked for it explicitly: the section visible now, with a «؟» explaining in
one line that it starts the day after Friday's exam.

- `ALTER TYPE "app"."home_block_type" ADD VALUE IF NOT EXISTS 'honorBoard'`
  (precedent: `20260903000000_home_block_books/migration.sql`), and **no seed row
  in the same migration** — Postgres refuses to use a new enum label in the
  transaction that added it.
- A **placement-only** props schema, `z.object({ type: z.literal('honorBoard') })`,
  exactly like `instructor` and `yearTracks`: the section builds itself from
  tables, the block only says where it sits.
- **A second migration inserts the block row.** This is the whole reason the
  placeholder appears: `DEFAULT_HOME_BLOCKS` is the fallback for an **empty**
  `home_blocks` table only, and production's table is seeded — so on prod a
  block added only to the defaults never appears. ⚠️ `home_blocks.updated_at`
  is `TIMESTAMP(3) NOT NULL` with **no default** (`20260727024705_platform_config/migration.sql:60`);
  the INSERT must supply `created_at` and `updated_at` explicitly or it fails.
- The section renders the placeholder **on loader failure too**, not `null` — a
  cold cache after deploy or an API blip must not silently delete his one
  deliverable of the week.
- The «؟» is `<details>`/`<summary>`: zero JS, works on touch, keyboard-focusable
  for free.

---

## 4. Slice 3 — the honor board

### The decision: derive the ranking, store only his decisions

Both judges chose this unanimously. The public surface stores **nothing that can
drift**: the payload omits `scorePct` and `fullName` entirely (absent, not
nulled — the same disclosure discipline the review serializer uses), so no
published number can ever contradict «نتائجي» after a regrade, an admin unlock, a
voided question or a late grade. The frozen score and rank exist **admin-side
only**, beside the live value, with a divergence chip.

«كل امتحان = فترة» — his answer — so the period **is** the exam. No period table,
no date-range picker, no `openFrom` backfill, no timezone boundary guess.

### The shortlist

```
quiz_attempts a
  JOIN quizzes q ON q.id = a.quiz_id AND q.lesson_id = <the exam lesson>
  JOIN enrollments e ON e.user_id = a.user_id AND e.course_id = <course>
  + studentJoins('a.user_id')
WHERE a.state IN GRADED_STATES AND a.paper = 'original'
ORDER BY a.scaled_score DESC, a.submitted_at ASC, a.id ASC
LIMIT <period.shortlistSize>
```

Details that are each somebody's caught bug:

- **`paper = 'original'`.** تحسين is a second chance, not a competition.
- **Enrolment is a CHIP on the row, never a filter.** `EnrollmentStatus` is
  `active|suspended|expired|revoked|completed`; hard-filtering on `active`
  silently drops a top scorer whose enrolment is `completed`, with nothing on
  screen to say why the expected name is missing. But a **revoked or expired**
  student may not be crowned — that is checked at approval, where it can be
  explained, not in the query, where it cannot.
- **Tiebreak ends on `a.id`, not `user_id`.** `User.id` is a better-auth nanoid
  (`schema.prisma:33`, no default), **not** `uuid(7)` — so a user-id tiebreak is
  total but arbitrary. `quiz_attempts.id` is `uuid(7)` and therefore
  chronological.
- **Aliases:** `studentJoins` aliases users as `su`, not `u`
  (`analytics-shared.ts:71`). Select `su."image"`, `sp."full_name"`, `sp."phone"`.
- **`pending_review` is a SOFT block.** It sits inside `GRADED_STATES` and, until
  slice 1's grading screen exists, never clears. So it blocks the **proposal**
  (with a visible «فيه ٣ ورقات لسه محتاجة تصحيح» in the column) but never blocks
  manual approval — a hard block would deadlock the board forever.

### His workflow is the screen

Four columns, one per course, each a card whose body changes with its state, with
exactly **one** accent-filled button per card whose label **is** the next step,
and a pinned publish bar that names what is still missing («باقي ٢ للموافقة»)
rather than making him deduce it.

1. **The candidates are simply there** on page load — a live read, with the phone
   number on the same row as the exam score. No «هات المتفوقين» button.
2. He phones them and types a **0–10** in the stepper on that same row.
3. The proposal is a pure `GET` — it cannot go stale, and there is no re-propose
   loop when he scores the next person after a call.
4. **«اعتمد» and «اختار غيره» post to the same endpoint** because they are one
   decision. Swapping requires `overrideReasonAr`, enforced in the Zod refinement
   **and** a DB CHECK — otherwise «ليه ده اتشال؟» has no answer six months later.
5. Un-approve and un-publish both exist. Publishing is **not** a one-way door: the
   most likely real incident is the wrong name on the front page.

Two things must not be constants:

- **The weights live on the period row** (`examWeight` / `interviewWeight`
  integers, CHECK summing to 100), with the live formula printed in the column
  header — «٧٠٪ الامتحان + ٣٠٪ المقابلة». A weighted score whose weights are
  invisible is a black box deciding whose face goes on the front page, and a
  board published last month must be able to say how its own winner was computed.
- **`shortlistSize` is per period**, still a server-side closed bound so nothing
  comes off the URL bar. He may want five names to phone, not ten.

**A candidate he has already scored never disappears.** The shortlist is live and
capped, so a regrade can push a student he scored 9/10 out of the top N. The read
unions his interview scores back in and flags them — «اتكلمت معاه، مش في العشرة
دلوقتي».

**Staleness is a 409, not a silent wrong winner.** Every interview-score write
bumps `revision`; the proposal stamps `proposedRevision`; approving a proposal
whose revision has moved is refused with «الدرجات اتغيرت بعد الاقتراح — اقترح
تاني».

**`awaiting_exam` and `skipped` are first-class states,** with a DB CHECK
requiring a reason on a skip — so a round where he did not run one of the four
courses can still publish instead of sitting incomplete forever.

### «طالب متميز»

A `GROUP BY` over published winner rows — repeat winners fall out with no sweep
and no stored flag, and deleting a student or one win produces a correct list on
the next read. His manual hand-picks are ordinary rows with a `source` of
`manual`. The repeat-winner card takes its name and photo from **that student's
most recent winner row**, the same source the period card uses, or one student
appears with two different photos on one page.

A deleted student must leave the **rank intact** — a published four-card row must
never collapse to 1, 2, 4.

### Avatars

- The admin write path is built on **`ProfileService.setAvatar(userId, file)`
  verbatim.** Verified: it already takes `userId` as an argument — only the
  *controller* binds it to the session — and it already archives the previous
  asset with `updateMany` (not `update`, so a Google URL is a no-op rather than a
  `P2025`). A fresh `MediaService.uploadAvatar` + `users.image` write silently
  drops that archive step.
- The picker is **`cover-cropper.tsx` at aspect 1**, not a new `avatar` entry in
  `AssetPicker`'s `SLOT_ASPECT` — that map is `{favicon:1, share:1.91,
  logo:'source'}`, a closed set of site-branding slots, and its output is an
  asset **id** while `users.image` holds a storage **key**.
- The upload dialog says two surprising, true things: the photo becomes that
  student's avatar **everywhere in the app**, and uploading it does **not** by
  itself make it public.
- ⚠️ `MediaService.usage(id)` scans only the `site_settings` blob and
  `home_blocks.props`. It is blind to `users.image` keys, and `destroy()` deletes
  the bytes permanently. Teaching `usage()` about `users.image` is part of this
  slice.

### Privacy — a decision the owner must make, not this document

These are named minors on a page open to the whole internet and to search.

- **The public board is one rolling period.** There is no public archive: a
  child's name leaves the public web when the next board publishes, instead of
  accumulating an indexed permanent list. Past periods are browsable **inside
  the app**, to signed-in students.
- **Two consents, recorded as evidence** with their own `honor:consent-record`
  audit action, plus a read-time opt-out.
- **A winner with no recorded consent still publishes** — as the course title and
  «أعلى درجة في الوحدة», with no name and no face. Saturday morning is never
  blocked on a phone call he has not made.
- **Copy discipline: «هيتشال من الموقع», never «هيتمسح».** Unpublishing clears the
  page within a cache window. It does not clear Google's cache, an archive, or a
  WhatsApp screenshot, and the consent copy must not promise that it does.
- **`honor:delete` is its own permission,** separate from cascade-on-student-delete.
  "Take this child off the page" and "erase this account" are different requests
  and only one of them currently has a route.

**Open question for the owner:** full name + photo, first name + initial («أحمد
س.») + photo, or name only. The default until he answers is the middle one.

---

## 5. Slice 4 — the mistakes bank

`2026-08-11-mistakes-notebook-design.md` is **approved and unbuilt**, and §§1–9
still verify against HEAD. It is implemented as written. This section records
only the **two deliberate reversals** of its §10, on the owner's instruction, so
that an approved document is not left on the record arguing against merged code.

That spec is amended in place with a dated revision note pointing here.

### Reversal 1 — «غلطات حالية» / «غلطات سابقة»

§10 cut a stored "understood" flag, on the grounds that "the notebook already
empties itself correctly when the student retakes the quiz and gets it right —
which is a better signal than self-assessment."

**That reasoning is upheld; nothing is stored.** The owner's current/past split is
the same derivation with one more fold: per `bank_entry_id`, take the student's
**most recent** graded answer.

| latest answer | ever wrong before | list |
|---|---|---|
| wrong / partial | — | **حالية** |
| right | yes | **سابقة** |
| right | no | absent |

No table, no `cleared` flag, no write path, and no second source of truth about
whether a mistake is closed. Answering correctly moves it by itself — which is
exactly what he described.

⚠️ The spec's own window (`DISTINCT ON (quiz_id)` latest sitting only) is
**widened** here, because "was it ever wrong" needs the history the mastery window
deliberately discards. §5 Step 1's shared `latestGradedAttempts` helper is still
extracted from `MasteryService` and `MasteryService.forUser` refactored onto it in
the same commit — but the notebook takes a second, wider read alongside it, and
the difference is documented at both call sites.

### Reversal 2 — the practice paper

§10 cut it as blocked on `quizzes.lesson_id @unique NOT NULL` — "that is a schema
conversation". This design **declines to have that conversation** (§1), so the
practice paper is **not a `Quiz` and not a `quiz_attempts` row**. It is its own
lightweight object.

That is not a workaround; it is the only correct shape, for four verified
reasons:

1. A retake written as a real attempt is a **third sitting**.
   `assertCanAttempt` rejects it — and if it landed it would become the newest
   row in `MasteryService`'s `DISTINCT ON (quiz_id) … ORDER BY submitted_at DESC`
   window and **silently redefine the student's grade**.
2. It would inflate the admin cohort roster: a student acing a retake of their own
   mistakes would top `meanScore`. A `GRADED_OWNERS`-style guard beside
   `GRADED_STATES` keeps practice out of every teacher-facing aggregate.
3. **The render path is a different serializer.** A practice paper shows a stem
   with no answer data — that is `LEARNER_QUESTION_SELECT` +
   `toLearnerQuestion` + `@NoAnswerLeak()`. Reusing `toReviewQuestion` is the
   leak in one line: a practice row seeded with the student's original response
   satisfies `row.response != null`, so the gate at `review.serializer.ts:199-203`
   opens and `rightAnswerOptionIds` ships **with the question they are about to
   re-answer**.
4. **The result is where the real attack is.** `resolveReviewWindow` keys entirely
   on the `submittedAt` handed to it. Hand it the practice paper's own, and
   `elapsed < 120s` ⇒ `immediatelyAfter` ⇒ `allFlags(true)` ⇒ `rightAnswer: true`.
   A practice button would become a machine for converting `laterWhileOpen` into
   `immediatelyAfter` and printing the model answer of an exam **still open to
   the cohort** — the photograph-and-circulate threat the third review window
   exists to prevent.

   **So a practice result resolves its window from the ORIGINAL attempt's
   `submittedAt` and the ORIGINAL quiz's `openUntil`, and shows nothing the
   original review would not have shown. An intersection, never a fresh
   resolution.** This is the single most important constraint in slice 4.

Practice is unlimited and consumes no allowance, because it is not a sitting.

---

## 6. Testing

Beyond each slice's own specs:

- `examPhase()` agrees with `assertCanAttempt`'s thresholds — asserted against
  each other, not written twice.
- Cairo wall clock: 2026-09-11 20:00 → `2026-09-11T17:00:00.000Z`, **and** a
  November date at its own offset (Egypt leaves DST the last Thursday of October).
- A monthly-exam grade notification actually reaches the student — the
  `notifications.service.ts:825` drop is the reason the synthetic lesson exists,
  so it is asserted, not assumed.
- An exam lesson does not appear in `/api/me/path`, the course outline, or the
  public catalog.
- `allowsImprovement: true` on a monthly exam is a 400.
- Grading an essay moves `scaled_score` and clears `pending_review`.
- The honor board's public payload contains no `scorePct` and no `fullName` — the
  absence is asserted directly, because this route cannot be `@NoAnswerLeak()`-ed.
- Every new route has rows in `authorization-matrix.int-spec.ts`.
- `/mistakes` and the honor board's in-app page join the axe sweep list in
  `apps/web/e2e/a11y.e2e.ts` — maintained by hand, and a route missing from it is
  exactly the one that breaks unnoticed.

---

## 7. Ordering

| slice | contents | when |
|---|---|---|
| 1 | `exam_coverage`, `/admin/exams` wizard, publish endpoint, `GET /api/me/exams`, the dashboard countdown band, the three leak fixes, `allowsImprovement` refusal, manual grading route + screen | **before Friday 2026-09-11**, deployed Wed or Thu |
| 2 | honor-board home block + placeholder + «؟» | with slice 1 |
| 3 | honor board: shortlist, interview scores, proposal, approval, publish, «طالب متميز», admin avatars, consent | after Friday |
| 4 | mistakes notebook as approved, + current/past, + the practice paper | after slice 3 |

Slice 1's countdown qualifies on `open_from`, which already exists — so if
`exam_coverage` slips, the band still lights up. That independence is
deliberate.
