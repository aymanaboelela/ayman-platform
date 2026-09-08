# Quiz / Exam engine — mobile (Flutter) reproduction spec

> Everything below is read off the repo at `feat/video-mirror` (2026-09-08). Every
> non-obvious claim cites a repo-relative path. Nothing here is remembered or inferred.
>
> **Primary sources**
> - `apps/api/prisma/schema.prisma` lines 2500–3000 (models + enums)
> - `apps/api/src/modules/quiz/**` (controllers, services, grading, serializers, DTOs)
> - `packages/contracts/src/quiz/**` (wire contracts — **the** source of truth for shapes)
> - `packages/contracts/src/copy/ar.ts` lines 3986–4245 (`copy.quiz`, `copy.examGate`, `copy.quizErrors`)
> - `apps/web/app/(app)/quizzes/**` + `apps/web/components/quiz/**` (the UI being reproduced)
> - `apps/web/app/study.css` (the runner/intro/review visual system)
> - `apps/api/prisma/migrations/20260726144109_question_bank_constraints/`,
>   `…/20260726150111_attempt_constraints/`, `…/20260807000000_exam_improvement/` (DB-level invariants)

---

## 0. Transport, auth, and the two rules that will bite you first

### 0.1 Base URL and prefix

`apps/api/src/main.ts:32` — `app.setGlobalPrefix('api')`. Every controller path below is
therefore prefixed with `/api`. `@Controller('quiz')` → `/api/quiz/...`,
`@Controller('me')` → `/api/me/...`, `@Controller('admin/…')` → `/api/admin/…`.

The web app talks to the API through a same-origin Next rewrite; `apps/web/lib/api.ts:28`
shows the direct origin (`API_ORIGIN`, default `http://localhost:3300`). A native client
talks to the API origin directly.

### 0.2 Session

better-auth cookie session. `apps/api/src/auth/auth.config.ts:442-443`:

```
session_token: { name: isProduction ? '__Host-session_token' : 'session_token' }
```

`basePath: '/api/auth'`. The cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production,
`Path=/`, no `Domain` (required by the `__Host-` prefix). A Flutter client must persist and
resend this cookie on every quiz call. **There is no bearer-token path today** — see §16.

### 0.3 CSRF — mandatory on every POST/PUT/PATCH/DELETE

`apps/api/src/modules/security/csrf.guard.ts`. Three checks, applied to
`POST | PUT | PATCH | DELETE` only:

1. **`x-csrf-token` header must be present and non-empty.** The *value* is not verified
   against anything (`csrf.guard.ts:100-103`) — presence is the control. Send any non-empty
   string; the web sends the `__Host-csrf` cookie's value as a courtesy
   (`apps/web/lib/csrf.ts:16-28`).
2. **`Origin`, if present, must equal `APP_URL` exactly** (`csrf.guard.ts:90-93`). A native
   client that sends no `Origin` passes. A native client that sends the *wrong* `Origin` gets
   `403 CSRF: origin mismatch`.
3. **`Sec-Fetch-Site`, if present, must be `same-origin` or `none`** (`csrf.guard.ts:20`,
   `:95-98`). Absent is accepted.

So: **Flutter must send `x-csrf-token: <anything non-empty>` and must NOT send an `Origin`
header** (or must send exactly `APP_URL`). This affects `start`, `resume`, `answers`, `flag`,
`submit`.

### 0.4 Rate limits

`apps/api/src/app.module.ts:91-93` (per authenticated user):

| name | window | limit |
|---|---|---|
| short | 1 s | 10 |
| medium | 60 s | 60 |
| long | 3600 s | 1000 |

plus a per-IP bucket of 1200/60 s (`:114`). Exceeding any of them returns **429**. The
autosave interval below (15 s) is well inside this; a client that flushes per keystroke is not.

### 0.5 Permissions

`apps/api/src/auth/permissions.ts:47-49` defines `quiz:read`, `quiz:write`, `quiz:attempt`.
`:258-259` — the **student** role holds `quiz:read` and `quiz:attempt` (and `quiz:write` is
admin/instructor only). A missing permission is **403**; an unauthenticated request is **401**.

### 0.6 The two rules that will bite you first

**(a) The answer-leak interceptor.** `apps/api/src/modules/quiz/interceptors/no-answer-leak.interceptor.ts`
walks *every key at every depth* of a response from a route decorated `@NoAnswerLeak()` and
throws **500** if any key from `FORBIDDEN_ANSWER_KEYS` appears
(`apps/api/src/modules/quiz/serializers/learner.serializer.ts:29-68`):

```
fraction, isCorrect, correct, correctness, feedback, feedbackHtml, generalFeedbackHtml,
specificFeedback, rightAnswer, rightAnswerText, rightAnswerOptionIds, answerPattern,
answerPatterns, graderInfo, penalty, position, mark, marks, maxFraction, minFraction,
rawScore, scaledScore, passed, state, matchedOptionIds
```

Consequences for the client model: the learner question payload calls its ordinal
`slotPosition` (**not** `position`), the attempt's lifecycle field is `status` (**not**
`state`), and per-question grading state is projected to a plain `answered: boolean`. Do not
"normalise" these names back — the server will never send the other ones on those routes.

**(b) The clock is the server's.** `deadlineAt` and `serverTime` always arrive together, and
the client counts down against a monotonic clock anchored to `serverTime` — never the device
clock. See §4.

---

## 1. Domain model — every field, with meaning

All tables live in the Postgres schema `app`. IDs are `uuid(7)` (time-ordered) except
`AttemptEvent.id` (bigserial) and any `userId`, which is a **better-auth nanoid string, not a
UUID** (`attempt-events.service.ts:38-40` casts `actor_id` to `::text` for exactly this reason).

### 1.1 Enums

```
QuestionType        mcq_single | mcq_multi | true_false | short_answer | ordering | essay
QuestionStatus      draft | ready | hidden
QuestionOwnerScope  global | instructor | course          (v1: always `global`)
QuizPaper           original | improvement                (@@map "quiz_paper")
OverdueHandling     autosubmit | graceperiod | autoabandon
NavMethod           free | sequential
AttemptState        in_progress | overdue | submitted | pending_review | abandoned
AttemptQuestionState todo | complete | needs_grading | graded_right | graded_partial | graded_wrong
AttemptEventKind    attempt_started | question_viewed | answer_saved | answer_cleared |
                    flag_toggled | answer_checked | submitted | autosubmitted | abandoned |
                    graded | regraded | appeal_opened | appeal_resolved |
                    extra_time_granted | extra_attempt_granted | attempt_reopened |
                    stale_write_rejected
```

Notes carried by the schema's own doc comments (`schema.prisma:2505-2519`, `:2824-2852`):

- `ordering` — "the options **ARE** the answer: `question_options.position` order is the correct
  sequence, and `attempt_questions.option_order` is **always** shuffled for this type regardless
  of the quiz's own shuffle setting — serving the stored order would be serving the answer key."
- `appeal_opened` / `appeal_resolved` are **RETIRED**. The `grade_appeals` table is gone; nothing
  writes them. They stay in the enum because `attempt_events` has `UPDATE`/`DELETE` revoked and
  Postgres has no `ALTER TYPE … DROP VALUE`.
- `question_viewed` and `answer_checked` are declared but **never written by any code**
  (verified: grep for `kind: '…'` across `apps/api/src` returns writers only for
  `attempt_started`, `stale_write_rejected`, `answer_saved`, `answer_cleared`, `flag_toggled`,
  `regraded`, `abandoned`, `autosubmitted`/`submitted`, `graded`, `attempt_reopened`,
  `extra_time_granted`, `extra_attempt_granted`).
- `AttemptState.overdue` is a **legal state nothing ever writes**. Every query treats
  `state IN ('in_progress','overdue')` as "live", but no code path sets it. The sweeper goes
  straight from `in_progress` → `submitted`/`pending_review`/`abandoned`.
- `AttemptQuestionState` — "`todo`/`complete` describe ANSWERING; the four `graded_*` values
  describe GRADING. A learner payload never carries this column."

### 1.2 `QuestionCategory` → table `question_categories`

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid7 | |
| `parentId` | `parent_id` | uuid? | self-referencing tree; `onDelete: Restrict`. Nesting is «الوحدة الأولى → الحلقات التكرارية → for» |
| `ownerScope` | `owner_scope` | enum, default `global` | v1 is one instructor/one subject, so always `global` |
| `ownerId` | `owner_id` | string? | |
| `name` | `name` | string | the topic name the mastery card prints (its **own** name, never a parent's — `packages/contracts/src/quiz/mastery.ts:32-36`) |
| `sortOrder` | `sort_order` | int, default 0 | |
| `createdAt` | `created_at` | timestamp | |

### 1.3 `QuestionBankEntry` → `question_bank_entries`

"The stable identity of a question across all its versions. **Quiz slots and analytics point at
the ENTRY; attempts point at a VERSION.**"

| field | type | meaning |
|---|---|---|
| `id` | uuid7 | |
| `categoryId` | uuid | `onDelete: Restrict` |
| `externalRef` | string? | reserved for a future QTI import/export |
| `ownerId` | string (userId) | `onDelete: Restrict` |
| `createdAt` / `updatedAt` | timestamps | |

### 1.4 `QuestionVersion` → `question_versions`

**IMMUTABLE ONCE `status <> 'draft'`.** Enforced by a DB trigger, not just service code
(`migrations/20260726144109_question_bank_constraints/migration.sql:24-50`): once status is
`ready` or `hidden`, `type`, `stem_html`, `general_feedback_html`, `default_mark`, `settings`,
`bank_entry_id` and `version` may not change. Only `status` may still move (`ready → hidden`
retires a question without touching past attempts). A sibling trigger freezes
`question_options` (INSERT/UPDATE/DELETE all refused) while the parent is non-draft.

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid7 | what `attempt_questions.question_version_id` snapshots |
| `bankEntryId` | `bank_entry_id` | uuid | |
| `version` | `version` | int | 1-based, `CHECK (version >= 1)`, unique per `(bankEntryId, version)` |
| `status` | `status` | QuestionStatus, default `draft` | |
| `type` | `type` | QuestionType | |
| `stemHtml` | `stem_html` | string | **HTML** — see §5.1 |
| `generalFeedbackHtml` | `general_feedback_html` | string? | the "explanation" shown on review («الشرح») |
| `defaultMark` | `default_mark` | Decimal(10,4), default 1 | authoring default; the *attempt* uses the slot's `maxMark` |
| `penalty` | `penalty` | Decimal(10,4), default 0 | **reserved, always 0, grader ignores it** |
| `settings` | `settings` | jsonb, default `{}` | `{ shuffleOptions, caseSensitive, minWords, maxWords, graderInfo }`. **`graderInfo` is instructor-only** and is stripped field-by-field by the learner serializer |
| `createdBy` | `created_by` | string (userId) | |
| `createdAt` | `created_at` | timestamp | |

### 1.5 `QuestionOption` → `question_options`

"The scoring primitive. `fraction` is a numeric weight that **MAY BE NEGATIVE**… there is
deliberately no `is_correct` boolean anywhere in this schema."

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid7 | |
| `questionVersionId` | `question_version_id` | uuid | cascade delete |
| `bodyHtml` | `body_html` | string | the option text as HTML. **`''` for `short_answer`** |
| `answerPattern` | `answer_pattern` | string? | `short_answer` only — the raw glob pattern. **Never sanitized**, because HTML-encoding `<` would break a pattern like `a < b`; the review screen renders it as *text*, never as HTML |
| `fraction` | `fraction` | Decimal(10,6) | weight. `CHECK (fraction >= -1 AND fraction <= 1)` |
| `feedbackHtml` | `feedback_html` | string? | per-option feedback, concatenated into `attempt_questions.feedback_html` at grade time |
| `position` | `position` | int | unique per `(questionVersionId, position)`. **For `ordering` this IS the answer key.** For every other type it is display order only |

### 1.6 `Quiz` → `quizzes`

One quiz per lesson (`lessonId` is `@unique`), cascade-deleted with the lesson.

| field | column | type | default | meaning |
|---|---|---|---|---|
| `id` | `id` | uuid7 | | |
| `lessonId` | `lesson_id` | uuid, unique | | the lesson this quiz IS |
| `durationSeconds` | `duration_seconds` | int? | null | null ⇒ untimed |
| `openFrom` | `open_from` | timestamp? | null | before it: `quiz_not_open_yet` |
| `openUntil` | `open_until` | timestamp? | null | at/after it: `quiz_closed`. Also **clamps** an attempt's deadline |
| `allowsImprovement` | `allows_improvement` | bool | false | offers ONE extra sitting on the `improvement` paper, higher score counts. Only ever true on a course's final exam — `QuizBuilderService` refuses it elsewhere |
| `passPercent` | `pass_percent` | Decimal(5,2) | 70 | |
| `shuffleQuestions` | `shuffle_questions` | bool | false | |
| `shuffleOptions` | `shuffle_options` | bool | true | ignored (forced on) for `ordering` |
| `overdueHandling` | `overdue_handling` | enum | `autosubmit` | |
| `graceSeconds` | `grace_seconds` | int | 60 | |
| `navMethod` | `nav_method` | enum | `free` | |
| `reviewOptions` | `review_options` | jsonb | (required) | the 4-window × 7-flag matrix — §8 |
| `sumMarks` | `sum_marks` | Decimal(10,4) | 0 | denormalised total of ORIGINAL-paper slot marks |
| `improvementSumMarks` | `improvement_sum_marks` | Decimal(10,4) | 0 | same for the improvement paper. **Two columns, because the papers are marked independently** |
| `gradeOutOf` | `grade_out_of` | Decimal(10,4) | 100 | what the mark is reported out of |
| `isPublished` | `is_published` | bool | false | |
| `createdAt`/`updatedAt` | | | | |

The `allowsImprovement` doc comment records the history: it **replaced** `mode`,
`max_attempts`, `grade_method` and `retry_cooldown_hours`, three of which defaulted to
"unlimited attempts, instant feedback". "The allowance is now a rule in code —
`attemptAllowance()`, one sitting or two — and **nothing in the database can widen it**."

### 1.7 `QuizSlot` → `quiz_slots`

One question position on one paper. Either `bankEntryId` **or** `poolId`, never both, never
neither.

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid7 | |
| `quizId` | `quiz_id` | uuid | cascade |
| `paper` | `paper` | QuizPaper, default `original` | **numbering restarts per paper — both papers have a question 1** |
| `position` | `position` | int | unique `(quizId, paper, position)`, **DEFERRABLE** in the hand-written migration so drag-reorder can write in one phase |
| `page` | `page` | int, default 0 | declared, unused by the runner |
| `bankEntryId` | `bank_entry_id` | uuid? | fixed question |
| `pinnedVersion` | `pinned_version` | int? | `NULL` = "latest ready version at attempt start", then snapshotted and never re-resolved |
| `poolId` | `pool_id` | uuid? | random draw |
| `maxMark` | `max_mark` | Decimal(10,4) | |
| `requirePrevious` | `require_previous` | bool, default false | declared, **not read by the runner** |

### 1.8 `QuizPool` → `quiz_pools`

"Pick 5 at random from تصنيف الحلقات التكرارية." The draw happens **once**, at attempt
creation; a resumed attempt never redraws.

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid7 | |
| `quizId` | `quiz_id` | uuid | |
| `paper` | `paper` | QuizPaper, default `original` | enforced to match its slots' paper by a composite FK (`quiz_slots_pool_paper_matches`) |
| `name` | `name` | string | |
| `pickCount` | `pick_count` | int | |
| `pointsPerQuestion` | `points_per_question` | Decimal(10,4) | each drawn question's `maxMark` |
| `sourceFilter` | `source_filter` | jsonb | `{ categoryIds: string[], types: QuestionType[] }` |

### 1.9 `QuizAttempt` → `quiz_attempts`

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid7 | |
| `quizId` / `userId` | | | unique `(quizId, userId, attemptNo)` |
| `attemptNo` | `attempt_no` | int | 1-based. `CHECK (attempt_no >= 1)` |
| `paper` | `paper` | QuizPaper, default `original` | **snapshotted at start, never recomputed.** `CHECK (paper = 'original' OR attempt_no > 1)` — the improvement paper can never be attempt #1 |
| `state` | `state` | AttemptState, default `in_progress` | |
| `startedAt` | `started_at` | timestamp | |
| `deadlineAt` | `deadline_at` | timestamp? | **PERSISTED AT START, NEVER RECOMPUTED.** Editing `durationSeconds` must not shorten or extend an in-flight attempt |
| `submittedAt` | `submitted_at` | timestamp? | `CHECK`: `state IN ('submitted','pending_review')` ⟹ non-null |
| `lastActivityAt` | `last_activity_at` | timestamp | bumped by every save/flag/submit |
| `attemptToken` | `attempt_token` | uuid, default uuid7 | **required on every write.** Rotated on every explicit resume — that is what kills a stale tab/device |
| `rawScore` | `raw_score` | Decimal(10,4)? | marks out of `sumMarks` |
| `scaledScore` | `scaled_score` | Decimal(10,4)? | marks out of `gradeOutOf` |
| `passed` | `passed` | bool? | |
| `extraTimeSeconds` | `extra_time_seconds` | int, default 0 | admin grant, **additive**, never a deadline rewrite. `CHECK >= 0` |
| `extraAttempts` | `extra_attempts` | int, default 0 | admin grant of a sitting beyond the ordinary allowance. **Not a retake** — no student-facing UI offers it. `CHECK >= 0` |
| `sumMarks` | `sum_marks` | Decimal(10,4) | **snapshot** of what `resolveSlots` actually resolved, not the quiz's live total |
| `gradeOutOf` | `grade_out_of` | Decimal(10,4) | snapshot |
| `passPercent` | `pass_percent` | Decimal(5,2) | snapshot |

Indexes: `(quizId, state)`, `(userId, quizId)`, `(state, deadlineAt)`.

### 1.10 `AttemptQuestion` → `attempt_questions`

One row per question per attempt. Unique `(attemptId, slotPosition)`.

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | uuid7 | the `attemptQuestionId` the review payload carries |
| `attemptId` | `attempt_id` | uuid | cascade |
| `slotPosition` | `slot_position` | int | **0-based index within the served paper** (see `start()`: `slots.map((slot, index) => ({ slotPosition: index, … }))`). The UI prints `slotPosition + 1` |
| `questionVersionId` | `question_version_id` | uuid | **snapshot**, `onDelete: Restrict` |
| `optionOrder` | `option_order` | int[] | permutation of the version's option `position` values, captured once. Without it, resume reshuffles the paper |
| `maxMark` | `max_mark` | Decimal(10,4) | |
| `minFraction` | `min_fraction` | Decimal(10,6) | `Math.min(0, ...option fractions)` — the per-question floor |
| `maxFraction` | `max_fraction` | Decimal(10,6) | always written as `1` |
| `response` | `response` | jsonb? | `{ kind:'choice', optionIds: string[] }` \| `{ kind:'text', text: string }` |
| `responseSeq` | `response_seq` | int, default 0 | monotonic client sequence; updates carry `response_seq < $seq` |
| `fraction` | `fraction` | Decimal(10,6)? | null for an ungraded essay |
| `mark` | `mark` | Decimal(10,4)? | |
| `state` | `state` | AttemptQuestionState, default `todo` | |
| `flagged` | `flagged` | bool, default false | |
| `rightAnswerText` | `right_answer_text` | string? | **written at SUBMIT time only** — that is why it cannot leak during the attempt |
| `responseText` | `response_text` | string? | same |
| `answeredAt` | `answered_at` | timestamp? | |
| `gradedAt` | `graded_at` | timestamp? | non-null freezes the row against further saves |
| `gradedBy` | `graded_by` | string? | grader userId, `onDelete: SetNull` |
| `feedbackHtml` | `feedback_html` | string? | concatenation of every matched option's `feedbackHtml` |

### 1.11 `AttemptEvent` → `attempt_events`

Append-only. `UPDATE` and `DELETE` are **REVOKED from `ayman_runtime` at the database level**
and a `BEFORE UPDATE OR DELETE` trigger raises `attempt_events is append-only`
(`migrations/20260726150111_attempt_constraints/migration.sql:11-27`).

| field | column | type | meaning |
|---|---|---|---|
| `id` | `id` | bigserial | |
| `attemptId` | `attempt_id` | uuid | |
| `attemptQuestionId` | `attempt_question_id` | uuid? | |
| `seq` | `seq` | int | **gap-free per attempt**, assigned by SQL as `COALESCE(MAX(seq),0)+1` inside the caller's transaction. Unique `(attemptId, seq)`. A missing number is itself evidence |
| `kind` | `kind` | AttemptEventKind | |
| `payload` | `payload` | jsonb, default `{}` | |
| `actorId` | `actor_id` | text? | userId (`::text`, not uuid) |
| `createdAt` | `created_at` | timestamp | supplied explicitly as `(now() AT TIME ZONE 'UTC')` — the column default would go through the session TZ (Africa/Cairo, +3h) |

---

## 2. API surface

### 2.1 Learner routes — `AttemptController` (`apps/api/src/modules/quiz/attempt.controller.ts`)

Class-level `@RequirePermission('quiz:attempt')`.

| # | Method + path | Perm | `@NoAnswerLeak`? | Body | Response |
|---|---|---|---|---|---|
| 1 | `GET /api/quiz/lessons/:lessonId` | `quiz:read` (method override) | no | — | `QuizOverview` |
| 2 | `POST /api/quiz/quizzes/:quizId/attempts` | `quiz:attempt` | **yes** | ignored | `StartedAttempt` |
| 3 | `POST /api/quiz/attempts/:attemptId/resume` | `quiz:attempt` | **yes** | ignored | `StartedAttempt` |
| 4 | `PUT /api/quiz/attempts/:attemptId/answers` | `quiz:attempt` | **yes** | `SaveAnswers` | `SaveResult` |
| 5 | `POST /api/quiz/attempts/:attemptId/flag` | `quiz:attempt` | **yes** | `Flag` | `{ flagged: boolean }` |
| 6 | `POST /api/quiz/attempts/:attemptId/submit` | `quiz:attempt` | no | `{ attemptToken }` | `AttemptResult` |
| 7 | `GET /api/quiz/attempts/:attemptId/preflight` | `quiz:attempt` | **yes** | — | `{ unansweredCount, total }` |
| 8 | `GET /api/quiz/attempts/:attemptId/review` | `quiz:attempt` | no | — | `ReviewPayload` |

Routes 1, 6 and 8 are deliberately exempt from the leak guard: 1 and 8 carry the student's
**own** past scores, 6 is the terminal action returning their own just-earned score
(`attempt.controller.ts:10-17`).

`POST …/attempts` takes **no `@Body()`** — the web sends `{ acknowledged: true }`
(`apps/web/components/quiz/start-attempt-button.tsx:49-53`) and the server ignores it; the
`acknowledged: true` on the `attempt_started` event is hard-coded server-side
(`attempt.service.ts:345`). Send `{}`; it is discarded either way.

### 2.2 Learner routes — `MeQuizzesController` (`me-quizzes.controller.ts`)

| Method + path | Perm | Response |
|---|---|---|
| `GET /api/me/quizzes` | `quiz:read` | `StudentQuizHistory` |
| `GET /api/me/mastery` | `quiz:read` | `StudentMastery` |

No id parameter on either — identity comes from the session only.

### 2.3 Admin routes (for completeness; a student app needs none of them)

`AdminQuestionsController` — `@Controller('admin/questions')`, `@RequirePermission('question:write')`:

```
GET    /api/admin/questions/categories
POST   /api/admin/questions/categories            { name: string 1..200 }
GET    /api/admin/questions?categoryId&search&take(≤200,def 50)&skip
POST   /api/admin/questions                        QuestionInput
GET    /api/admin/questions/:bankEntryId
PATCH  /api/admin/questions/:bankEntryId           QuestionInput  (creates draft v N+1)
POST   /api/admin/questions/:versionId/publish     → { ok: true }
POST   /api/admin/questions/:bankEntryId/duplicate → { bankEntryId }
POST   /api/admin/questions/bulk                   { categoryId, text ≤200_000 }
```

`AdminQuizzesController` — `@Controller('admin/quizzes')`, `@RequirePermission('quiz:write')`:

```
GET    /api/admin/quizzes/lesson/:lessonId
PUT    /api/admin/quizzes/lesson/:lessonId   QuizSettings → { id }
PATCH  /api/admin/quizzes/:quizId/lesson     { lessonId: uuid } → { ok: true }
GET    /api/admin/quizzes/:quizId            (builder hydration)
POST   /api/admin/quizzes/:quizId/slots      { bankEntryId, pinnedVersion?, maxMark>0, paper='original' } → { id }
DELETE /api/admin/quizzes/:quizId/slots/:slotId
PATCH  /api/admin/quizzes/:quizId/slots/order { slotIds: string[], paper='original' }
PATCH  /api/admin/quizzes/:quizId/slots/:slotId { maxMark>0 }
POST   /api/admin/quizzes/:quizId/pools      { name, pickCount>0, pointsPerQuestion>0, sourceFilter, paper }
POST   /api/admin/quizzes/:quizId/publish
```

`AdminAttemptsController` — `@Controller('admin')`:

```
GET  /api/admin/attempts?quizId&userId&state&q&take(≤200)&skip   perm attempt:read
GET  /api/admin/quizzes/:quizId/attempts (same, quizId pre-bound) perm attempt:read
POST /api/admin/attempts/:id/reopen        { extraSeconds ≥0 = 0 }  perm attempt:unlock
POST /api/admin/attempts/:id/extra-time    { seconds > 0 }          perm attempt:unlock
POST /api/admin/quizzes/:quizId/students/:userId/extra-attempt      perm attempt:unlock
```

`AdminAnalyticsController` — `GET /api/admin/quizzes/:quizId/analytics`, perm `analytics:read`,
returns `QuizAnalytics { quizId, attemptCount, meanScore|null, medianScore|null, passRate|null,
distribution: {bucket,n}[], items: {questionVersionId, stemHtml, n, facility|null,
discrimination|null, distractors: {optionId, bodyHtml, fraction, picks}[] }[] }`
(`analytics.service.ts:13-43`).

> ⚠️ `apps/api/src/test/authorization-matrix.int-spec.ts:1886-1888` still lists
> `POST /api/quiz/attempts/:attemptId/questions/:slotPosition/check` and two `appeals` routes.
> **These no longer exist** — there is no `check` handler on `AttemptController` and no appeals
> module under `apps/api/src/modules/`. Do not build a mid-attempt "check my answer" feature;
> `copy.quiz.checkAnswer` («عرض الإجابة») is dead copy with no call site in `apps/web`.

### 2.4 Wire shapes (verbatim from the contracts)

#### `QuizOverview` — `packages/contracts/src/quiz/overview.ts:48-72`

```ts
{
  quizId: string
  lessonId: string
  questionCount: number            // int, scoped to the paper about to be sat
  sumMarks: number                 // of the FACING paper (improvementSumMarks when nextPaper==='improvement')
  gradeOutOf: number
  durationSeconds: number | null   // int
  passPercent: number
  attemptsUsed: number             // int — ALL attempt rows, abandoned included
  allowsImprovement: boolean
  nextPaper: 'original' | 'improvement' | null   // null when no sitting is left OR one is in progress
  bestScore: number | null         // max scaledScore across finished sittings
  inProgressAttemptId: string | null
  blocked: { code: 'quiz_not_open_yet'|'quiz_closed'|'no_attempts_left', availableAt: string|null } | null
  attempts: AttemptHistoryRow[]    // newest first (orderBy attemptNo desc)
}

AttemptHistoryRow = {
  id: string
  attemptNo: number                // int
  state: 'in_progress'|'overdue'|'submitted'|'pending_review'|'abandoned'
  submittedAt: string | null       // ISO
  scaledScore: number | null
  passed: boolean | null
  paper: 'original' | 'improvement'
  counts: boolean                  // server decides which sitting is the grade — never Math.max on the client
}
```

`blocked` and `nextPaper` are both forced to `null`/`null` when `inProgressAttemptId` is set
(`quiz-access.service.ts:211-214`). `availableAt` is the ISO `openFrom` for
`quiz_not_open_yet`, `null` for the other two codes.

#### `StartedAttempt` — `attempt.service.ts:134-153`, mirrored client-side in `apps/web/components/quiz/attempt-schema.ts`

```ts
{
  attemptId: string
  attemptToken: string             // uuid — REQUIRED on every subsequent write
  deadlineAt: string | null        // ISO; persisted at start, never recomputed
  serverTime: string               // ISO; the clock anchor
  status: 'in_progress'            // literal — NOT `state` (leak-guard key collision)
  navMethod: 'free' | 'sequential'
  paper: 'original' | 'improvement'
  gradeOutOf: number
  sumMarks: number                 // the ATTEMPT's snapshot, not the quiz's live value
  nextSeq: number                  // lowest `seq` this client may safely send
  graceSeconds: number
  overdueHandling: 'autosubmit' | 'graceperiod' | 'autoabandon'
  questions: LearnerQuestion[]     // ordered by slotPosition asc
}

LearnerQuestion = {                // learner.serializer.ts:75-87
  slotPosition: number             // 0-based
  questionId: string               // the QuestionVersion id
  type: QuestionType
  stemHtml: string                 // HTML
  maxMark: number
  options: { id: string, bodyHtml: string }[]   // in SNAPSHOTTED order; NO `position`, NO `fraction`
  response: unknown                // the stored response object, or null
  flagged: boolean
  answered: boolean                // projection of AttemptQuestionState !== 'todo'
  settings: { minWords?: number, maxWords?: number }   // graderInfo/caseSensitive/shuffleOptions stripped
}
```

`nextSeq = max(0, ...responseSeq) + 1` (`attempt.service.ts:431`). It exists because
`responseSeq` is deliberately not exposed on `LearnerQuestion`, so a freshly launched client
has no other way to avoid losing the `responseSeq < $seq` race against an already-higher
stored value.

#### `SaveAnswers` request — `dto/save-answers.dto.ts` (all `.strict()`, unknown field ⇒ 400)

```ts
PUT /api/quiz/attempts/:attemptId/answers
{
  attemptToken: string            // z.string().uuid()
  seq: number                     // int, ≥ 1, monotonic per client
  answers: Array<{                // 1..200 items
    slotPosition: number          // int ≥ 0
    response: { kind: 'choice', optionIds: string[] /* each min 1 char, max 50 items */ }
             | { kind: 'text',  text: string /* max 20_000 chars */ }
             | null              // null = clear the answer
  }>
}
```

Response `SaveResult` (`attempt.service.ts:31-36`):

```ts
{ savedSlots: number[], serverTime: string, deadlineAt: string | null, answeredCount: number }
```

`savedSlots` lists only the slots whose UPDATE actually matched (a slot whose stored
`responseSeq >= seq` is silently skipped, `attempt.service.ts:543`). `serverTime` **re-anchors
the countdown** on every save.

#### `Flag` request

```ts
POST /api/quiz/attempts/:attemptId/flag
{ attemptToken: string /*uuid*/, slotPosition: number /*int ≥0*/, flagged: boolean }
→ { flagged: boolean }
```

**Flags do NOT ride the answer autosave** — `SaveAnswersSchema` has no `flagged` field. This is
recorded as a shipped bug in `apps/web/components/quiz/use-attempt-autosave.ts:201-228`: the
web toggle called `flushNow()`, which flushes answers only, so every flag was silently lost on
reload for as long as it existed. Send this route per toggle, fire-and-forget.

#### Submit

```ts
POST /api/quiz/attempts/:attemptId/submit
{ attemptToken: string }     // .strict() — nothing else is accepted
→ AttemptResult {
    attemptId: string
    rawScore: number
    scaledScore: number
    passed: boolean
    needsGrading: boolean
    attemptState: 'submitted' | 'pending_review'
  }
```

#### `ReviewPayload` — `packages/contracts/src/quiz/attempt.ts`

```ts
type ReviewPayload = ReviewLocked | ReviewUnlocked

ReviewLocked  = { locked: true, reason: 'during' | 'awaitingClose' }

ReviewUnlocked = {
  locked: false
  attemptId: string
  window: 'during' | 'immediatelyAfter' | 'laterWhileOpen' | 'afterClose'
  rawScore: number | null
  scaledScore: number | null
  gradeOutOf: number
  sumMarks: number
  passPercent: number
  passed: boolean | null
  questions: ReviewQuestion[]
}

ReviewQuestion = {                       // BASE — always present
  slotPosition: number
  questionId: string
  attemptQuestionId: string              // never gated by the matrix
  type: QuestionType
  stemHtml: string
  options: { id: string, bodyHtml: string }[]   // snapshotted order replayed
  // ---- every field below is PRESENT ONLY IF its matrix flag is on ----
  response?: unknown                     // iff flags.response
  correctness?: 'correct'|'partial'|'incorrect'|'needsGrading'|'unanswered'   // iff flags.correctness
  mark?: number | null                   // iff flags.marks
  maxMark?: number                       // iff flags.marks
  feedbackHtml?: string                  // iff flags.specificFeedback AND non-empty
  generalFeedbackHtml?: string           // iff flags.generalFeedback AND non-empty AND (response!=null || gradedAt!=null)
  rightAnswerText?: string               // iff flags.rightAnswer AND non-empty
  rightAnswerOptionIds?: string[]        // iff flags.rightAnswer AND choice type AND (response!=null || gradedAt!=null)
}
```

**Omission, not null, is the control.** `toReviewQuestion` builds the payload by *adding*
permitted fields to a base object; "a key whose value is null is itself information"
(`review.serializer.ts:114-119`). A Flutter model must therefore branch on **presence**, not on
null. Use `json.containsKey('correctness')`, not `correctness != null`.

#### `StudentQuizHistory` — `packages/contracts/src/quiz/history.ts`

```ts
{
  summary: {
    quizzesTaken: int, attemptsTotal: int,
    averagePercent: number|null,   // mean over ATTEMPTS
    bestPercent: number|null,
    passedCount: int               // over QUIZZES, keyed on each one's best attempt
  }
  series: Array<{                  // every submitted attempt, OLDEST FIRST
    attemptId, lessonId, quizTitle, attemptNo: int,
    scorePercent: 0..100, passed: boolean|null, submittedAt: ISO
  }>
  quizzes: Array<{                 // one row per quiz, most recently sat first
    lessonId, quizTitle, courseTitle, courseSlug,
    attemptsUsed: int, allowsImprovement: boolean, improvementUsed: boolean,
    bestPercent: 0..100|null, latestPercent: 0..100|null,
    latestAttemptId: string, passed: boolean|null, lastSubmittedAt: ISO
  }>
}
```

Only attempts with `submittedAt != null` are included (`quiz-history.service.ts:57`) — an
abandoned or running attempt has no score and must not dilute an average. `percentOf` returns
0 when `gradeOutOf <= 0`, and rounds/clamps to `0..100`.

#### `StudentMastery` — `packages/contracts/src/quiz/mastery.ts`

```ts
{ weakest: MasteryTopic[≤3], strongest: MasteryTopic[≤3], evaluated: int, pending: int }
MasteryTopic = { categoryId: uuid, name, answered: int, accuracyPercent: int 0..100,
                 lessonId: uuid|null, lessonTitle: string|null, courseSlug: string|null }
```

Constants: `MASTERY_MIN_EVIDENCE = 4`, `MASTERY_REVIEW_BELOW = 70`, `MASTERY_STRONG_AT = 90`.
Nothing is stored — recomputed on every read from `attempt_questions` over the graded states
`['submitted','pending_review']`.

---

## 3. The attempt lifecycle, as an explicit state machine

### 3.1 States

`AttemptState`: `in_progress` → (`submitted` | `pending_review` | `abandoned`). `overdue` is
declared and queried but **never written**.

`AttemptQuestionState` per question: `todo` → `complete` (answered) → at submit one of
`needs_grading` (essay) / `graded_right` / `graded_partial` / `graded_wrong`.

### 3.2 Transitions

| From | Event | Endpoint / actor | Server validation | To |
|---|---|---|---|---|
| — | start | `POST /quiz/quizzes/:quizId/attempts` | `assertCanAttempt` + advisory lock + `decideNextSitting` + `resolveSlots().length > 0` | `in_progress` (new row) |
| `in_progress` | start (again) | same | existing live attempt found inside the lock | **returns the existing attempt** (idempotent resume) |
| `in_progress` | resume | `POST /quiz/attempts/:attemptId/resume` | attempt belongs to user; `assertCanAttempt` on its quiz | `in_progress`, **token rotated** |
| `in_progress` | save | `PUT …/answers` | token match, `submittedAt IS NULL`, state live, hard-stop not passed, slot exists, `gradedAt IS NULL`, `responseSeq < seq` | `in_progress` |
| `in_progress` | flag | `POST …/flag` | token match, live state, slot exists | `in_progress` |
| `in_progress` | submit | `POST …/submit` | atomic conditional `updateMany` (`submittedAt IS NULL AND state IN (live)`) | `submitted` or `pending_review` |
| `in_progress` | clock expiry, `overdueHandling ∈ {autosubmit, graceperiod}` | **server cron**, `OverdueService.sweep()` | same conditional claim, minus the token | `submitted` / `pending_review` |
| `in_progress` | clock expiry, `overdueHandling = autoabandon` | server cron | same | `abandoned` |
| `submitted`/`pending_review` | admin reopen | `POST /admin/attempts/:id/reopen` | perm `attempt:unlock` | `in_progress`, `submittedAt = NULL`, every question's `gradedAt = NULL`, token reissued |
| `pending_review` | essay marked / regrade | `AttemptService.recomputeScore` | — | `submitted` (or stays `pending_review`) |

### 3.3 `start()` in detail — `attempt.service.ts:222-353`

1. `QuizAccessService.assertCanAttempt(userId, quizId)` — **one query** with enrollment,
   publication and open-window all in the `WHERE`:
   `quiz.isPublished && lesson.isPublished && course.status === 'published' &&
   course.enrollments.some({ userId, status ∈ ACTIVE_ENROLLMENT_STATUSES })`.
   A miss ⇒ **403 `{ code: 'quiz_not_accessible' }`** — deliberately never a 404, because
   distinguishing "no such quiz" from "not enrolled" is an enumeration oracle.
   Then `openFrom` / `openUntil`:
   - `now < openFrom` ⇒ **403 `{ code: 'quiz_not_open_yet', openFrom }`**
   - `now >= openUntil` ⇒ **403 `{ code: 'quiz_closed', openUntil }`**
2. Inside `$transaction`: `SELECT pg_advisory_xact_lock(hashtextextended('<quizId>:<userId>'))`
   — serialises concurrent starts for this pair. Two tabs racing therefore return the **same**
   attempt instead of one of them 500-ing on the unique constraint.
3. If a live attempt exists (`state ∈ {in_progress, overdue}`) ⇒ return its id (then `load()`
   without rotating the token).
4. `decideNextSitting(allowsImprovement, previousAttempts)` — §11. Not allowed ⇒
   **403 `{ code: 'no_attempts_left' }`**.
5. `resolveSlots(tx, quiz, sitting.paper)` — §3.4. Empty ⇒ **403 `{ code: 'quiz_has_no_questions' }`**.
6. `sumMarks = Σ resolved slot maxMark` (**from what was actually resolved**, not the quiz's
   live `sumMarks`).
7. `deadlineAt = durationSeconds ? startedAt + durationSeconds*1000 : null`, then
   **clamped to `openUntil`** if `openUntil` is earlier (`attempt.service.ts:294-299`).
8. Create the attempt row with `attemptNo = (max previous attemptNo) + 1`, `paper`,
   `attemptToken = randomUUID()`, snapshots of `sumMarks`/`gradeOutOf`/`passPercent`, and one
   `attempt_questions` row per resolved slot with `slotPosition = index`,
   `optionOrder = serveOrder(...)`, `minFraction`, `maxFraction = 1`, `state = 'todo'`.
9. Append `attempt_started` with payload
   `{ questionCount, deadlineAt, paper, acknowledged: true }`.
10. `load(userId, attemptId, quiz, { rotateToken: false })` → `StartedAttempt`.

### 3.4 `resolveSlots` — how a paper is drawn (`attempt.service.ts:1158-1234`)

Scoped to **one** paper (`where: { quizId, paper }`, `orderBy: position asc`).

- **Fixed slot** (`bankEntryId`): if `pinnedVersion` is set, take exactly that version;
  otherwise the highest-`version` row with `status = 'ready'`. **A slot with no ready version
  is silently skipped** (`if (!version) continue`) — it fails safe rather than crashing the
  runner, and the attempt's `sumMarks` self-corrects because it is derived from what was
  resolved.
- **Pool slot**: `questionVersion.findMany({ status: 'ready', bankEntry.categoryId ∈ filter.categoryIds?,
  type ∈ filter.types? })`, then `shuffle(candidates).slice(0, pool.pickCount)`. A pool that
  cannot fill its `pickCount` under-draws; again the denominator self-corrects.
- `minFraction` per resolved question = `Math.min(0, ...option fractions)`.
- Finally, if `quiz.shuffleQuestions` the whole resolved array is shuffled.

`shuffle` is Fisher–Yates over `node:crypto`'s `randomInt` — a CSPRNG, never `Math.random`.

`serveOrder(positions, type, quizShuffles)` (`attempt.service.ts:196-209`):

- **not `ordering`**: `quizShuffles ? shuffle(positions) : [...positions]`.
- **`ordering`**: **always shuffled, regardless of `shuffleOptions`**, and re-drawn (up to 8
  times) if the shuffle happens to return the stored order; the bounded fallback swaps the
  first two items. Reason: the stored order *is* the answer, and a fair shuffle returns the
  identity permutation 1-in-6 for a 3-item question.

### 3.5 `resume()` — `attempt.service.ts:361-369`

`POST /quiz/attempts/:attemptId/resume`:

1. Attempt must exist and belong to the caller ⇒ else **404** (bare, no body).
2. `assertCanAttempt` on its quiz — so a quiz that has since closed (`openUntil` passed) makes
   resume **403 `quiz_closed`**, even for an attempt already running.
3. `load(..., { rotateToken: true })` — issues a **fresh `attemptToken`** (only on rows with
   `submittedAt IS NULL`) and bumps `lastActivityAt`.

Rotating the token is what kills a stale tab/device: every write compiles the token into its
`WHERE`, so the older client's next save is a 409 instead of a clobber.

The web calls `resume()` on **every** visit to the attempt route — first navigation after
Start, hard reload, and reopening after a disconnect all take the identical path
(`apps/web/app/(app)/quizzes/[lessonId]/attempt/[attemptId]/page.tsx:10-35`). **Flutter should
do the same**: there is no separate "first visit" branch, and re-fetching is how you get the
current `deadlineAt`/`serverTime` pair back.

### 3.6 App killed / disconnect / resume-after-death

- Answers already flushed are on the server; nothing local is authoritative.
- On relaunch, `POST …/resume` returns the **identical** questions, in the **identical** order,
  with the **identical** option order (both snapshotted at start), plus the stored `response`
  and `flagged` per question, plus a fresh `nextSeq`.
- **Reset your local `seq` counter to the returned `nextSeq`.** Starting again at 1 makes your
  first save silently no-op against the `responseSeq < seq` guard.
- The clock keeps running while the app is dead. `copy.quiz.leaveBody` states this to the
  student: «إجاباتك محفوظة، بس الوقت هيفضل ماشي بره.»
- If the token you held has been rotated by another device (or by an admin reopen), your next
  write is **409 `attempt_stale`** and a `stale_write_rejected` event is written server-side.

### 3.7 `saveAnswers()` — every guard, in order (`attempt.service.ts:436-567`)

Pre-transaction (so a rejection can still be logged — appending inside the transaction and then
throwing would roll the event back):

1. `findFirst` on `{ id, userId, attemptToken: dto.attemptToken, submittedAt: null, state ∈ live }`.
   - miss ⇒ count rows for `{ id, userId }`. `0` ⇒ **404** (no information). Otherwise append
     `stale_write_rejected` with `{ reason: 'token_or_submitted', seq, tokenPrefix: token.slice(0,8) }`
     and throw **409 `{ code: 'attempt_stale' }`**.
2. If `deadlineAt` is set:
   `hardStop = deadlineAt + extraTimeSeconds*1000 + quiz.graceSeconds*1000`.
   `Date.now() > hardStop` ⇒ **409 `{ code: 'attempt_overdue', message: 'attempt is overdue' }`**.

Inside `$transaction`, in this order (the order is load-bearing — see below):

3. `UPDATE quiz_attempts SET last_activity_at = now()` — **first**, so this transaction locks
   `quiz_attempts` before `attempt_questions`, matching the lock order `submit()` and
   `closeOverdue()` use. It used to run last, producing an **ABBA deadlock** that the client
   triggers by construction: the timer's `onTimeUp` fires an unawaited save flush and the
   submit in the same tick, every time a timed attempt runs out.
4. For each answer:
   - unknown `slotPosition` ⇒ **400 `{ code: 'unknown_slot' }`** (aborts the whole batch).
   - `gradedAt !== null` ⇒ **409 `{ code: 'question_checked', message: 'this question has already been checked and is locked' }`**.
   - `updateMany` where `{ id, responseSeq: { lt: seq }, attempt: { attemptToken, submittedAt: null } }`
     sets `response`, `responseSeq = seq`, `state = response ? 'complete' : 'todo'`,
     `answeredAt = response ? now : null`. `count === 0` ⇒ **skip silently** (not an error).
   - On a real write, append `answer_saved` (response non-null) or `answer_cleared` (null) with
     `{ slotPosition, response, seq }`.
5. `answeredCount = count(attempt_questions where state != 'todo')`.

### 3.8 `submit()` — `attempt.service.ts:614-637`

The state transition **is** the lock: a single conditional `updateMany` on
`{ id, userId, attemptToken, submittedAt: null, state ∈ live }` setting `submittedAt` and
`lastActivityAt`. `count === 0` ⇒ 404 if not owned, otherwise
**409 `{ code: 'attempt_already_submitted' }`**. There is no read-then-write window.

Then `gradeAndFinalise` (§7).

### 3.9 The overdue sweeper — `overdue.service.ts`

`@Cron(CronExpression.EVERY_MINUTE)`. Takes `pg_try_advisory_xact_lock('ayman:quiz:overdue-sweep')`
so a second replica no-ops. Candidate query (LIMIT 500):

```sql
WHERE a.state IN ('in_progress','overdue')
  AND a.submitted_at IS NULL
  AND a.deadline_at IS NOT NULL
  AND a.deadline_at + make_interval(secs => a.extra_time_seconds + q.grace_seconds)
      < (now() AT TIME ZONE 'UTC')
```

Both sides are cast through `now() AT TIME ZONE 'UTC'` because `deadline_at` is a naive
`timestamp(3)` holding UTC wall-clock.

`closeOverdue(attemptId)` then:

- `overdueHandling = 'autoabandon'` ⇒ conditional claim → `state = 'abandoned'`,
  `submittedAt = now()`, append `abandoned` with `{}`. Returns `'abandoned'`.
- otherwise ⇒ conditional claim sets `submittedAt = now()`, then `gradeAndFinalise({ auto: true,
  actorId: null })` which appends **`autosubmitted`** (not `submitted`). Returns
  `'submitted'`/`'pending_review'`.
- A concurrent student submit that committed in between makes `claimed.count === 0` and the
  sweeper is a clean no-op (returns `null`). One failing attempt does not stop the sweep.

**Practical consequence for mobile:** an attempt whose clock expired while the app was
backgrounded is graded by the server within ~60 s. On relaunch, `resume` will 404/409 depending
on timing; the correct client behaviour is: on any `409 attempt_already_submitted` /
`409 attempt_stale` after a timeout, navigate to the **review** screen for that attempt.

---

## 4. Timing and clock rules

### 4.1 The rules

1. **`deadlineAt` is computed once, at start, and never recomputed.** Not by an instructor
   editing `durationSeconds`, not by an admin, not on resume. Accommodation is **additive** via
   `extraTimeSeconds`.
2. `deadlineAt = startedAt + durationSeconds`, **clamped down to `openUntil`** when the window
   closes first.
3. The **hard stop** the server enforces on writes is
   `deadlineAt + extraTimeSeconds + graceSeconds` — the identical formula in `saveAnswers`
   (`:479-485`) and in the sweeper's SQL.
4. Every response that a running client sees carries a fresh `serverTime`: `StartedAttempt`
   (start and resume) and `SaveResult` (every autosave). **Re-anchor on each.**
5. `durationSeconds === null` ⇒ `deadlineAt === null` ⇒ no timer at all, and the sweeper never
   picks the attempt up (it requires `deadline_at IS NOT NULL`). An untimed attempt stays
   `in_progress` forever until submitted. `copy.examGate.untimedBody`: «مفيش وقت محدد، بس
   المحاولة بتفضل مفتوحة لحد ما تتسلّم.»

### 4.2 The client countdown (`apps/web/components/quiz/quiz-timer.tsx:80-145`)

```
anchor = { perf: performance.now(), serverMs: Date.parse(serverTime) }   // re-set on every new serverTime
tick():  nowServerMs = anchor.serverMs + (performance.now() - anchor.perf)
         remainingMs = max(0, deadlineMs - nowServerMs)
```

- **The device clock is read exactly once per anchor and never again.** A wrong system clock
  cannot buy or steal time; a mid-attempt clock jump does not warp the timer. Flutter: use a
  monotonic source (`Stopwatch` / `DateTime` deltas from a `Stopwatch`), not `DateTime.now()`.
- Sampled at **250 ms**, but state is only committed when the displayed **second** changes
  (`Math.ceil(ms/1000)` on both sides), *except* the zero crossing which is committed exactly —
  `Math.ceil` of 1 ms and of 400 ms are both 1, so waiting for the ceiling would delay
  autosubmit by up to a second.
- Display format `MM:SS`, zero-padded, `tabular-nums`, mono font.
- Colour escalation on the remaining **whole seconds**:
  - `> 300` — neutral (`.runner-clock`)
  - `<= 300` — warn (`.runner-clock--warn`, `--warn` tint)
  - `<= 60` — critical (`.runner-clock--critical`, `--err` tint)
- Screen-reader announcements fire **once each** at 600 / 300 / 60 / 30 seconds through a
  separate visually-hidden `aria-live="polite"` region. The visible clock is `role="timer"`
  (implicit `aria-live="off"`) — **do not** put a live region on the ticking digits; that made
  the whole warn window unusable with a screen reader.

### 4.3 Grace period

Only when `overdueHandling === 'graceperiod'` **and** `graceSeconds > 0`:

- at `remaining <= 0` the component enters grace **instead of** firing `onTimeUp`, and starts a
  second countdown to `deadlineAt + graceSeconds`.
- the grace clock is **always** rendered critical, with
  `copy.quiz.graceRemaining` = `'الوقت خلص — فاضل {seconds} ثانية للتسليم.'`
- when the grace countdown hits 0, `onTimeUp` fires (once, latched by `firedRef`).

For `autosubmit` and `autoabandon`, `onTimeUp` fires the moment the main countdown reaches 0.
The web's `onTimeUp` is `submitOnce()` — flush pending answers, then `POST …/submit`.

> Note the asymmetry: the **server** always allows writes until
> `deadline + extraTime + graceSeconds`, whatever the `overdueHandling`. The grace *UI* only
> appears for `graceperiod`. So a client that autosubmits at `deadline` is inside the server's
> tolerance either way.

---

## 5. Question rendering — every type

### 5.1 Rich content: what Flutter must actually support

**It is HTML, not Markdown, and not LaTeX.** `stemHtml`, `bodyHtml`,
`generalFeedbackHtml` and `feedbackHtml` are HTML columns. There is **no** math renderer, **no**
image support, and **no** iframe/embed anywhere in the quiz surface.

The **exact allowlist** both sanitizers enforce
(`apps/api/src/common/sanitize/rich-text.ts:13-47` on write,
`apps/web/lib/sanitize-options.ts:27-36` on render):

```
tags:  p, br, strong, em, u, ul, ol, li, h2, h3, blockquote, code, pre, a
attrs: href, title, rel, target        (on <a> only)
schemes for href: http, https, mailto  (protocol-relative // is rejected)
forbidden outright: iframe, script, style, object, embed, form  (+ their text contents)
forbidden attrs:   style, onerror, onload, onclick, class, id
```

Every `<a>` is force-rewritten to `rel="noopener noreferrer nofollow" target="_blank"`, even if
the author supplied something else. `<div>`, `<span>`, `<h1>` and everything else outside the
list is **discarded but its text kept** (`sanitizeRichText('<div><span>نص</span></div>') === 'نص'`).

So a Flutter renderer needs exactly: paragraphs, line breaks, bold, italic, underline, ordered
and unordered lists, two heading levels, blockquote, inline `code`, `pre` blocks, and links.
`flutter_html` with a restricted tag set, or a hand-rolled parser over those 14 tags, is enough.
**Do not run a Markdown renderer over these strings** — an instructor's literal `*` or `_` is
ordinary content on a CS platform.

Layout rules the web applies to this markup:

- `overflow-wrap: anywhere` on the container (`apps/web/components/content/safe-html.tsx:45`) —
  because a bare URL as its own link text, or an inline
  `<code>ArrayIndexOutOfBoundsException</code>`, is a ~60-char unbreakable Latin run that
  overflows a 288 px column on a 360 px phone. In an RTL line box the LTR run starts at the
  right edge and disappears off the **left**, so the *beginning* of the token is what is lost.
- `pre` gets `overflow-x: auto`; the page itself never scrolls horizontally
  (`html, body { overflow-x: clip }`).
- The stem is capped at `max-width: var(--w-prose)`.
- The whole surface is RTL (`dir="rtl"`); mixed Arabic/Latin bidi is normal.

There is a plain-text ↔ HTML pair used by the admin editor and the bulk importer
(`packages/contracts/src/quiz/rich-text.ts`): `plainTextToHtml` emits `<p>…</p>` per non-blank
line with `& < >` escaped; `htmlToPlainText` reverses it decoding `&amp;` **last**. A mobile
client does not need these unless it authors questions.

### 5.2 The six types

For every type: the **stem** renders as HTML; a **flag** button sits beside it; the
**«مسح إجابتي»** (clear) control and the autosave status label sit at the bottom of the card.
Options render in the **snapshotted order the API sent** and are **never re-sorted client-side**
(`apps/web/components/quiz/question-view.tsx:80-84`).

#### `mcq_single`

- Radio group. `value = chosenIds[0] ?? ''` — never `undefined`, or the group flips between
  controlled and uncontrolled (React-specific; in Flutter: model "nothing selected" as an empty
  string / null sentinel that no option carries).
- `onChange` ⇒ `{ kind: 'choice', optionIds: [optionId] }`. Selecting a different option
  **replaces** the array.
- There is no "deselect" from a radio; only «مسح إجابتي» sets the response back to `null`.
- Authoring rule (`QuestionInputSchema`): ≥ 2 options, **exactly one** with `fraction > 1-1e-6`.

#### `true_false`

Rendered **identically to `mcq_single`** — it is a radio group over the two stored options.
`copy.quiz.true` (`'صح'`) and `copy.quiz.false` (`'خطأ'`) exist in the copy file but have **no
call site** in `apps/web`; the option bodies carry their own text. Authoring rule: exactly 2
options, exactly one full-credit.

#### `mcq_multi`

- Checkbox list. `checked = chosenIds.includes(option.id)`.
- On toggle: `nextIds = checked ? [...chosenIds, id] : chosenIds.filter(i => i !== id)`, then
  `onChange(nextIds.length > 0 ? { kind:'choice', optionIds: nextIds } : null)`.
  **Unticking the last box clears the answer to `null`**, which is what makes the question read
  as unanswered again.
- Authoring rules: ≥ 2 options, at least one `fraction > 0`, and the **positive weights must sum
  to 1** (within 1e-6). That is what makes the grader's `clamp(Σ ticked, 0, 1)` equivalent to
  Moodle's normalised form.

#### `short_answer`

- A single-line-ish `Textarea` (no `min-h-56`), `aria-label = copy.quiz.typeAnswer` («إجابتك هنا»).
- `onChange` ⇒ `{ kind: 'text', text: value }`, or `null` when the field is emptied.
- A live word count under it: `formatCopy(copy.quiz.wordCount, { n })` = `'{n} كلمة'`.
  `wordCount(text) = text.trim() === '' ? 0 : text.trim().split(/\s+/).length`.
- The **options carry no visible body** — `bodyHtml` is `''` and `answerPattern` holds the glob.
  A learner never sees them.

#### `essay`

- Same textarea, but `min-h-56` (14 rem minimum height). Same word counter.
- `settings.minWords` / `settings.maxWords` are the **only** two settings fields shipped to the
  learner. They are informational — **nothing enforces them client-side or server-side**; there
  is no validation on word count anywhere in `attempt.service.ts` or the DTO.
- Authoring rules: zero options; `maxWords >= minWords` when both are set.

#### `ordering`

- Rendered by `apps/web/components/quiz/ordering-list.tsx`, **lazily loaded** (~40-50 KB gzip of
  drag-and-drop) only when a paper contains one.
- The list starts in the **served (shuffled)** order. `resolveOrder(options, value)` reconciles
  the stored `optionIds` against the options actually served: ids no longer served are dropped,
  served ids the response never mentioned are appended. Never trust a stored array to still
  describe the question.
- **Two independent ways to move a row, both required:**
  - **Drag.** Touch sensor waits **200 ms** before claiming the gesture (`delay: 200,
    tolerance: 8`) so an ordinary scroll through a long paper still scrolls. Pointer sensor uses
    `distance: 8`. Movement is restricted to the vertical axis and to the parent element.
  - **Up/down buttons** on every row, **always visible** (not revealed on focus). These are the
    primary control for keyboard, screen-reader and unsteady-hand users. `aria-label`s are
    `copy.quiz.moveUp` / `copy.quiz.moveDown`.
- The row's **drag handle and its position number are the same element** (a 32 px mono square,
  `touch-action: none`), `aria-label = copy.quiz.orderInstruction`.
- **Every move saves the WHOLE sequence** — `onChange(next.map(o => o.id))` ⇒
  `{ kind:'choice', optionIds: [...] }`. There is no half-written order to grade.
- An **untouched** question stays `null`. Serving a shuffle and counting it as an answer would
  mark a student as having answered something they never looked at and hand full credit to
  whoever the RNG favoured.
- After each move, announce through a live region:
  `formatCopy(copy.quiz.movedTo, { item: plainText(bodyHtml), position, total })` =
  `'{item} — المركز {position} من {total}'`. `plainText` strips all tags.
- Above the list: `copy.quiz.orderInstruction`. Below it:
  `copy.quiz.orderAllOrNothing` — the all-or-nothing rule stated **before** the student answers.
- Authoring rule: **≥ 3 items** (with two, a coin flip scores full marks half the time — it
  should have been a true/false). `fraction` is stored as **0** on every option and carries no
  per-option meaning; `fraction > 0` finds **nothing** on an ordering question. Both places that
  need the model answer read `position` instead.

---

## 6. Navigation, flagging, review-during-attempt

### 6.1 `NavMethod`

`free` (default) vs `sequential`. Read straight off `StartedAttempt.navMethod`.

`apps/web/components/quiz/quiz-runner.tsx`:

- **`free`**: the «السابق» button is rendered (disabled at index 0), and the question-map
  navigator (`<aside class="runner-nav">`) is rendered.
- **`sequential`**: `<span />` is rendered in place of «السابق», and **the whole navigator aside
  is omitted**. Forward-only, via «التالي».

There is **no per-question timer** anywhere. `QuizSlot.requirePrevious` exists in the schema but
**no runtime code reads it** — do not implement it.

### 6.2 Moving between questions

- The current question is tracked by `slotPosition`, not index; `goRelative(delta)` looks up
  `questions[currentIndex + delta]` and jumps to its `slotPosition`.
- Every navigation calls `flushNow()` (fire-and-forget) **and scrolls the viewport to the top**.
  On a phone the offset before a jump is 500-600 px, so without the scroll a tap on «التالي»
  lands the student in the middle of the next question's options with the stem off screen.
  The web uses `behavior: 'auto'` deliberately, not `'smooth'`, so the reduced-motion setting is
  respected. Flutter: `jumpTo(0)` when the platform's reduce-motion flag is on.
- The submit button is reachable from **every** question, but it is `ghost` (secondary) until
  the last question, where it becomes the primary and «التالي» disappears. **Exactly one control
  on screen ever says «تسليم الامتحان».**

### 6.3 The question map (`question-navigator.tsx`)

One chip per question, wrapping flow (`display:flex; flex-wrap:wrap; gap:8px`), fixed
**36×36 px** squares (`2.25rem`), never stretched to fill the panel. Label is the 1-based
position zero-padded to two digits: `String(slotPosition + 1).padStart(2, '0')`.

**Four visual states, told apart by weight and fill, never by hue:**

| state | treatment |
|---|---|
| current | amber border (`--a-9`), 12 % amber fill, 2 px amber glow ring |
| answered | strong border, `--n-3` fill, full-strength ink |
| untouched | hairline border, `--n-1` fill, muted ink |
| flagged | an 8 px amber dot at the **block-start / inline-end** corner (logical props, so it stays away from the reader under RTL) |

> No green, no red on this grid: "nothing here knows whether an answer is right, so correctness
> colour has no business appearing" — and the grid is two taps from a screen where green and red
> *do* mean right and wrong.

Accessibility: `<nav aria-label="خريطة الأسئلة">`, roving `tabIndex` (only the active chip is
tabbable), `aria-current="step"` on the current chip, `aria-label = "سؤال {n}"` (built from
`copy.common.question` + the 1-based number). **Arrow keys are reversed for RTL**: `ArrowLeft`
moves to the **next** item, `ArrowRight` to the **previous** — the browser does not remap them,
and WAI-ARIA APG requires the reversal. `Home`/`End` jump to first/last.

Below the grid: `formatCopy(copy.quiz.answeredCount, { answered, total })`, plus
` · ` + `formatCopy(copy.quiz.flaggedCount, { n })` when `flaggedCount > 0`.

### 6.4 Flagging

- A `ghost`, `sm`-sized button beside the stem, `aria-pressed={flagged}`, label
  `flagged ? copy.quiz.unflag : copy.quiz.flag`, tinted `text-accent-text` when set.
- Toggling does **two** things: update local state **and** `POST /quiz/attempts/:id/flag`
  (fire-and-forget) **and** `flushNow()` for any pending answer.
- Fire-and-forget is deliberate: "a failed flag must never interrupt an exam or roll the marker
  back under their finger. It is a bookmark, not an answer."
- Layout note: stacked on a phone, side-by-side from `sm` up, with `shrink-0` +
  `white-space: nowrap` on the button — at 360 px the two-word labels («علّم السؤال» / «شيل
  العلامة») wrapped to two lines inside an `h-10` box and rendered outside their own border.

### 6.5 There is no mid-attempt answer reveal

`copy.quiz.checkAnswer` («عرض الإجابة») has no call site. `AttemptService`'s own comment: "A
graded question is frozen. Nothing mid-attempt grades one any more — `checkAnswer` and its
«شوف الإجابة» button are gone". The `question_checked` 409 guard stays only because `gradedAt`
is also set by submit.

---

## 7. Scoring

### 7.1 Per question — `grading/grade-question.ts`

Everything is a direct port of Moodle. The grader reads **only** the frozen question version
and the stored response — never anything the client sent with the submit request.

```
const WRONG = { fraction: 0, state: 'graded_wrong', matchedOptionIds: [] }
```

| type | rule |
|---|---|
| `essay` | **always** `{ fraction: null, state: 'needs_grading' }` — even for an empty answer. "the student wrote nothing" is a judgement, and a machine-awarded 0 on prose is the fastest route to an indefensible appeal |
| `mcq_single`, `true_false` | response must be `kind:'choice'` with **exactly one** id, and that id must exist ⇒ `fraction = chosenOption.fraction` **verbatim** (may be negative). Otherwise `WRONG` |
| `mcq_multi` | response must be `kind:'choice'`. `sum = Σ fraction of ticked options`; `fraction = clamp(sum, 0, 1)`. The clamp at 0 is why ticking every distractor cannot go sub-zero |
| `short_answer` | response must be `kind:'text'` and `text.trim() !== ''`. Graded text is **truncated to 2000 chars**. Patterns are tried in `position` order; **first match wins**, later patterns are never consulted (Moodle's `get_matching_answer()`). `fraction = matched pattern's fraction`. No match ⇒ `WRONG` |
| `ordering` | response must be `kind:'choice'`. Correct sequence read off `position` (sorted), not array order. Reject if `submitted.length !== correct.length`, or if `new Set(submitted).size !== submitted.length` (a repeat would let a 3-item question be answered with two). Then **all-or-nothing**: every index must match ⇒ `fraction = 1`, else `WRONG` |

`fractionToState` (`grading/fraction.ts`) — thresholds matter:

```
WRONG_THRESHOLD = 0.000001
RIGHT_THRESHOLD = 0.999999
!isFinite(f)      → 'graded_wrong'   // NaN fails every comparison; fail closed
f <  0.000001     → 'graded_wrong'
f >= 0.999999     → 'graded_right'   // >=, NOT >: numeric(10,6) rounding makes a 1/3 split sum to exactly 0.999999
else              → 'graded_partial'
```

Do **not** "clean these up" into `=== 0` / `=== 1`: ten options at 0.1 sum to
0.9999999999999999.

Persistence per question (`gradeAndStoreQuestion`, `attempt.service.ts:1057-1149`):

```
mark = fraction === null ? null
     : roundMark( clamp(fraction, minFraction, maxFraction) * maxMark )
roundMark(v) = Number((Math.round(v * 1e4) / 1e4).toFixed(4)) + 0   // 4 dp, and +0 collapses -0
```

and writes `fraction`, `mark`, `state`, `gradedAt = now()`, `rightAnswerText`, `responseText`,
`feedbackHtml` (concatenation of every matched option's `feedbackHtml`, or `null`), then appends
a `graded` event with `{ slotPosition, fraction, mark }`.

`describeRightAnswer` (`attempt.service.ts:91-107`) — the display string:

- `essay` ⇒ `null`
- `ordering` ⇒ every option's stripped `bodyHtml`, in **`position`** order, joined by
  `copy.quiz.answerListSeparator` (`'، '`)
- `short_answer` ⇒ the **first** option with `fraction > 0`'s raw `answerPattern`
- everything else ⇒ every option with `fraction > 0`, stripped, joined by the same separator.
  Deliberately `fraction > 0`, **not** `> RIGHT_THRESHOLD` — a multi-select's correct options
  routinely split credit 0.5/0.5 and the threshold would drop both.

`describeResponse` walks the **response** for `ordering` (the student's order *is* their answer),
and filters the option list for every other choice type.

### 7.2 Per attempt — `grading/grade-attempt.ts`

```
for each question:
  if state === 'needs_grading' || fraction === null:  needsGrading = true; contributes 0
  else: total += clamp(fraction, minFraction, maxFraction) * maxMark

rawScore    = roundMark(max(0, total))                       // attempt-level floor at 0
scaledScore = sumMarks > 0 ? roundMark(rawScore / sumMarks * gradeOutOf) : 0
passMark    = (passPercent / 100) * gradeOutOf
passed      = scaledScore >= passMark
attemptState = needsGrading ? 'pending_review' : 'submitted'
```

Per-question negatives are legal; a negative **total** is not.
"A pending essay can only ever raise the score, so a provisional pass is honest and a
provisional fail is not final — the UI says so in copy."

**Marks are scaled, so question count and total marks are independent.** For «٤٠ سؤال بـ٥٠
درجة»: give every slot `maxMark: 1` and set `gradeOutOf: 50`. 40/40 raw becomes 50/50. Do not
try to make the per-question marks add up to 50.

### 7.3 Side effects of a successful grade (`gradeAndFinalise`)

All inside the same transaction:

1. Update the attempt: `state`, `rawScore`, `scaledScore`, `passed`.
2. Append `submitted` (manual) or `autosubmitted` (sweeper) with
   `{ rawScore, scaledScore, passed }`.
3. Look up the enrollment for `(userId, courseId)` **with no publication/status predicate** — a
   mid-attempt unpublish must not make an in-flight attempt unsubmittable. If missing (the
   course/user was hard-deleted), **fail soft**: the attempt is still scored and recorded.
4. `LessonProgressService.recordQuizResultTx` — §7.4.
5. `NotificationsService.emit({ kind: 'quiz_graded', userId, lessonId, attemptId,
   scorePercent: round(scaledScore/gradeOutOf*100), passed })`. It fires even for an
   auto-graded paper whose score is already on screen: "the list is a record of what happened,
   not a push, and a history with holes in it is harder to trust."

### 7.4 Quiz result → lesson progress (`lesson-progress.service.ts:357+`)

```
state      = passed ? 'passed' : 'failed'
completion = clamp(scaledScore / gradeOutOf, 0, 1)   // 0..1 fraction
```

**⚠️ A RETAKE MUST NEVER TAKE A PASS AWAY.** Each field takes the better of the two,
independently:

- `state` — a lesson already `passed` (or manually `completed`) **stays** that way. A first-ever
  fail records `failed`.
- `completion` — `Math.max(new, existing)`, matching `bestScore` everywhere else.
- `completedAt` / `completedVia` — kept from the earlier pass; a first fail leaves them null so a
  later pass can set them.

The attempt rows themselves are untouched, so analytics and «محاولاتك» still show the 40 %.
`completeManually` **refuses** a quiz lesson outright (`400 'A quiz lesson is completed by
passing its quiz.'`).

### 7.5 Regrade — `recomputeScore` / `recomputeScoreTx`

Recomputes from the **current** `attempt_questions` fractions against the **attempt's own**
`sumMarks`/`gradeOutOf`/`passPercent` snapshots (never the quiz's live values — resolving an
appeal months later must rescale against what the exam looked like when it was sat), persists,
and appends a `regraded` event with `{ rawScore, scaledScore, passed }`.

---

## 8. Review — the 4 × 7 matrix, and what the student sees

### 8.1 Windows

`resolveReviewWindow` (`serializers/review.serializer.ts:13-23`), a port of Moodle's
`quiz_attempt::get_attempt_state()`. **Order matters.**

```
if (!submittedAt)                                          → 'during'
elapsedSeconds = (now - submittedAt) / 1000
if (elapsedSeconds < 120)                                  → 'immediatelyAfter'   // IMMEDIATELY_AFTER_SECONDS
if (!openUntil || now < openUntil)                         → 'laterWhileOpen'
                                                           → 'afterClose'
```

The 120-second grace beats a quiz that closed during it, so a student who submits at the buzzer
still sees their result.

### 8.2 Flags

Seven per window (`packages/contracts/src/quiz/quiz-settings.ts:11-19`):
`response, correctness, marks, specificFeedback, generalFeedback, rightAnswer, overallFeedback`.

`DEFAULT_REVIEW_OPTIONS`:

| window | response | correctness | marks | specificFeedback | generalFeedback | rightAnswer | overallFeedback |
|---|---|---|---|---|---|---|---|
| `during` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `immediatelyAfter` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `laterWhileOpen` | ✓ | ✓ | ✓ | ✓ | ✓ | **✗** | ✓ |
| `afterClose` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

A second `DEFAULT_REVIEW_OPTIONS_PRACTICE` used to exist and is gone with the practice mode.
The matrix itself stays fully configurable per quiz.

**`overallFeedback` is declared and stored but has no consumer** — nothing in
`toReviewQuestion` or the review page reads it.

### 8.3 Locked

If **every** flag in the resolved window is false, the endpoint returns
`{ locked: true, reason: window === 'during' ? 'during' : 'awaitingClose' }` **and no
`questions` array at all**. An empty array plus a flag "would still tell the client how many
questions there were".

UI (`apps/web/components/quiz/review-locked.tsx`): a single card, centred, `py-12`, with

- `copy.quiz.reviewLocked` («المراجعة مش متاحة دلوقتي») in medium weight, then
- `reason === 'during' ? copy.quiz.reviewLockedDuringBody : copy.quiz.reviewLockedUntilClose`
- **and critically no question list at all** — a list of locked cards would still leak the
  question count and order.

### 8.4 Per-question gating rules (`toReviewQuestion`)

```
base: slotPosition, questionId, attemptQuestionId, type, stemHtml, options[]

if (flags.response)     payload.response = row.response ?? null
if (flags.correctness)  payload.correctness = row.response == null
                          ? 'unanswered'
                          : toCorrectness(row.state)
if (flags.marks)        payload.mark = row.mark == null ? null : Number(row.mark)
                        payload.maxMark = Number(row.maxMark)
if (flags.specificFeedback && row.feedbackHtml)          payload.feedbackHtml = …
if (flags.generalFeedback && version.generalFeedbackHtml
    && (row.response != null || row.gradedAt != null))   payload.generalFeedbackHtml = …
if (flags.rightAnswer && row.rightAnswerText)            payload.rightAnswerText = …
if (flags.rightAnswer && isChoiceType(type)
    && (row.response != null || row.gradedAt != null))   payload.rightAnswerOptionIds = …
```

`toCorrectness` — the **only** place the six-value grading state collapses to the five-value
learner label:

```
todo            → 'unanswered'
complete        → 'needsGrading'    // answered, not yet graded
needs_grading   → 'needsGrading'
graded_right    → 'correct'
graded_partial  → 'partial'
graded_wrong    → 'incorrect'
```

**The `unanswered` override matters.** `gradeQuestion` scores a skipped question as
`graded_wrong` (0 marks is the only correct *score*), but the student-facing *label* is
overridden to `'unanswered'` when `row.response == null`, so it reads "you didn't get to this"
in muted grey rather than "you tried and got this wrong" in red. This is done in the serializer,
never in the grader, so it can never affect the mark.

`rightAnswerOptionIds`:

- `ordering` ⇒ **all** option ids, sorted by `position`. `fraction` is not consulted.
- other choice types ⇒ ids of options with `Number(fraction) > 0`.
- omitted entirely when the array is empty.
- Never derived by re-splitting `rightAnswerText` on the separator — an option's own body can
  legitimately contain «، ».

The two `(row.response != null || row.gradedAt != null)` gates are load-bearing: the window is
resolved once for the **whole attempt** with no per-question condition, and both
`generalFeedbackHtml` and `rightAnswerOptionIds` come off the frozen question bank row, fully
populated from the instant the attempt is created. Without the gates, a quiz whose matrix grants
`during.rightAnswer` would ship the answer key at attempt start.

### 8.5 Access to review

`AttemptService.review` requires the attempt to belong to the caller (**404** otherwise) **and**
`LessonAccessService.requireOwnership(userId, lessonId)` — so a student whose enrolment was
revoked, or whose lesson/course was unpublished after they sat it, loses review access too
(also **404**). `requireOwnership`, not `require`: the progression gate is deliberately not
consulted, because an admin publishing a lesson mid-attempt must not make an existing review
unreachable.

Client handling (`apps/web/app/(app)/quizzes/[lessonId]/attempt/[attemptId]/review/page.tsx:86-94`):
**403 and 404 are ordinary answers, not faults** — show a "not found" screen, do **not** surface
a generic error and do **not** report it to an error log. Six false fault rows came from exactly
that: one person, one revoked link, six presses of «حاول تاني».

---

## 9. `AttemptEvent` — what is logged and who must emit it

**The mobile client emits NO events directly. There is no event-ingestion endpoint.** Every
event is written server-side, inside the transaction of the action that caused it. What a mobile
client must do is *call the endpoints*, which is what produces the events.

| kind | written by | payload | triggered by |
|---|---|---|---|
| `attempt_started` | `AttemptService.start` | `{ questionCount, deadlineAt, paper, acknowledged: true }` | `POST /quiz/quizzes/:quizId/attempts` |
| `answer_saved` | `saveAnswers` | `{ slotPosition, response, seq }` | `PUT …/answers` with a non-null response that actually wrote |
| `answer_cleared` | `saveAnswers` | `{ slotPosition, response: null, seq }` | `PUT …/answers` with `response: null` |
| `flag_toggled` | `setFlag` | `{ slotPosition, flagged }` | `POST …/flag` |
| `stale_write_rejected` | `saveAnswers` | `{ reason: 'token_or_submitted', seq, tokenPrefix }` | a save with a rotated token or on a submitted attempt |
| `graded` | `gradeAndStoreQuestion` | `{ slotPosition, fraction, mark }` | once per question at submit/autosubmit |
| `submitted` | `gradeAndFinalise({auto:false})` | `{ rawScore, scaledScore, passed }` | `POST …/submit` |
| `autosubmitted` | `gradeAndFinalise({auto:true})` | `{ rawScore, scaledScore, passed }` | overdue sweeper |
| `abandoned` | `closeOverdue` | `{}` | sweeper on `overdueHandling = autoabandon` |
| `regraded` | `recomputeScoreTx` | `{ rawScore, scaledScore, passed }` | essay marking / regrade |
| `attempt_reopened` | `AttemptAdminService.reopen` | `{ extraSeconds }` | admin |
| `extra_time_granted` | `grantExtraTime` | `{ seconds }` | admin |
| `extra_attempt_granted` | `grantExtraAttempt` | `{ quizId, userId }` | admin |
| `question_viewed` | — | — | **never written** |
| `answer_checked` | — | — | **never written** |
| `appeal_opened` / `appeal_resolved` | — | — | **retired, never written** |

`actorId` is the student's userId for `attempt_started`/`answer_*`/`flag_toggled`/
`stale_write_rejected`/`submitted`, the admin's for the three admin kinds, and `null` for
`autosubmitted`/`abandoned`/`regraded`.

**So the client's obligation is behavioural, not telemetric:**

1. Call `POST …/attempts` (never fabricate an attempt locally).
2. Flush answers through `PUT …/answers` with a **monotonic `seq` seeded from `nextSeq`** —
   otherwise the server writes nothing and logs nothing, silently.
3. Send **every** flag toggle to `POST …/flag` — the answer autosave carries no `flagged` field.
4. Call `POST …/submit` explicitly; do not rely on the sweeper (that produces `autosubmitted`,
   which is a different fact in the log).
5. Never retry a **409** save — the server has already recorded `stale_write_rejected`, and
   retrying forever is how a second device silently loses an hour of work.

---

## 10. Anti-cheat / integrity — what exists, and what does not

### 10.1 What actually exists

| control | where | mobile equivalent |
|---|---|---|
| **Answer data never reaches the client pre-submission** | `LEARNER_QUESTION_SELECT` (columns not selected), `toLearnerQuestion` (field-by-field construction), `NoAnswerLeakInterceptor` (runtime deep key scan, throws 500) | nothing to do — trust the payload shape; do not add fields |
| **`attemptToken` on every write, rotated on resume** | `quiz_attempts.attempt_token`; every write compiles it into the `WHERE` | store it per attempt; replace it on every `resume`; on 409 stop and show the stale screen |
| **`responseSeq` monotonic guard** | `updateMany … responseSeq: { lt: seq }` | one counter per attempt seeded from `nextSeq`, incremented **per send attempt** (retries included), never per edit |
| **Atomic submit claim** | conditional `updateMany` — no read-then-write window | treat 409 as "already submitted", navigate to review |
| **Server-authoritative clock** | `deadlineAt` + `serverTime`, `performance.now()` anchoring | monotonic clock only |
| **Server-computed unanswered count** | `GET …/preflight` | never show a locally-computed headline count in the submit dialog |
| **CSPRNG shuffles** | `randomInt` from `node:crypto` | server-side only |
| **Ordering forced-shuffle + identity re-draw** | `serveOrder` | server-side only |
| **Question versions frozen at `ready`** | DB triggers | — |
| **Append-only event log** | `REVOKE UPDATE, DELETE` + trigger | — |
| **The exam gate acknowledgement** | `attempt_started.payload.acknowledged = true` | show the gate dialog before creating the attempt (§14.2) |
| **Pull-to-refresh disabled during an attempt** | `document.documentElement.style.overscrollBehaviorY = 'contain'` while the runner is mounted | Flutter: use a non-refreshing scroll view on the runner route |
| **Back gesture intercepted** | `useBackDismiss(..., { rearm: true })` opens a leave-confirm dialog; re-arms after every press | `PopScope(canPop: false, onPopInvoked: …)` showing the same dialog |
| **App chrome removed on the attempt route** | `ChromeUnlessAttempt` + `student-shell.tsx` — no rail, topbar, bell, or account menu; "the runner owns the whole viewport" | full-screen route, no bottom nav, no app bar |

### 10.2 What does **not** exist — do not invent it

Verified by grep across `apps/web/components/quiz`, `apps/web/app/(app)/quizzes` and
`apps/api/src/modules/quiz`:

- **No paste blocking.** No `onPaste`, no `onCopy`, no `user-select: none`, no context-menu
  suppression anywhere.
- **No tab-visibility *reporting*.** `visibilitychange` is listened for in exactly one place —
  `use-attempt-autosave.ts:175-184` — and it is used **only** to flush pending answers with
  `keepalive: true`. Nothing is logged, no event kind exists for it, and the server has no
  awareness of focus loss.
- **No screenshot detection, no screen-recording detection, no proctoring, no camera, no
  keystroke telemetry, no IP/device pinning.**
- **No per-question timer**, no forced pacing, no `requirePrevious` enforcement.

**Mobile equivalents you should implement anyway** (these are new behaviour, not parity — call
them out to the product owner before shipping):

- flush on `AppLifecycleState.paused` / `inactive` (the direct analogue of the web's
  `visibilitychange` + `pagehide` flushes with `keepalive`);
- treat process death as "resume on relaunch", not "abandon";
- do **not** add screenshot blocking or proctoring silently — the platform has deliberately
  taken the position that the exam gate's stated consequences plus one sitting are the control.

---

## 11. The two-paper concept (`QuizPaper`)

### 11.1 Why one quiz and not two

`Quiz.lessonId` is `@unique` and an exam **is** a lesson. A separate improvement quiz would have
to be a separate lesson — "and that creates a second 'the student's exam score' that can drift
from the first. One quiz, two papers keeps one score, one gate rule and one grading path."
(`schema.prisma:2646-2655`, `quiz-settings.ts:84-94`.)

- Slots carry `paper`; **numbering restarts per paper** (unique on `(quizId, paper, position)`),
  so both papers have a question 1.
- Pools carry `paper`, enforced to match their slots' by the composite FK
  `quiz_slots_pool_paper_matches`.
- The improvement sitting therefore draws **completely different questions**. Build both papers:
  e.g. 40 slots `paper: 'original'`, 40 more `paper: 'improvement'`.
- `Quiz.sumMarks` and `Quiz.improvementSumMarks` are separate denormalised totals — "a single
  total would be the sum of an exam nobody sits."
- `QuizAttempt.paper` is snapshotted at start and never recomputed.
- DB `CHECK "quiz_attempts_improvement_is_not_first": paper = 'original' OR attempt_no > 1`.

### 11.2 The allowance rule — the ONLY place it is decided

`packages/contracts/src/quiz/quiz-settings.ts:140-142`:

```ts
export function attemptAllowance(allowsImprovement: boolean): number {
  return allowsImprovement ? 2 : 1;
}
```

`apps/api/src/modules/quiz/attempt-allowance.ts:50-63`:

```ts
decideNextSitting(allowsImprovement, attempts):
  granted   = Σ attempts.extraAttempts
  allowance = attemptAllowance(allowsImprovement) + granted
  if (attempts.length >= allowance) → { allowed: false, reason: 'no_attempts_left' }
  useImprovement = allowsImprovement
                && hasFinished(attempts, 'original')      // state ∈ {submitted, pending_review}
                && !hasFinished(attempts, 'improvement')
  → { allowed: true, paper: useImprovement ? 'improvement' : 'original' }
```

**Every attempt row consumes the allowance, whatever its state — `abandoned` included.** This is
deliberate: `abandoned` is what `overdueHandling: 'autoabandon'` produces, so treating it as
"didn't count" would mean a student who dislikes their paper can walk away and be handed a fresh
one. "That is a retake with extra steps, and retakes are the thing this module exists to remove."

The escape hatch is `extraAttempts` — an admin grant, written through the audit log. A student
cannot ask for one and no UI offers it.

The improvement paper is only ever reached by someone who **finished** the original. A student
whose first sitting died mid-exam and was granted an extra attempt therefore **redraws the
ORIGINAL paper**, not the improvement one.

### 11.3 Which sitting counts

`countingAttemptId` (`attempt-allowance.ts:79-95`): sort by `attemptNo` ascending (**sorted
here, not trusted from the caller** — the overview query passes `desc`), take the highest
`scaledScore`, skipping nulls. **Ties go to the earlier sitting** — "a student who improves to
exactly the same mark has not improved."

This is resolved **server-side** and sent as `AttemptHistoryRow.counts`. A client-side
`Math.max` disagrees with the server the moment one sitting is `pending_review` with a null
score. **Do not compute it in Flutter.**

`quiz-history.service.ts` computes `bestPercent` the same way for `/api/me/quizzes`.

### 11.4 Publish-time validation of the improvement paper

`quiz-builder.service.ts:413-527` — `POST /api/admin/quizzes/:quizId/publish` rejects with 400 on:
`quiz_has_no_slots`, `improvement_paper_empty`, `improvement_sum_marks_must_be_positive`,
`improvement_paper_orphaned`, `slot_has_no_ready_version` (with `slotId`),
`sum_marks_must_be_positive`. Writing an improvement slot on a quiz with
`allowsImprovement = false` is `400 improvement_not_enabled`, checked on the **write**, not only
at publish.

> ⚠️ Operational note from the runbook: the API throttles bulk slot creation at roughly 20
> consecutive POSTs (429). Building an 80-slot exam in a tight loop silently half-fails.

---

## 12. The known deadlock around a failed sitting — history and current state

**This was a real, measured production incident, and it is FIXED. Do not reproduce the old
behaviour in the mobile app.**

**What it was.** `resolveGate` walked every published lesson in reading order and opened one
only when its predecessor was `cleared`. A quiz lesson clears **only** by passing
(`recordQuizResult` writes `passed`/`failed`; `completeManually` refuses a quiz outright), and
`attemptAllowance` gives a lecture quiz **one** sitting with no retake.

So: score under `passPercent` once → `failed`, which is not `cleared`, **forever**, with no
action available. Measured on production 2026-08-17: **3 of the 6** students who had sat the
المحاضرة الثانية quiz were permanently stopped at lecture 3.

**What it is now** (`apps/api/src/modules/progress/gate-rule.ts`):

```
1. state ∈ {completed, passed}  → 'cleared'
2. lesson.id === course.examLessonId → 'available' iff EVERY OTHER published LECTURE is cleared, else 'locked'
3. everything else → 'available'
```

- `isLecture(lesson) = lesson.kind !== 'quiz'` — **quizzes are excluded from the exam's
  prerequisite set**, precisely because a quiz gets one sitting and `failed` is not cleared.
- The per-lesson chain is **gone entirely** — column, enum and all. Every lesson except the exam
  is unconditionally `available`.
- The exam is the one thing still gated, because "the final exam opens when you finish the
  course" is a rule students expect, and because removing it would let a student spend their
  single sitting on day one.
- A `locked` lesson throws the same **404** as a nonexistent one (never 403 — that would confirm
  the lesson exists).

**The two residual deadlock-shaped behaviours a mobile client must still render honestly:**

1. **A failed one-sitting quiz is terminal.** `blocked.code = 'no_attempts_left'`,
   `nextPaper = null`. The copy for this is `copy.quiz.noAttemptsLeft` («الامتحان ده اتقدّم
   خلاص»), and the pass/fail badge deliberately says `copy.quiz.failed` = **«محتاجة مراجعة»**,
   not «محتاجة محاولة تانية» — the platform stopped offering that, and a badge telling the
   student to do the one thing the server will refuse was the bug.
2. **The improvement sitting is one-shot.** Once `improvementUsed`, `/results` shows
   `copy.quiz.improveUsed` («محاولة التحسين اتستعملت») rather than the generic "already sat".

**The generalised lesson**, from the incident write-up: *before putting anything in a
progression chain, ask what happens when the student fails it and cannot retry. A gate with no
exit is worse than no gate.*

---

## 13. All Arabic copy, verbatim

Namespace `copy.quiz` — `packages/contracts/src/copy/ar.ts:3986-4193`.

```
papers.original            الامتحان الأصلي
papers.improvement         امتحان التحسين
hint                       مراجعة الإجابات كويس قبل التسليم.
start                      نبدأ الامتحان
startFailed                مقدرناش نبدأ الامتحان دلوقتي. مفيش محاولة اتحرقت خالص — تأكيد على النت ونجرّب تاني.
resume                     نكمّل امتحانك
attemptNo                  المحاولة رقم {n}
singleAttempt              محاولة واحدة
twoAttempts                محاولة + تحسين
noSittingsLeft             مفيش محاولات تانية
questionCount              {n} سؤال
totalMarks                 الدرجة الكلية {marks}
duration                   مدة الامتحان {minutes} دقيقة
noTimeLimit                من غير وقت محدد
timeLeft                   الوقت المتبقي                       [declared, no call site]
timeAlmostUp               الوقت قرب يخلص                      [declared, no call site]
timeRemaining10Min         باقي 10 دقايق على انتهاء وقت الامتحان
timeRemaining5Min          باقي 5 دقايق على انتهاء وقت الامتحان
timeRemaining1Min          باقي دقيقة واحدة على انتهاء وقت الامتحان
timeRemaining30Sec         باقي 30 ثانية على انتهاء وقت الامتحان
questionOf                 سؤال {current} من {total}
next                       التالي
previous                   السابق
flag                       علّم السؤال
unflag                     شيل العلامة
flaggedCount               {n} سؤال معلّم
answeredCount              جاوبت على {answered} من {total}
clearAnswer                مسح إجابتي
navigator                  خريطة الأسئلة
saving                     بيتحفظ…
saved                      اتحفظ
saveFailed                 مقدرناش نحفظ إجابتك — بنحاول تاني
staleTab                   الامتحان ده مفتوح في مكان تاني. تحديث الصفحة عشان نكمّل من هنا.
submit                     تسليم الامتحان
submitConfirmTitle         نسلّم الامتحان؟
submitConfirmBody          بعد التسليم مش هتقدر تغيّر إجاباتك.
submitConfirmUnanswered    لسه فيه {count} سؤال من غير إجابة.
submitConfirmAllAnswered   جاوبت على كل الأسئلة.
submitCancel               الرجوع للأسئلة
submitConfirmAction        أيوه، نسلّم
submitting                 بيتسلّم…
alreadySubmitted           الامتحان ده اتسلّم خلاص.
leaveTitle                 الخروج من الامتحان؟
leaveBody                  إجاباتك محفوظة، بس الوقت هيفضل ماشي بره. والرجوع للكمالة من نفس المكان ممكن قبل ما الوقت يخلص.
leaveStay                  نكمّل الامتحان
leaveConfirm               الخروج من الامتحان
timeUpTitle                الوقت خلص                            [declared, no call site]
timeUpBody                 امتحانك اتسلّم تلقائيًا.               [declared, no call site]
graceRemaining             الوقت خلص — فاضل {seconds} ثانية للتسليم.
checkAnswer                عرض الإجابة                          [DEAD — mid-attempt reveal was removed]
correct                    إجابة صحيحة
incorrect                  إجابة خاطئة
partial                    إجابة صح جزئيًا
needsGrading               محتاج تصحيح من المدرّس
notAnswered                مجاوبتش
yourAnswer                 إجابتك
rightAnswer                الإجابة الصحيحة
explanation                الشرح
questionFeedback           ملاحظة على إجابتك
marksEarned                {earned} من {max}
resultsTitle               نتيجتك
reviewTitle                مراجعة إجاباتك
reviewLocked               المراجعة مش متاحة دلوقتي
reviewLockedUntilClose     هتقدر تراجع إجاباتك بعد ما الامتحان يقفل.
reviewLockedDuringBody     هتقدر تراجع إجاباتك بعد ما تسلّم المحاولة.
passed                     ناجح
failed                     محتاجة مراجعة
passMark                   درجة النجاح {percent}%
noAttemptsLeft             الامتحان ده اتقدّم خلاص
closed                     الامتحان قفل
notOpenYet                 الامتحان لسه مفتحش
notEnrolled                الامتحان للمشتركين في الكورس بس       [declared, no call site]
previousAttempts           محاولاتك السابقة
bestScore                  أعلى درجة
essayPending               إجابتك المقالية عند المدرّس للتصحيح
wordCount                  {n} كلمة
typeAnswer                 إجابتك هنا
chooseOne                  إجابة واحدة بس                       [declared, no call site]
chooseMany                 كل الإجابات الصحيحة                  [declared, no call site]
true                       صح                                   [declared, no call site]
false                      خطأ                                  [declared, no call site]
orderInstruction           ترتيب العناصر بالسحب، أو بأزرار التحريك
moveUp                     حرّك لفوق
moveDown                   حرّك لتحت
movedTo                    {item} — المركز {position} من {total}
yourOrder                  ترتيبك
rightOrder                 الترتيب الصحيح
orderAllOrNothing          السؤال ده بيتصحح كامل — الترتيب لازم يبقى مظبوط كله
answerListSeparator        «، »   (Arabic comma + space — the join separator for answer lists)
blockedTitle               الامتحان مش متاح دلوقتي               [declared, no call site]
reviewAnswers              مراجعة الإجابات
improveExam                دخول امتحان التحسين
improveUsed                محاولة التحسين اتستعملت
counts                     الدرجة المحتسبة
wrongOnly                  الغلطات بس
showAll                    كل الأسئلة
wrongCount                 {n} غلط من {total}
allCorrect                 مفيش ولا غلطة — ورقة كاملة
scoreBandExcellent         أداء ممتاز
scoreBandGood              أداء كويس
scoreBandNeedsWork         محتاج مراجعة للدرس تاني
unansweredChipLabel        سؤال {n}                              [declared, no call site]
```

Namespace `copy.examGate` — `ar.ts:4194-4217`:

```
title                      قبل البداية
intro                      الكلام ده يستاهل دقيقة قراية.
focusTitle                 تركيز في كل سؤال
focusBody                  الامتحان بيتفتح مرة واحدة، ومفيش رجوع بعد التسليم.
recordedTitle              درجتك هتتسجّل
recordedBody               النتيجة بتتحفظ في سجلك وبتفضل فيه — مش بتتمسح ولا بتترجع.
onceTitle                  محاولة واحدة بس
onceBody                   الكويز ده ليه محاولة واحدة. حلّه وانت مركّز.
onceExamBody               دي محاولتك الأصلية. بعدها فيه محاولة تحسين واحدة، وأعلى درجة هي اللي بتتحسب.
timedBody                  الامتحان {minutes} دقيقة من أول دوسة على «نبدأ»، والوقت بيمشي حتى لو الصفحة اتقفلت.
untimedBody                مفيش وقت محدد، بس المحاولة بتفضل مفتوحة لحد ما تتسلّم.
agree                      تمام، نبدأ الامتحان
cancel                     مش دلوقتي

improveTitle               امتحان التحسين
improveIntro               قبل الدخول، في حاجتين لازم يكونوا معروفين.
improveDifferentTitle      الأسئلة هتكون مختلفة
improveDifferentBody       ده امتحان تاني بأسئلة غير اللي فاتت. مذاكرة الأول، والاعتماد على اللي فات مش هينفع.
improveSafeTitle           درجتك الحالية في أمان
improveSafeBody            أعلى درجة في الاتنين هي اللي بتتحسب. ولو الدرجة طلعت أقل، الأولى هي اللي هتفضل.
improveOnceBody            ودي فرصتك الوحيدة للتحسين — مفيش محاولة تالتة.
improveAgree               تمام، نبدأ التحسين
```

Namespace `copy.quizErrors` (authoring/validation — only the admin surface renders these) —
`ar.ts:4218-4245`:

```
exactlyOneCorrect          لازم تحدد إجابة صحيحة واحدة بالظبط
atLeastTwoOptions          لازم يكون فيه اختيارين على الأقل
trueFalseNeedsTwo          سؤال صح وخطأ لازم يكون له اختيارين بالظبط
multiWeightsMustSumToOne   مجموع أوزان الإجابات الصحيحة لازم يساوي 1
multiNeedsPositive         لازم يكون فيه إجابة صحيحة واحدة على الأقل
shortAnswerNeedsFullCredit لازم يكون فيه نموذج إجابة واحد على الأقل بوزن 1
patternRequired            نموذج الإجابة لسه فاضي
patternTooLong             نموذج الإجابة طويل جدًا
tooManyWildcards           نموذج الإجابة فيه علامات * كتير جدًا
stemRequired               نص السؤال لسه فاضي
optionBodyRequired         نص الاختيار لسه فاضي
essayHasNoOptions          السؤال المقالي مالوش اختيارات
orderingNeedsThree         سؤال الترتيب لازم يكون فيه 3 عناصر على الأقل
maxWordsBelowMin           أكبر عدد كلمات لازم يكون أكبر من أقل عدد
fractionRange              وزن الاختيار لازم يكون بين -1 و 1
importNoQuestions          مفيش أسئلة في النص ده
importNoAnswerLine         السؤال رقم {n}: مفيش سطر إجابة
importUnknownLetter        السؤال رقم {n}: حرف إجابة مش موجود ({letter})
importNoOptions            السؤال رقم {n}: مفيش اختيارات
importUnknownType          السؤال رقم {n}: نوع سؤال مش معروف
```

Shared strings the quiz surface uses from other namespaces:

```
copy.common.close          (X button label on every dialog)
copy.common.retry          حاول تاني-equivalent; used by the stale screen and the preflight retry
copy.common.error          (the preflight failure line)
copy.common.loading        (the preflight pending line)
copy.common.saveFailed     (submit failure toast)
copy.common.question       سؤال  (built into the nav chip aria-label: "سؤال {n}")
copy.player.quizIntro      الدرس ده اختبار — نبدأه في أي وقت.
copy.player.quizCta        نبدأ الاختبار
copy.player.quizYourScore  درجتك في الاختبار
copy.player.quizPassedNote نجحت، والدرس اتقفل.
copy.player.quizFailedNote مراجعة الإجابات والدخول تاني ممكنين طول ما الاختبار مفتوح.
copy.player.quizOpenCta    فتح الاختبار
copy.player.quizAttachedIntro      في كويز قصير على المحاضرة دي.
copy.player.quizAttachedPassedNote نجحت في الكويز.
copy.player.quizAttachedCta        حلّ الكويز
copy.player.quizAttachedOpenCta    فتح الكويز
copy.results.best          أعلى درجة
copy.results.latest        آخر محاولة
copy.results.attemptsUsed  محاولاتك
copy.results.attemptsOf    {used} من {max}
copy.notifications.quizGraded        اتصحّحت ورقتك — الدرجة {score}%
copy.notifications.quizGradedPassed  نجحت
copy.notifications.quizGradedFailed  محتاجة مراجعة
copy.notifications.extraAttempt      المدرّس دّالك محاولة زيادة في الامتحان ده
```

### 13.1 Interpolation and number formatting

`formatCopy(template, vars)` (`packages/contracts/src/format.ts:11-18`) replaces `{name}`
placeholders. **Unknown placeholders are left untouched** rather than replaced with
"undefined", so a typo is visible in the UI.

`formatMark(value)` = `String(Math.round(value * 100) / 100)` — at most 2 dp, trailing zeros
dropped, **Latin digits**. Use it for every score (`scaledScore` is a `Decimal(10,4)`, so a
3-mark paper scaled to 100 arrives as `66.6667`; nobody's exam is out of 66.6667).

⚠️ **Digit inconsistency to preserve exactly.** The intro screen's "sittings" tile hard-codes
**Arabic-Indic** numerals — `'٠'` / `'١'` / `'٢'`
(`apps/web/app/(app)/quizzes/[lessonId]/page.tsx:200`) — while every other number on the same
screen is Latin (via `formatCopy`/`formatMark`). Reproduce as-is unless the product owner says
otherwise.

---

## 14. Screen by screen

The whole surface is **RTL**. Design tokens (`packages/ui/src/tokens/`):

```
spacing   --s-2 2px  --s-4 4  --s-8 8  --s-12 12  --s-16 16  --s-20 20  --s-24 24  --s-32 32 …
radii     --r-sm 4px (inputs/buttons)  --r-md 6px (default)  --r-lg 8px (cards/modals — the ceiling)
hairline  1px (0.5px at ≥2dppx)
type      --fs-title-1 2rem/1.3 · --fs-title-2 1.5/1.4 · --fs-title-4 1.0625/1.5
          --fs-text-lg 1.0625/1.75 · --fs-text-base 0.9375/1.75 · --fs-text-sm 0.875/1.65
          --fs-text-xs 0.8125/1.55 · --fs-mono-label 0.75/1.4
colour (light)  --n-1 #FDFCFB  --n-2 #F9F8F6  --n-3 #F4F2EF  --n-4 #ECEAE6
                --n-10 #807B73  --n-11 #666158  --n-12 #1A1714
                --a-9 oklch(0.770 0.152 72)   (amber accent; text on it is #1A1206)
                --ok oklch(0.476 0.130 150)  --err oklch(0.514 0.200 25)  --warn oklch(0.492 0.100 85)
                --border #0000001F  --border-strong #00000033
colour (dark)   --n-1 #08090A  --n-2 #100F0E  --n-3 #171512  --n-4 #1F1C18
                --n-10 #8A837B  --n-11 #B4ACA3  --n-12 #F1EEEB
                --a-9 oklch(0.780 0.150 74)
                --ok oklch(0.68 0.16 150)  --err oklch(0.62 0.20 25)  --warn oklch(0.75 0.14 85)
                --border #FFFFFF1F  --border-strong #FFFFFF33
```

**Green and red appear in exactly three places in the whole product**: the result header
(`result-header.tsx`), the per-question verdicts (`review-question.tsx`), and the pass/fail
verdict chip (`.verdict`). Nowhere else. Amber is "position / pressable"; green and red are
reserved for correctness. **Colour is never the only channel** — every highlighted row carries
an icon **and** a visible text label (WCAG 1.4.1).

Breakpoints used by this surface: `30rem` (480px), `48rem` (768px, Tailwind `md`), `64rem`
(1024px, `lg`).

---

### 14.1 Screen A — Quiz intro `/quizzes/:lessonId`

**Data:** `GET /api/quiz/lessons/:lessonId` → `QuizOverview`. **Not cached** — attempt state and
open windows must always be fresh. `404` ⇒ not-found screen.

**Page title:** `copy.quiz.resultsTitle` («نتيجتك»).

Layout: `max-width: var(--w-shell)`, padding `px-4 py-8` on a phone / `px-6 py-10` from `md`.

**1. The stage band** (`.stage` — an ember radial+linear gradient card, `--r-lg`, inset white
hairline ring, body padding 24px / 32px from 768px, white text with `--stage-fg-2 =
rgba(255,255,255,0.86)` for the secondary line):

- **Eyebrow** (mono, `--fs-mono-label`, letter-spacing 0.04em) — rendered **only when
  `allowsImprovement`**: `copy.quiz.papers[overview.nextPaper ?? 'original']`. On an ordinary
  quiz this line is omitted entirely (it used to fall back to «نتيجتك», which printed «نتيجتك»
  twice).
- **Title** (`--fs-title-1`, semibold, `text-wrap: balance`), chosen by **state, not by quiz**:
  ```
  inProgressAttemptId ? copy.quiz.resume            // نكمّل امتحانك
  : blocked           ? copy.quiz.resultsTitle      // نتيجتك
  : improving         ? copy.quiz.improveExam       // دخول امتحان التحسين
  :                     copy.quiz.start             // نبدأ الامتحان
  ```
- **Sub-line**, rendered **only when a sitting is actually ahead**
  (`inProgressAttemptId !== null || (!blocked && nextPaper !== null)`):
  `improving ? copy.examGate.improveIntro : copy.quiz.hint`.
  A spent quiz must not open with «مراجعة الإجابات كويس قبل التسليم».
- **Action slot** (`margin-block-start: 20px`), three-way:
  1. `inProgressAttemptId` ⇒ a **solid amber chip** («نكمّل امتحانك») linking to
     `/quizzes/:lessonId/attempt/:attemptId`.
  2. `blocked` ⇒ **a sentence, not a disabled button** (`.exam-stage__blocked`: inline-flex,
     8/12px padding, `--r-sm`, `rgba(255,255,255,0.12)` fill, `--fs-text-sm`). Text:
     `{ quiz_not_open_yet: copy.quiz.notOpenYet, quiz_closed: copy.quiz.closed,
     no_attempts_left: copy.quiz.noAttemptsLeft }[blocked.code]`.
     *"A greyed-out control invites clicking to find out why; a line of text answers it."*
  3. `nextPaper` ⇒ the **start button** (`.chip.chip--solid`, label
     `improving ? copy.quiz.improveExam : copy.quiz.start`), which opens the **exam gate dialog**
     (§14.2) — it does **not** create the attempt directly.

**2. The four facts** (`.exam-facts`: 2-column grid on a phone, 4 columns from 768px, 12px gap).
Each is a `StatTile` — icon in a well, a big tabular-nums value, a label:

| icon | value | label |
|---|---|---|
| clipboard-list | `overview.questionCount` | `formatCopy(copy.quiz.questionCount, { n })` |
| target | `formatMark(overview.gradeOutOf)` | `formatCopy(copy.quiz.totalMarks, { marks })` |
| clock | `minutes ?? '—'` where `minutes = round(durationSeconds/60)` | `minutes === null ? copy.quiz.noTimeLimit : formatCopy(copy.quiz.duration, { minutes })` |
| repeat-2 | `spent ? '٠' : allowsImprovement ? '٢' : '١'` | `spent ? copy.quiz.noSittingsLeft : allowsImprovement ? copy.quiz.twoAttempts : copy.quiz.singleAttempt` |

`spent = blocked?.code === 'no_attempts_left'`. **Only the fourth tile carries the `accent`
treatment, and only while `!spent`** — when nothing is left to decide, the accent comes off.

⚠️ **The total is `gradeOutOf`, not `sumMarks`.** They are different numbers and the tile used to
show the wrong one; on 150 of 154 quizzes they differ (most keep the default `gradeOutOf: 100`),
so the screen said «الدرجة الكلية ١٤» at the top and «٤ من ١٥» at the bottom about the same exam.

**3. Previous attempts** — rendered only when `attempts.length > 0`:

- A `.group-head` row: a mark, `copy.quiz.previousAttempts` as the title, and — when
  `bestScore !== null` — `copy.quiz.bestScore + ' ' + formatMark(bestScore)` as the count slot.
- One `.attempt-row` per attempt (`display:flex; align-items:center; gap:12px; padding:12px;
  hairline border; --r-lg; --n-1 fill; hover → --n-2`), in the order the server sent
  (`attemptNo` **descending**):
  - **Well** — a 36×36 `--r-md` square. Ember tint normally; when the row is the counting one
    (`.attempt-row--counts`) the well is solid amber with `#1A1206` glyph, the border becomes
    45 % amber and the fill a 6 % amber mix over the card surface.
    Icon: trophy when `marked`, clipboard-list otherwise. `marked = showPaper && attempt.counts`,
    and `showPaper = overview.allowsImprovement` — on a one-sitting quiz, naming the paper and
    marking the only mark as "the one that counts" answers a question the student cannot have.
  - **Title** (`--fs-text-sm`, medium, `overflow-wrap: anywhere`) — the whole row is a link via a
    pseudo-element overlay:
    `showPaper ? copy.quiz.papers[attempt.paper] : formatCopy(copy.quiz.attemptNo, { n: attemptNo })`.
    Destination: `attempt.state === 'in_progress'` ⇒ the **runner**, otherwise the **review**.
  - **Meta** (mono, tabular-nums, `--fs-mono-label`, `--n-11`):
    `scaledScore === null ? copy.quiz.essayPending
     : formatCopy(copy.quiz.marksEarned, { earned: formatMark(scaledScore), max: formatMark(gradeOutOf) })`,
    plus `' · ' + copy.quiz.counts` when marked.
  - **Verdict chip** when `passed !== null`: `.verdict--pass` / `.verdict--fail` with
    `copy.quiz.passed` / `copy.quiz.failed`.
  - **Trailing chip** (`.chip--quiet`): `running ? copy.quiz.resume : copy.quiz.reviewAnswers`.
  - Below 480px the row wraps: text takes `100% - 3.25rem`, and the chip/verdict get a
    `3.25rem` inline-start offset so they align under the text, not under the well.

**Loading state** (`loading.tsx`): SSR'd skeleton — a narrow pill + wide bar row, a full-width
line, a 2/3-column grid of five bars in a bordered box, and a narrow 40px-tall button block.
Widths vary (100 % / 85 % / 60 %) rather than uniform.

**Empty state**: `attempts.length === 0` ⇒ the previous-attempts section is simply absent.

**Error state**: a 404 from the API ⇒ Next `notFound()`. Anything else ⇒ the app error boundary.

---

### 14.2 Screen B — The exam gate dialog

Opened by the start chip; **it is the thing that creates the attempt**, not the chip.
(`apps/web/components/quiz/exam-gate-dialog.tsx`, `start-attempt-button.tsx`.)

- Dismissible by Escape and by the overlay — "this is a gate, not a trap". **No default-focused
  confirm button**: the primary action is reached deliberately.
- The X button's accessible name is `copy.common.close`, **not** `cancel` — the footer already
  carries a control named «مش دلوقتي», and two controls with one name in one dialog is ambiguous.
- Top: a decorative themed SVG (`<ExamGateMark variant={improving ? 'improve' : 'start'}>`) —
  a rotated sheet with ruled lines, a clock at ten-to-two, and one accent seal (a check for the
  original sitting, an up-arrow for the improvement one). `aria-hidden`.

**Original sitting** — title `copy.examGate.title`, description `copy.examGate.intro`, then three
icon-well points:

| icon | title | body |
|---|---|---|
| focus | `focusTitle` | `focusBody` |
| shield-check | `recordedTitle` | `recordedBody` |
| `allowsImprovement ? repeat-2 : alarm-clock` | `onceTitle` | `allowsImprovement ? onceExamBody : onceBody` |

then a tail line: `durationSeconds ? formatCopy(timedBody, { minutes: round(durationSeconds/60) }) : untimedBody`.

**Improvement sitting** — title `improveTitle`, description `improveIntro`, points:

| icon | title | body |
|---|---|---|
| sparkles | `improveDifferentTitle` | `improveDifferentBody` |
| shield-check | `improveSafeTitle` | `improveSafeBody` |
| alarm-clock | `focusTitle` | the timing line |

then tail `improveOnceBody`. (The timing line is a *point* here and the tail is different, so it
is never said twice.)

**Error line** — rendered above the footer, `role="alert" aria-live="polite"`, coloured
`var(--err)`. Text is always `copy.quiz.startFailed` — deliberately **not** derived from the
error, so an English HTTP string never lands in front of a student mid-exam. Cleared when the
dialog closes.

**Footer**: secondary `copy.examGate.cancel` («مش دلوقتي»), primary
`improving ? copy.examGate.improveAgree : copy.examGate.agree`, disabled while `pending`.

**On confirm**: `POST /api/quiz/quizzes/:quizId/attempts` → `{ attemptId }` → navigate to
`/quizzes/:lessonId/attempt/:attemptId`. **Any** rejection sets the error line — an earlier
version had `try/finally` with no `catch`, so a 403/429/500/offline rejection stopped the spinner
and changed nothing else on screen: «بضغط ابدأ وما بيحصلش حاجة».

---

### 14.3 Screen C — The runner `/quizzes/:lessonId/attempt/:attemptId`

**Data:** `POST /api/quiz/attempts/:attemptId/resume` on **every** entry. 404 ⇒ not-found.

**Chrome:** none. No rail, no topbar, no bell, no account menu — the runner owns the whole
viewport. `page title = copy.quiz.resultsTitle`.

Grid (`.runner`): one column with 16px gaps; from **64rem** it becomes
`minmax(0,1fr) 15rem`, `align-items: start`.

#### The sticky bar (`.runner-bar`)

`position: sticky; inset-block-start: 0; z-index: 20`, flex, wraps, `justify-content: space-between`,
12px gap, 12/16px padding, hairline border, `--r-lg`, `--n-1`. Budget ~90 px of viewport
(it wraps, and at the narrowest widths the clock drops under the meter).

- **Left group** (`.runner-bar__progress`, `flex:1`, `min-inline-size: 9rem`, 8px column gap):
  - a mono `--fs-mono-label` `--n-11` line:
    `formatCopy(copy.quiz.questionOf, { current: currentIndex + 1, total })` + `' · '` +
    `formatCopy(copy.quiz.answeredCount, { answered, total })`
  - a **3 px** meter: `--n-4` track, `999px` radius, `overflow: hidden`, with a full-width amber
    (`--a-9`) span scaled by `transform: scaleX(answered/total)`.
    **`scaleX`, never `width`** — animating `inline-size` inside a sticky bar ran layout+paint
    on every frame of every answer. `transform-origin` is `right center` under RTL.
    Transition: `--d-hover` with `--ease-out`.
    **The meter tracks questions ANSWERED, not questions visited** — walking past a question you
    did not answer is not progress.
- **Right**: the clock **alone** (`shrink-0`). The autosave label used to sit beside it in the
  same size and grey; it has moved into the question card's footer, because it is feedback about
  the *answer*, not about the exam.

Clock (`.runner-clock`): inline-flex, 8px gap, 4/12px padding, `--r-md`, hairline border,
`--n-2` fill, mono, tabular-nums, `--fs-title-4`, medium, with an alarm-clock glyph and `MM:SS`.
Warn/critical variants per §4.2. Renders **nothing at all** when `deadlineAt === null`.

#### The question card (`.runner-card`)

20px padding (24px from 768px), hairline border, `--r-lg`, `--n-1`. Contents, 20px column gap:

1. **Header row** — stem + flag button. Stacked on a phone, `sm:flex-row sm:justify-between`.
   Stem: `SafeHtml`, `min-w-0`, `max-w-[var(--w-prose)]`. Button: `shrink-0`,
   `white-space: nowrap`.
2. **The answer control**, per §5.2.
   Options are `.runner-option`: flex, `align-items: flex-start`, 12px gap, 12/16px padding,
   hairline border, `--r-md`, `--n-1`; hover strengthens the border and fills `--n-2`; a checked
   option gets an amber border and an 8 % amber fill. Deliberately a **big** target — a student
   answers twenty of these under time pressure.
3. **Footer row** — `justify-content: space-between`:
   - «مسح إجابتي» (`copy.quiz.clearAnswer`): a small dotted-underline text button, `--fs-text-sm`,
     `--n-11`, **disabled when `response === null`**, `onClick` ⇒ `onChange(null)`.
   - the autosave label, `aria-live="polite"`, mono `--fs-mono-label`, `--n-10`, from
     `AUTOSAVE_STATUS_LABEL`:
     ```
     idle   → ''                      saving → copy.quiz.saving   ('بيتحفظ…')
     saved  → copy.quiz.saved         error  → copy.quiz.saveFailed
     stale  → copy.quiz.staleTab
     ```

#### The foot (`.runner-foot`)

`display:flex; flex-wrap: wrap; justify-content: space-between; gap:12px; padding-block-start:16px;
border-block-start: hairline`.

- left: `navMethod === 'free'` ⇒ a secondary «السابق», disabled at `currentIndex <= 0`;
  `sequential` ⇒ an empty spacer.
- right: `isLast` ⇒ a **primary** «تسليم الامتحان». Otherwise a **ghost** «تسليم الامتحان» +
  a primary «التالي».
- Buttons are locked to `h-10` and carry `white-space: nowrap`; the row wraps rather than letting
  a label break inside its own border. At 320px the three controls need ~300px of 288px, so the
  third drops to its own line.

#### The navigator (`.runner-nav`, `navMethod === 'free'` only)

16px padding, hairline border, `--r-lg`, `--n-1`. From 64rem it is `position: sticky;
inset-block-start: 24px` (the second grid column). Below that it renders **under** the card.

- title `copy.quiz.navigator` (`--fs-text-sm`, medium, 12px bottom margin)
- the chip grid (§6.3)
- legend `formatCopy(copy.quiz.answeredCount, …)` + optional `' · ' + formatCopy(copy.quiz.flaggedCount, { n })`
  (mono, `--fs-mono-label`, `--n-10`, 12px top margin)

#### The submit dialog

Opened by «تسليم الامتحان» **after awaiting a flush** — awaited, not fired-and-forgotten,
because the preflight GET otherwise races the pending save and reports an answered question as
unanswered ("لسه فيه 1 سؤال من غير إجابة" on a paper the student had just finished).

- Title `copy.quiz.submitConfirmTitle`, description `copy.quiz.submitConfirmBody`.
- Body, four exclusive states:
  1. **error** (preflight failed) ⇒ `copy.common.error` + a secondary `copy.common.retry` button.
     **Confirm stays enabled** — the count is advisory and the server recomputes it, so a failed
     preflight must not wedge the dialog.
  2. **loading** (`unansweredCount === null`) ⇒ `copy.common.loading` in mono `--n-11`.
  3. **`unansweredCount === 0`** ⇒ `copy.quiz.submitConfirmAllAnswered`.
  4. **`unansweredCount > 0`** ⇒ `formatCopy(copy.quiz.submitConfirmUnanswered, { count })`, plus
     a wrapping row of jump-to chips built from the **client's** `locallyUnanswered` list
     (44×44 below `md`, 32×32 from `md`; mono, two zero-padded digits). Tapping one closes the
     dialog and jumps.
  > ⚠️ The **headline count is always the server's** (`GET …/preflight`), never the client's — so
  > a failed autosave cannot turn "you have 3 unanswered" into "0". The chips are the client's
  > best guess and are for navigation only.
- Footer: secondary `copy.quiz.submitCancel` («الرجوع للأسئلة») — **default-focused**, because
  "changed my mind" must be the path requiring zero extra keystrokes on a no-undo action — and a
  primary confirm.
- The confirm's label carries the pending state: `copy.quiz.submitConfirmAction` («أيوه، نسلّم»)
  swapping to `copy.quiz.submitting` («بيتسلّم…»). Both labels occupy the **same grid cell** with
  the inactive one `visibility: hidden`, so the button is permanently as wide as the longer of
  the two and the swap cannot shift «الرجوع للأسئلة» sideways under a thumb already on its way
  down. (`visibility`, not opacity — opacity-0 leaves the spare label in the a11y tree and a
  screen reader announces «أيوه، نسلّم بيتسلّم…».)
- Disabled while `submitting || (unansweredCount === null && !error)`.

**On confirm:** `flushNow()` (awaited — the server grades what it has stored), then
`POST …/submit`. Success ⇒ release the back guard **before** navigating and push to the review
route. **409** ⇒ toast `copy.quiz.alreadySubmitted`, release the guard, push to review anyway.
Anything else ⇒ toast `copy.common.saveFailed` and stay put.

#### The leave dialog

Opened by the back gesture (`useBackDismiss` with `rearm: true` — an overlay is finished once
back has closed it, but an exam is still running, so the stop goes straight back and the second
press is caught too). It sits **under** any overlay the runner opens: back with the submit
dialog up closes the dialog and nothing else.

- Title `copy.quiz.leaveTitle`, body `copy.quiz.leaveBody`.
- Footer: **ghost** `copy.quiz.leaveConfirm` («الخروج من الامتحان»), **primary + autofocused**
  `copy.quiz.leaveStay` («نكمّل الامتحان»). Staying is the answer the gesture was probably not
  asking for.
- Leaving: `await flushNow()` (this exit is a client-side route change — no `pagehide` fires, and
  the autosave hook's cleanup clears its interval without writing the dirty slot), release the
  guard, then **replace** (not pop) to `/quizzes/:lessonId`.

#### The stale state

When the autosave hook has seen a **409**, the runner **replaces the entire paper** with:

```
copy.quiz.staleTab   (الامتحان ده مفتوح في مكان تاني. تحديث الصفحة عشان نكمّل من هنا.)
[ copy.common.retry ]   → router.refresh()  (i.e. re-run resume())
```

centred, `py-24`, `max-w-[var(--w-prose)]`. The back guard is **released** in this state — asking
a student whether they meant to leave an exam they are no longer sitting, on a screen with no
leave dialog, would make back silently do nothing forever.

#### Loading state (`attempt/[attemptId]/loading.tsx`)

Built from the runner's **own** classes so padding, radii, gaps, the sticky bar and the two-column
split cannot drift: `.runner-bar` with a narrow bar + the real unfilled meter + a `h-[1lh] w-20`
clock pill; `.runner-card` with two text bars and four `.runner-option` rows
(`pointer-events-none`) and the footer row; `.runner-foot` with an `h-10 w-24` and an
`h-10 w-28`; then the `.runner-nav` aside with a title bar and **ten** 44×44 (36×36 from `md`)
chips. Order matters — the real runner opens with the meter and clock and puts the map **last**.

#### Autosave behaviour to reproduce exactly (`use-attempt-autosave.ts`)

- `setAnswer(slot, response)` only **marks a slot dirty in a map**. It schedules no network call.
  Ten keystrokes in ten seconds produce **one** request.
- Flush triggers: a **15 000 ms** interval, question navigation, opening the submit dialog
  (awaited), submitting (awaited), leaving (awaited), `visibilitychange → hidden`, and
  `pagehide`. The last two pass `keepalive: true`.
- One request in flight at a time. A caller that awaits a flush while one is running awaits
  **that** one (`inFlightPromiseRef`), rather than being told there is nothing to save.
- The payload is a **snapshot** of `[slot, valueAtSendTime]` pairs. On success, only slots whose
  current dirty value is **identical** to what was sent are cleared — a fresher edit that arrived
  mid-flight stays dirty for the next flush.
- `seq` is `++seqRef` on **every send attempt including retries**, seeded from `initialSeq =
  StartedAttempt.nextSeq`. Never per edit. An out-of-order reply from a slower earlier request
  therefore cannot clobber a later write.
- **409 ⇒ latch `stale` permanently.** No retry, ever. Everything else ⇒ status `error` and a
  retry after an exponential backoff starting at **1000 ms**, doubling, capped at **30 000 ms**;
  the backoff resets to 1000 ms on any success.
- `setFlag` is a separate, immediate, **fire-and-forget** `POST …/flag`; failures are swallowed
  and must never surface on the answer-status pill.

---

### 14.4 Screen D — Review `/quizzes/:lessonId/attempt/:attemptId/review`

**Data:** `GET /api/quiz/attempts/:attemptId/review`. **Not cached** — the window can flip
(`immediatelyAfter → laterWhileOpen`) between two loads of the same page. **403 or 404 ⇒
not-found screen, not an error boundary** (§8.5).

Layout `max-w-[var(--w-prose)] px-6 py-10`. H1 = `copy.quiz.reviewTitle`, `--fs-title-2`,
semibold, 24px bottom margin.

**If `locked`** ⇒ `<ReviewLocked reason>` (§8.3) and nothing else.

**If unlocked** ⇒ a 24px column of:

#### 1. `ResultHeader`

A bordered `--r-lg` card, `--n-2` fill, 20px padding, 12px column gap:

- eyebrow `copy.quiz.resultsTitle`
- score line, baseline-aligned: mono `--fs-title-1` tabular-nums
  `scaledScore === null ? '—' : formatMark(scaledScore)` + a muted `' / ' + gradeOutOf`,
  then — when `passed !== null` — a `Badge tone={passed ? 'ok' : 'err'}` reading
  `copy.quiz.passed` / `copy.quiz.failed`.
- pass line: mono `--fs-mono-label` `--n-11`, `formatCopy(copy.quiz.passMark, { percent: passPercent })`
- then **either** `copy.quiz.essayPending` (when any question's `correctness === 'needsGrading'`)
  **or** the score band:
  ```
  passed === null || needsGrading            → nothing
  passed && scaledScore/gradeOutOf >= 0.9    → copy.quiz.scoreBandExcellent
  passed                                     → copy.quiz.scoreBandGood
  otherwise                                  → copy.quiz.scoreBandNeedsWork
  ```

**No confetti, no gradient ring, no emoji.**

#### 2. The «غلطت فين؟» filter (`ReviewList`)

Rendered **only when at least one question carries `correctness`** — in a window that withholds
correctness there is nothing to filter by, and a control that silently does nothing is worse than
no control.

- `gradeable = questions.filter(q => q.correctness !== undefined)`
- `wrong = gradeable.filter(q => ['incorrect','partial','unanswered'].includes(q.correctness))`
- Left: `wrong.length === 0 ? copy.quiz.allCorrect : formatCopy(copy.quiz.wrongCount, { n: wrong.length, total: gradeable.length })`
- Right: when `wrong.length > 0`, a segmented control (`.review-filter`, `role="group"`,
  `aria-label = copy.quiz.reviewTitle`) with two `aria-pressed` options — a list-checks icon +
  `copy.quiz.showAll`, and an x-circle icon + `copy.quiz.wrongOnly`. Height 32px (40px below
  768px), `--r-sm`, pressed state = `--n-3` + inset hairline.
  When `wrong.length === 0` the control is replaced by a `.verdict--pass` chip with a check icon
  and `copy.quiz.passed` — «وريني غلطاتي بس» on a perfect paper is a button whose only outcome
  is an empty screen.
- The filter is **purely client-side and cannot reveal anything**: fields the window forbids are
  absent from the payload entirely.

#### 3. One card per question (`ReviewQuestion`)

Bordered `--r-lg` card, `--n-2`, 20px padding, 16px column gap. Carries a stable
`data-correctness` attribute (absent when no verdict was sent).

- **Header row**: mono `--fs-mono-label` `--n-11` two-digit position (`slotPosition+1`, padded)
  on one side; on the other, when `mark` **and** `maxMark` are both present, a mono tabular
  `{mark ?? '—'} / {maxMark}`, then when `correctness` is present the label in its tone:

  | correctness | label | tone |
  |---|---|---|
  | `correct` | `copy.quiz.correct` | `--ok` |
  | `partial` | `copy.quiz.partial` | `--n-12` (plain fg) |
  | `incorrect` | `copy.quiz.incorrect` | `--err` |
  | `needsGrading` | `copy.quiz.needsGrading` | `--n-11` muted |
  | `unanswered` | `copy.quiz.notAnswered` | `--n-11` muted |

- **Stem**: `SafeHtml`.
- **Body**, three shapes:
  - **`ordering`** — **two numbered lists side by side** (stacked below `sm`), never per-option
    highlights. An item can be in the right place in a wrong order, so "this row is green" says
    nothing true.
    - «ترتيبك» (`copy.quiz.yourOrder`) — rendered when `response` is present. Rows come from the
      student's `optionIds`; a row is green iff `rightAnswerOptionIds[index] === option.id`
      (**a position comparison, not membership** — membership is always true and would paint a
      completely wrong order entirely green), red otherwise, each with a check/cross glyph. Empty
      ⇒ `copy.quiz.notAnswered`.
    - «الترتيب الصحيح» (`copy.quiz.rightOrder`) — rendered when `rightAnswerOptionIds` is
      non-empty, all rows in `--ok` tone, no glyphs.
    - **The student's own order is shown even when it is right** — «صح» with nothing to look at
      teaches nothing.
    - Row: `flex; gap:8px; --r-sm; padding:10px`, a mono tabular index, the body, then the glyph.
  - **choice types** (`mcq_single`, `mcq_multi`, `true_false`) — one row per option,
    `flex-col gap:6px; --r-sm; border; padding:12px`:
    ```
    isCorrectOption = rightAnswerOptionIds.contains(option.id)
    isChosen        = response.optionIds.contains(option.id)
    isWrongChosen   = isChosen && !isCorrectOption && correctness === 'incorrect'

    isCorrectOption → --ok border + 8% --ok fill  + check glyph + copy.quiz.rightAnswer
    isWrongChosen   → --err border + 8% --err fill + cross glyph + copy.quiz.yourAnswer
    isChosen        → --accent border            + plain muted copy.quiz.yourAnswer
    otherwise       → subtle hairline border, no label
    ```
    **The highlight is driven by id membership from `rightAnswerOptionIds`**, never by
    re-splitting `rightAnswerText` on «، » — that round trip is lossy the instant an option's own
    body contains the separator (an ordinary Arabic list comma) and could highlight the **wrong**
    option.
  - **`short_answer` / `essay`** —
    - when `response` is present: a muted `copy.quiz.yourAnswer` label over
      `text || copy.quiz.notAnswered`, rendered as **plain text** with
      `white-space: pre-wrap; overflow-wrap: anywhere`.
    - when `rightAnswerText` is present: a muted `copy.quiz.rightAnswer` label over the value,
      **as text, never as HTML** — a short-answer pattern was deliberately never sanitized
      because patterns can legitimately contain `<` / `>` (e.g. `a < b`).
- **`feedbackHtml`** (when present): a muted `copy.quiz.questionFeedback` label + `SafeHtml`.
- **`generalFeedbackHtml`** (when present): a muted `copy.quiz.explanation` label + `SafeHtml`.

#### Loading state

`review/loading.tsx` — the SSR'd skeleton for this screen.

---

### 14.5 Screen E — the quiz lesson inside the player

`apps/web/components/player/quiz-lesson.tsx`. A **doorway, not a runner** — the attempt lives on
its own route with its own timer and token; running it inside a page the student can navigate
away from mid-attempt would be a design mistake.

Two variants:
- `'exam'` (default) — the lesson **is** the quiz (`lesson.kind === 'quiz'`).
- `'attached'` — a bonus quiz hanging off a video lecture. Same engine, same route, same score;
  only the copy changes.

Data comes from the lesson's own `LessonProgressDto` — **no extra request**:
`sat = state ∈ {passed, failed}`, `passed = state === 'passed'`,
`percent = round(completion * 100)` (`completion` is the stored 0..1 **best** score).

- **Not sat** ⇒ `copy.player.quizIntro` / `quizAttachedIntro`.
- **Sat** ⇒ `copy.player.quizYourScore` label, then a big mono tabular `{percent}%`, then — only
  when `passed` — a `.verdict--pass` chip reading `copy.quiz.passed`. **The fail verdict is
  deliberately not rendered**: «محتاج تحاول تاني» in red is a label on the student rather than
  information for them. Then the note:
  `passed ? (attached ? quizAttachedPassedNote : quizPassedNote) : quizFailedNote`.
- One amber link to `/quizzes/:lessonId`, label:
  `sat ? (attached ? quizAttachedOpenCta : quizOpenCta) : (attached ? quizAttachedCta : quizCta)`.

### 14.6 Screen F — `/results` (quiz history)

`GET /api/me/quizzes`. Stat tiles from `summary` (`copy.results.statQuizzes`, `statAttempts`,
`statAverage`, `statBest`, `statPassed`; `copy.results.noneYet` = «لسه» when a figure is null),
a score-trend chart over `series` (x runs right→left because the document is RTL; y is fixed
0–100 **never auto-scaled** — an auto axis makes 62 % and 64 % look like a dramatic climb), and
one `QuizResultRow` per `quizzes[]` entry.

`QuizResultRow`: title + course, then three figures — `copy.results.best` / `copy.results.latest`
(`bestPercent` is coloured by **`row.passed`**, never by comparing the percentage to 50 — each
quiz carries its own `passPercent`, and colouring on 50 painted every 50–69 score green while
every other screen said failed) and
`allowsImprovement ? formatCopy(copy.results.attemptsOf, { used, max: attemptAllowance(true) }) : copy.quiz.singleAttempt`.
Then an **unconditional** `copy.quiz.reviewAnswers` link to
`reviewHref(lessonId, latestAttemptId)` (the review route resolves the matrix server-side and
renders `ReviewLocked` when forbidden, so it can never leak and never dead-ends), and either a
`copy.quiz.improveExam` button to the quiz's **intro page** (never straight into a new attempt)
when `allowsImprovement && !improvementUsed`, or the text
`improvementUsed ? copy.quiz.improveUsed : copy.quiz.noAttemptsLeft`.

---

## 15. Error codes — the complete table

Errors are returned as a Nest exception body. Where the service throws
`new ForbiddenException({ code: 'x' })` the JSON body is `{ "code": "x", "statusCode": 403, ... }`;
where it throws a bare `new NotFoundException()` the body carries no `code`.

| HTTP | `code` | Thrown by | Meaning | What the UI does |
|---|---|---|---|---|
| 401 | — | AuthGuard | no session | sign-in |
| 403 | — | permission guard | role lacks `quiz:attempt` / `quiz:read` | generic |
| 403 | `CSRF: …` (message) | `CsrfGuard` | missing `x-csrf-token`, wrong `Origin`, cross-site `Sec-Fetch-Site` | fix the client |
| 403 | `quiz_not_accessible` | `assertCanAttempt` | quiz/lesson/course unpublished **or** no active enrollment. Deliberately generic — never a 404 that distinguishes the two | inside the gate dialog: `copy.quiz.startFailed` |
| 403 | `quiz_not_open_yet` (+ `openFrom`) | `assertCanAttempt` | `now < openFrom` | intro shows `copy.quiz.notOpenYet`; from the gate: `copy.quiz.startFailed` |
| 403 | `quiz_closed` (+ `openUntil`) | `assertCanAttempt` | `now >= openUntil` | intro shows `copy.quiz.closed` |
| 403 | `no_attempts_left` | `decideNextSitting` via `start` | allowance exhausted | intro shows `copy.quiz.noAttemptsLeft` |
| 403 | `quiz_has_no_questions` | `start` | the paper resolved zero slots | `copy.quiz.startFailed` |
| 403 | lapsed-grant `reason` | `LessonAccessService.require` | subscription/term access expired, revoked or not yet valid | the app's "access lapsed" handling |
| 404 | — | `overview` / `resume` / `save` / `flag` / `submit` / `preflight` / `review` | not yours, doesn't exist, or (for overview/review) enrolment revoked / lesson unpublished | **an ordinary not-found screen, never an error report** |
| 409 | `attempt_stale` | `saveAnswers`, `setFlag` | token rotated elsewhere, or already submitted | **latch permanently**: replace the paper with `copy.quiz.staleTab` + a retry that re-runs `resume`. **Never retry the save** |
| 409 | `attempt_overdue` | `saveAnswers` | past `deadline + extraTime + grace` | treat as terminal; go to review |
| 409 | `question_checked` | `saveAnswers` | that question's `gradedAt` is set | should not occur mid-attempt; treat as stale |
| 409 | `attempt_already_submitted` | `submit` | someone/something already claimed it | toast `copy.quiz.alreadySubmitted`, navigate to review |
| 400 | `unknown_slot` | `saveAnswers`, `setFlag` | `slotPosition` not on this attempt | client bug |
| 400 | (zod issues) | `ZodValidationPipe` | `.strict()` violation, bad uuid, `seq < 1`, > 200 answers, > 50 optionIds, > 20 000 chars | client bug |
| 429 | — | throttler | > 10/s, > 60/min, > 1000/h | back off; **do not** retry a save immediately |
| 500 | — | `NoAnswerLeakInterceptor` | a forbidden key reached a guarded response | server bug — report it |
| 504 | — | (web only) | upstream timeout | — |

**Toast/inline copy mapping used by the web:**
`start` failure ⇒ `copy.quiz.startFailed` **inline in the gate dialog** (never a toast — the
dialog is modal, so a toast behind it is invisible or dismissed by the overlay).
`submit` 409 ⇒ `toast.info(copy.quiz.alreadySubmitted)`. Any other submit failure ⇒
`toast.error(copy.common.saveFailed)`. Autosave failure ⇒ the status pill reads
`copy.quiz.saveFailed` and retries with backoff.

---

## 16. What a Flutter client must get right — checklist

1. **Cookie session + `x-csrf-token` on every write, and no `Origin` header.** Without the
   header every POST/PUT is a 403.
2. **`attemptToken` is required on `answers`, `flag` and `submit`.** Replace it from **every**
   `resume`/`start` response. A stale token is a 409 and a permanent stale state.
3. **Seed the autosave `seq` from `StartedAttempt.nextSeq`, and increment per *send attempt*.**
   Starting at 1 makes writes silently no-op.
4. **Flags go through their own endpoint.** They are not in the answers payload.
5. **Monotonic clock, anchored to `serverTime`.** Never `DateTime.now()`. Re-anchor on every
   `SaveResult`.
6. **Model review fields by key *presence*, not by null.** The server omits what the window
   forbids.
7. **Never compute "which attempt counts", "best score", or the unanswered headline count
   locally.** All three are server answers (`counts`, `bestScore`, `preflight`).
8. **Render HTML, not Markdown**, over the 14-tag allowlist, with `overflow-wrap: anywhere` and
   horizontally scrollable `pre`.
9. **`ordering` needs a keyboard/AT-usable up/down control**, not just drag, and a 200 ms touch
   delay so the list does not eat scrolls.
10. **Option order is the server's.** Never sort, never re-shuffle.
11. **404/403 on review is an ordinary answer.** Do not report it as a fault.
12. **Green/red only for correctness, with an icon and a text label beside every use.**
13. **The exam gate must be shown before creating the attempt** — the confirmation is what the
    `attempt_started` event records as `acknowledged: true`.
14. **Full-screen runner**: no bottom nav, no app bar, back intercepted, pull-to-refresh off.
15. **Flush on `AppLifecycleState.paused`/`inactive`**, and on every navigation, dialog open and
    submit (awaited for the last two).
