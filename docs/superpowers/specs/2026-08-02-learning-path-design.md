# Learning path — progression, exams and lesson resources — design

**Date:** 2026-08-02
**Status:** approved
**Scope:** server-enforced sequential progression over lessons and courses; a
course-level exam as the gate on course completion; a first-class lesson
resource model (main presentation, tutorial videos, materials) with an in-page
viewer; and the student-facing learning-path screen that renders all three.
**Out of scope:** any points economy — XP, coins, streaks, hearts (decided
against, §2); the server and domain, which the founder provisions last.

## 1. Why

The platform can already teach: a student enrolls, watches, takes a quiz, is
graded against Moodle's algorithms, appeals, and sees a percentage. What it
cannot do is **sequence** any of that. Every published lesson of an enrolled
course is reachable in any order, by URL or by clicking the outline. There is
no such thing as "you have not earned this yet."

Three columns in the schema look like they solve this and do not:

- `lessons.unlocks_after_lesson_id` — carries the comment
  **"RESERVED, UNENFORCED IN V1"**. Nothing reads it.
- `lessons.completion_mode` / `lessons.completion_pass_grade` — written by
  `LessonService` on every admin save, read by nobody. `grep` over
  `apps/api/src/modules` finds exactly two write sites and zero reads.

A dead gate is worse than no gate: it reads as a feature to anyone skimming the
schema. This design either uses those columns or explicitly retires them.

Alongside it, two content gaps the founder named directly:

- **Materials.** `lesson_attachments` holds `filename`, `mime`, `size_bytes`
  and nothing else. There is no title, no description, no notion of *which*
  file is the presentation the lesson was taught from, no way to attach a
  tutorial video, and no in-page viewing — `attachment-lesson.tsx` is a list of
  download links.
- **Exams.** `quizzes.lesson_id` is `@unique` and `NOT NULL`. A quiz is a
  property of a lesson. There is no assessment at course scope at all.

## 2. Founder decisions (locked)

Recorded from the brief and the follow-up, so no plan re-litigates them:

1. **The learning-path screen takes its *structure* from the QueryQuest
   reference and its *surface* from this platform's design system.** Same
   two-column shape, same vertical node map, same done / current / locked
   vocabulary. Rendered flat: amber `--a-9` used flat, radius ≤ 8px, no
   gradients, no glow, no per-section colour scheme. The reference's visual
   treatment is explicitly *not* adopted — it would contradict §4.7 of the
   platform spec and read as a foreign page.
2. **No gamification economy.** No XP, no coins, no streaks, no hearts. The
   map shows progress and locks; the quiz already shows scores. Anything more
   is a separate project.
3. **The course exam is the gate.** Clear every lesson → the exam unlocks →
   pass the exam → the course is complete → the next course unlocks. Without
   this the word "path" means nothing at course scope.
4. **The pass mark is 50%, and it is per-quiz configurable.** 50 is the
   default, not a constant.

## 3. What changes, in one paragraph

`Course` gains a progression mode. A new `LessonGateService` computes, for one
student and one course, which lessons are `locked | available | cleared`, and
`LessonAccessService.require` consults it so a locked lesson 404s on **read and
on write alike**. `Quiz` learns to belong to a course instead of a lesson,
which makes an exam a quiz with a different owner rather than a new engine.
`Enrollment` records the exam outcome, and `CourseProgressService` refuses to
set `completedAt` until the exam is passed. `lesson_attachments` is renamed to
`lesson_resources` and widened into a typed resource with a title, a
description, and three mutually exclusive payloads — uploaded file, provider
video, external link. Finally `/path` renders the whole thing.

## 4. Architecture

### 4.1 The progression rule

**Ordering is reading order.** Section `position`, then lesson `position`, then
`id` as the tie-break — the exact tuple `PlayerService.orderedLessons` already
uses. Reordering lessons in the admin *is* re-pathing the course; there is no
second ordering to keep in sync.

**`lessons.unlocks_after_lesson_id` stays dead and is documented as dead.** An
explicit per-lesson edge plus an implicit sequence is two sources of truth for
"what unlocks this", and the failure mode — an admin drags a lesson and the
graph silently disagrees with the list they are looking at — is invisible until
a student is stuck. The column keeps its RESERVED comment, and this spec is the
record of why it was passed over. It is not removed: dropping a column from a
table that later wants a real prerequisite DAG is a migration for nothing.

**The rule.** Within a course whose `progressionMode = 'sequential'`, a
published lesson is **available** when any of:

- it is the first published lesson in reading order, or
- it is `is_free_preview` (marketing content is never gated), or
- the immediately preceding published lesson is **cleared**.

"Preceding" is course-wide, not section-wide: the run is the whole course
flattened in reading order, so the first lesson of section 2 is gated on the
last lesson of section 1. Sections are chapter headings over one sequence, not
independent tracks.

and **locked** otherwise. A lesson is **cleared** when its `LessonProgress.state
∈ {completed, passed}` — the same predicate `CourseProgressService.recalculate`
already counts. That equivalence is deliberate: "the progress bar moved" and
"the next lesson opened" must never be able to disagree.

A lesson carrying a published quiz reaches `passed` only through
`recordQuizResultTx`, which is called with `passed = score ≥ quiz.passPercent`.
So the founder's "50%" is enforced by the existing grading path, not by a second
threshold invented here.

When `progressionMode = 'open'`, every published lesson is available. Existing
courses migrate to `sequential`; the admin can opt a revision course out.

**Unlocking is monotonic.** Every input to the rule (`state`, `completedAt`) is
write-once-forward. A lesson that has opened cannot close under a student
mid-session, so no session needs to be re-validated on a timer.

### 4.2 Where the gate is enforced

`LessonAccessService.require` is already documented as *"the single gate every
progress write goes through"*, and `PlayerService.lesson` calls it before it
reads a body. Extending it therefore covers reads, heartbeats, manual
completion, quiz start and quiz submission in one place — which is exactly why
the gate goes there and not into each controller.

The service gains a second phase. Phase one is unchanged: ownership compiled
into the `where` clause, 404 for both "no such lesson" and "not your lesson".
Phase two asks `LessonGateService` whether that lesson is available to that
enrollment and throws the **same** `NotFoundException` if it is not. A locked
lesson is indistinguishable from a nonexistent one, matching the existing
404-not-403 rule: a 403 would confirm that lesson 7 exists to someone iterating.

`LessonGateService` needs one query per course — the ordered published lesson
ids plus that enrollment's progress states — so `require` goes from one round
trip to two. It does not fan out per lesson.

**The UI's lock is cosmetic.** Every lock the student sees is a render of a
server-computed state, and removing it in devtools buys nothing: the lesson
route, the heartbeat route and the attempt routes all re-derive it.

### 4.3 Course-level progression

Courses are ordered by `position` within their taxonomy tuple
`(systemId, year, trackId, subjectId)` — the tuple `Course` is already indexed
on and `CatalogService` already orders by. The "previous course" is the
published course with the next-lower position in that same tuple; a course
alone in its tuple is always available.

A course is **available** when it is first in its tuple, or the student's
enrollment in the previous course has `completedAt IS NOT NULL`.

`CourseProgressService.recalculate` currently sets `completedAt` when
`completedLessons === totalLessons`. It gains one more conjunct: if the course
has a **published exam**, `enrollment.examPassedAt` must also be set. The exam
itself unlocks on the first half of that condition — all lessons cleared — so
the sequence is: lessons → exam → completion → next course.

A course with no published exam completes on lessons alone, exactly as today.

### 4.4 Course exams

An exam is **a `Quiz` whose owner is a course rather than a lesson**. Plan 5's
question bank, versioning, option-order snapshots, `deadline_at`, attempt
tokens, four grading algorithms, review matrix and appeal flow are all reused
without modification — the engine never knew what a lesson was, only
`quiz.id`.

`Quiz` gains `courseId String? @unique` and `lessonId` becomes nullable, with a
CHECK enforcing exactly one owner:

```sql
CONSTRAINT quizzes_one_owner CHECK ((lesson_id IS NULL) <> (course_id IS NULL))
```

This is the same XOR shape `QuizSlot` already uses for bank-entry-or-pool, so
it needs no new idiom. `QuizMode` needs no new value: an exam is `graded`.

The one thing that genuinely differs is **where the result lands**.
`AttemptService.gradeAndFinalise` currently calls
`LessonProgressService.recordQuizResultTx`, which writes a `LessonProgress` row
— a course exam has no lesson to write to. It branches on the owner:

- lesson-owned quiz → `recordQuizResultTx`, unchanged;
- course-owned quiz → `recordExamResultTx`, which writes
  `enrollment.examPassedAt` (first passing attempt, never overwritten) and
  `enrollment.examScorePercent`, then calls
  `CourseProgressService.recalculate` in the same transaction.

`examScorePercent` is **whatever the exam's own `gradeMethod` resolves to** —
`highest`, `average`, `first` or `last` — read back from the engine after it
finalises, never recomputed here as a max. A quiz set to `last` that a student
re-sits worse must show the worse number, and a second definition of "the
student's score" living on `Enrollment` is exactly how those two drift apart.
`examPassedAt`, by contrast, is genuinely write-once: passing is not revoked by
a later failed re-sit, or a student could lose access to a course they had
already been let into.

Both columns are denormalised onto `Enrollment` rather than derived from
`quiz_attempts` on every read, because the learning-path screen needs the exam
state for every enrolled course at once and deriving it would be an N+1 over a
table that only grows.

Attempting an exam is gated on all lessons cleared, enforced in the same place
attempt creation already authorizes — not in the UI.

### 4.5 Lesson resources

`lesson_attachments` is **renamed** to `lesson_resources` and widened. A rename
preserves the rows and the foreign keys; dropping and recreating would discard
content the founder has already uploaded for no benefit.

```prisma
enum LessonResourceKind {
  presentation  // the deck the lesson was taught from — at most one per lesson
  video         // a tutorial video, by provider id (never a URL)
  document      // PDF, sheet, any uploaded file
  link          // an external page
}
```

| Column | Applies to | Notes |
|---|---|---|
| `title` | all | Required. A material with no name is a filename, which is what this replaces. |
| `description` | all | Optional, plain text. Not HTML — nothing here needs `sanitizeRichText`, and not accepting HTML is cheaper than sanitising it. |
| `kind` | all | Drives which payload columns are legal. |
| `storageKey`, `filename`, `mime`, `sizeBytes` | `presentation`, `document` | The key, never a URL — unchanged rule. |
| `videoProvider`, `videoExternalId` | `video` | The **11-character id**, extracted by Plan 3's existing extractor which parses and discards the URL. Storing the URL would reintroduce the SSRF class the extractor exists to eliminate. |
| `linkUrl` | `link` | `https:` only, validated on write. See §6. |

Enforced by one CHECK per kind, so a malformed resource cannot exist even under
a direct SQL write, plus a partial unique index giving the "main presentation"
its meaning:

```sql
CREATE UNIQUE INDEX lesson_resources_one_presentation
  ON app.lesson_resources (lesson_id) WHERE kind = 'presentation';
```

**Viewing in the page.** The founder's requirement is that a PDF opens like a
web page and still has somewhere to download from. Two routes, both re-checking
enrollment *and* the progression gate:

- `GET /api/lessons/:lessonId/resources/:id/view` → `Content-Disposition: inline`
- `GET /api/lessons/:lessonId/resources/:id/download` → `Content-Disposition: attachment`

The viewer is an `<iframe>` at the `/view` route, which is on the **app**
origin, not the media origin. That is forced, not chosen: `GET /media/:prefix/:name`
is `@Public()` — anyone holding a key can fetch it — which is correct for course
covers and wrong for a document behind an enrollment. The authorization decision
has to happen per request against the session, so the bytes come back through
`/api`. `frame-src` therefore gains `'self'`, not the media origin.

Same-origin framing is made safe by the response, not by the origin: every
document response carries `Content-Security-Policy: default-src 'none'; sandbox`
— which drops the document into a unique opaque origin with no script execution
— plus `X-Content-Type-Options: nosniff` and a `Content-Type` we chose rather
than one the uploader declared. That is the identical header set
`MediaController.serve` already applies, so this is the established pattern
here, not a new one.

**Uploading a document is a different pipeline from uploading an image.**
`MediaService.upload`'s third and strongest gate is a **sharp re-encode to
WebP** — the step that destroys polyglots and strips EXIF. A PDF cannot be
re-encoded that way, so documents cannot reuse that method, and pretending they
can would silently drop the gate that does the real work. Plan 8 adds a
`DocumentService.upload` with its own gates, and the spec is explicit that gate
three is *absent* and what compensates:

1. extension allowlist — `pdf`, `pptx`, `docx`, `xlsx`;
2. magic-byte sniff of the buffer via the existing `FileSignatureService`,
   with a MIME allowlist — the declared `Content-Type` is read nowhere;
3. **no re-encode** — impossible for these formats. Compensated by: upload is
   `media:write`, i.e. admin-only and audit-logged; the bytes are never served
   with a `Content-Type` derived from the upload; the serve route sets
   `sandbox`; and nothing on either origin ever executes a stored document.
4. UUID key — the original filename never touches the disk, and is retained as
   a display string only.

Documents land in the same `MediaStorage` under a `doc/` key prefix so the
storage abstraction stays single, and are recorded in `media_assets` alongside
images — the library the founder already administers.

Tutorial videos reuse the existing lazily-loaded `youtube-nocookie` embed at
CLS 0 — the same component the video lesson uses, not a second player.

`LessonKind.attachment` keeps its meaning: a lesson *whose body is* its
resources. Every other lesson kind may also carry resources, which is the point
— a video lesson with a presentation and three materials is the common case.

### 4.6 The learning-path screen — `/(app)/path`

Two columns, mirroring the reference's shape:

- **The rail** lists the student's courses with `cleared / total` per course
  and marks locked ones. It is a list, not a nav landmark duplicate — the
  global header stays the only site navigation, so the page does not ship a
  second competing nav.
- **The map** is, top to bottom: a summary card (`X من Y درس · Z كورس`, one
  percentage), the current course banner, then the vertical node run.

Node states and how they read **without** the reserved colours:

| State | Treatment |
|---|---|
| Cleared | Filled flat amber, check glyph. |
| Current | Amber ring on `--surface-2`, with an "ابدأ من هنا" pill. |
| Locked | `--surface-2` on `--line`, lock glyph, `--fg-muted`. |
| Exam | Same three states, square node instead of round, at the run's end. |

`--ok` and `--err` stay reserved for quiz correctness — a green "done" node
would be the first decorative use of a colour the platform spends elsewhere on
meaning. Amber-filled-with-check is the done state.

The map is server-rendered from one payload. It shows locks; it does not decide
them.

## 5. Data model summary

Two new enums — `LessonResourceKind` and `ProgressionMode` — each `@@map`ed to
a snake_case Postgres type name per Global Constraint 6. New column set:

| Model | Change |
|---|---|
| `Course` | `+ progressionMode ProgressionMode @default(sequential)` (new enum: `open | sequential`) |
| `Quiz` | `lessonId` → nullable; `+ courseId String? @unique`; CHECK exactly-one-owner |
| `Enrollment` | `+ examPassedAt DateTime?`, `+ examScorePercent Decimal? @db.Decimal(5,2)` |
| `LessonAttachment` | renamed `LessonResource`; `+ kind`, `+ title`, `+ description`, `+ videoProvider`, `+ videoExternalId`, `+ linkUrl`; `storageKey`/`filename`/`mime`/`sizeBytes` → nullable; per-kind CHECKs; partial unique index on one presentation |
| `Lesson` | no change. `unlocksAfterLessonId` stays reserved, now with a comment naming this spec |

Migration also sets `quizzes.pass_percent` default to **50** and backfills
existing rows to 50. The backfill is safe because the platform has not launched
— the founder is provisioning the server and domain after this work — so the
table holds seed and authoring data only, not graded student history.

## 6. Security

- **The gate is server-side, in one place.** `LessonAccessService.require` is
  the only thing any route trusts. UI lock states are decoration.
- **Locked resolves to 404**, never 403 — consistent with the existing rule
  that a status code must not confirm the existence of content.
- **Exam attempt creation re-checks lesson completion.** A student who has the
  exam's `quizId` cannot start it early by posting to the attempt endpoint.
- **`linkUrl` is `https:`-only**, rejected at the DTO with a scheme allowlist —
  `javascript:` and `data:` never reach the column. It is rendered as an anchor
  with `rel="noopener noreferrer"` and its hostname shown to the student, never
  fetched server-side, so it is a phishing surface (admin-authored) and not an
  SSRF one.
- **Video resources store the provider id, not a URL**, reusing the extractor
  that already eliminates that class.
- **Resource routes re-derive access per request.** A storage key that leaks is
  not an access grant, unchanged from the attachment route it replaces.
- **`frame-src` gains `'self'`** so the viewer can frame `/api/.../view`, and
  `frame-ancestors 'none'` is untouched — our pages still cannot be framed by
  anyone. Each document response additionally carries its own
  `default-src 'none'; sandbox` policy, so widening `frame-src` does not widen
  what a framed document may do.
- **Document uploads have no re-encode gate**, which is a real and stated
  reduction against the image path. §4.5 enumerates the four compensating
  controls rather than leaving the difference implicit.
- Admin writes go through `lesson:write` / `lesson:reorder` / `course:update` /
  `quiz:write`, all of which exist. **No new permission is introduced**, and
  every mutation is already hash-chained into the audit log by Plan 6's retrofit.

## 7. Testing

**Unit.** The gate rule as a table: first lesson, free preview, previous
cleared, previous not cleared, `open` mode, unpublished neighbour. Exam
completion arithmetic. Per-kind resource validation. Scheme allowlist.

**Integration** (`*.int-spec.ts`, real Postgres). A locked lesson 404s on the
player route *and* on the heartbeat route *and* on attempt creation. Passing a
quiz at exactly `passPercent` unlocks the next lesson; failing by one mark does
not. The exam is unreachable until the last lesson clears. `completedAt` stays
null while a published exam is unpassed. The next course unlocks only after
`completedAt` lands. The one-presentation index rejects a second presentation.

**E2E** (`*.e2e.ts`). One student walks lesson 1 → quiz → pass → lesson 2 opens
→ ... → exam → pass → next course opens, asserting the map's node states at each
step. A second spec navigates straight to a locked lesson's URL and gets the
404 page. Axe over `/path` in both themes.

**Authorization matrix.** Plan 7's route × role matrix gains the resource view
and download routes and the exam routes.

## 8. Build order

Five plans. Each is independently shippable and leaves the platform green.

| # | Plan | Depends on |
|---|---|---|
| 8 | **Lesson resources** — rename + widen, admin CRUD, viewer, download | — |
| 9 | **Course exams** — quiz owner XOR, exam result sink, admin exam builder | — |
| 10 | **Progression gating** — `LessonGateService`, `require` phase two, outline lock states | 9 (exam gates course completion) |
| 11 | **Learning path screen** — `/path`, rail, node map | 8, 9, 10 |
| 12 | **Production hardening** — full sweep, matrix, e2e, perf | 8–11 |

Plan 11 cannot precede 10: a map with no lock states to render is a list.

## 9. Non-goals

- Any points, badge, streak or lives system (§2.2).
- A prerequisite DAG. Sequential reading order only; `unlocks_after_lesson_id`
  stays reserved (§4.1).
- Certificates on course completion. `completedAt` becomes meaningful here,
  which is the prerequisite for that feature, not the feature.
- Rich-text resource descriptions.
- Time-window release (`visible_from` / `visible_to`) — still reserved.
