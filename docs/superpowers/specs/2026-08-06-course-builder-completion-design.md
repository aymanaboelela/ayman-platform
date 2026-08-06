# Course builder completion — design

**Date:** 2026-08-06
**Status:** approved
**Surface:** `/admin/courses` and `/admin/courses/[id]` in `apps/web`, `content` module in `apps/api`

## The problem

The content API is complete and covered by tests. The admin UI that drives it is
not: roughly half the API's write surface has no control anywhere in the
dashboard, three server actions exist but are never called by a component, and
two forms silently discard the data they are meant to be editing.

The result is a course builder that can create things but cannot correct them.
An instructor who mistypes a section title has no way to fix it; an instructor
who adds the wrong lesson has no way to remove it.

A separate and more serious problem sits underneath: the two delete endpoints
the UI is missing are themselves unsafe, and wiring buttons to them as they
stand would turn a missing feature into a 500.

## Part 1 — Delete safety (API)

### The defect

`LessonService.remove` and `SectionService.remove` delete unconditionally. The
cascade chain is:

```
CourseSection ──Cascade──▶ Lesson ──Cascade──▶ Quiz ──Cascade──▶ QuizAttempt ──Cascade──▶ AttemptEvent
```

`attempt_events` carries a `BEFORE UPDATE OR DELETE` trigger that raises
unconditionally (`20260726150111_attempt_constraints`), and `DELETE` is revoked
from the `ayman_runtime` role on that table. Both are deliberate: the append-only
event log is what makes a regrade defensible.

So deleting a quiz lesson that has even one student attempt fails at the
database with `integrity_constraint_violation`, surfacing as a 500. Deleting the
section that contains it fails the same way, one cascade further out.

`CourseService.remove` already guards against exactly this — it counts attempts
and throws a 409 with code `course_has_attempts`. That guard was written for the
course and never pushed down to the two levels below it.

### The fix

Mirror the course guard onto both services.

`LessonService.remove(id)`:
1. Count `QuizAttempt` where `quiz.lessonId === id`.
2. If non-zero, throw `ConflictException({ code: 'lesson_has_attempts' })`.
3. Otherwise proceed as today (delete + close the position gap, in one
   transaction).

`SectionService.remove(id)`:
1. Count `QuizAttempt` where `quiz.lesson.sectionId === id`.
2. If non-zero, throw `ConflictException({ code: 'section_has_attempts' })`.
3. Otherwise proceed as today.

The refusal is permanent, not a "unpublish first" nudge: attempt history can
never be deleted, so no sequence of admin actions makes the delete succeed
later. The Arabic copy therefore points at unpublishing the lesson — which
removes it from every student's view — rather than implying the delete will work
after some other step.

### Progress loss without attempts

A lesson with no quiz attempts can still have `LessonProgress` rows, which
cascade away silently. That is acceptable — progress is derived state, and the
course progress recalculation handles a shrinking lesson set — but it should not
be invisible. The admin detail payload gains a per-lesson `studentCount`, and the
delete confirmation names the number when it is non-zero.

`studentCount` is a `_count` on the existing `progress` relation, so it costs no
extra round trip. Row count equals student count without a `DISTINCT`:
`LessonProgress` is keyed `@@id([enrollmentId, lessonId])` and an enrollment is
one per user per course, so a lesson cannot hold two rows for the same student.

## Part 2 — The course exam, in one button

### Today

Creating a course exam takes five steps across three pages: add a section, add a
lesson of kind `quiz`, follow the quiz link (which lazily creates the quiz), build
the questions, return to the course, choose the lesson in the exam dropdown.

Worse, the lazy-create path at `admin/quizzes/lesson/[lessonId]/page.tsx` builds
a **practice** quiz — unlimited attempts, answers revealed during the attempt.
Correct for a lesson quiz, wrong for a final exam, and nothing tells the
instructor to change it.

### The endpoint

`POST /api/admin/courses/:id/exam/scaffold` → `{ quizId, lessonId, created }`

One transaction:

- If `course.examLessonId` is not null, look up that lesson's quiz and return it
  with `created: false`. The endpoint is idempotent — pressing the button twice
  never produces two exams.
- Otherwise, in order:
  1. `CourseSection` titled «الامتحان النهائي», at `position = max + 1`,
     `isPublished: false`.
  2. `Lesson` of `kind: 'quiz'` titled «الامتحان النهائي», `position: 0`,
     `isPublished: false`.
  3. `Quiz` with exam settings, not practice settings:
     `mode: 'graded'`, `maxAttempts: 1`, `shuffleQuestions: true`,
     `reviewOptions: DEFAULT_REVIEW_OPTIONS_GRADED`, `isPublished: false`.
  4. `course.examLessonId = lesson.id`.
  - Return `created: true`.

Everything is created unpublished. The exam becomes visible to students through
the same publish toggles as any other content, which keeps one publishing story
rather than two.

**Permissions.** The operation needs two authorities — `course:update` to add a
section and a lesson, `quiz:write` to create the quiz. `RequirePermission`
carries a single permission, so the route declares `course:update` and checks
`quiz:write` explicitly in the controller rather than widening a security
primitive for one endpoint. Today `admin: '*'` holds both and nothing changes;
this is what stops the `editor` role the permission catalogue anticipates from
acquiring a quiz-authoring path it was never granted.

The composite FK `courses_exam_lesson_in_same_course` already guarantees the
pointer can only reference a lesson of this course; the transaction satisfies it
by construction.

### Why a section rather than a special case

The progression gate (`gate-rule.ts`) opens the exam only when every *other*
published lesson is cleared, regardless of where the exam sits. So the exam does
not need a position, a flag, or a branch — it needs to be an ordinary lesson
somewhere. Giving it its own section is presentation, not semantics, and it keeps
the outline readable.

### The button

Top of the course page, next to publish:

- No exam yet → «أضف امتحان الكورس». Calls the endpoint, redirects to
  `/admin/quizzes/{quizId}`.
- Exam exists → «امتحان الكورس» plus the exam's question count and publish state.
  Same endpoint, same redirect, `created: false`.

The existing `CourseExamPicker` dropdown stays, for the case where an instructor
built a quiz lesson inside a normal section and wants to promote it. It moves
under a «متقدّم» disclosure rather than sitting at the bottom of the page as the
only path.

## Part 3 — The course page

### Structure

`course-editor.tsx` is 465 lines and holds seven components. Every capability
added below would grow it further. It splits along the objects it renders:

```
components/admin/course/
  course-editor.tsx        the shell: header, status actions, course form, exam banner
  course-exam-banner.tsx   the one-button exam entry point
  section-list.tsx         sortable sections
  section-card.tsx         one section: title edit, publish, delete, its lessons
  lesson-list.tsx          sortable lessons within a section (today's sortable-lesson-list)
  lesson-card.tsx          one lesson row: icon, title, badges, action buttons
  lesson-panel.tsx         the expanded body: kind-specific editor + settings
  lesson-settings-form.tsx free preview, estimated duration, completion rule
```

`lesson-resources.tsx` stays where it is and gains editing and reordering.

### Visual treatment

The current page is a stack of bordered rectangles distinguished only by
spacing. It becomes a hierarchy of distinct objects:

- **Section** — a container with a coloured header band (violet, the structural
  hue), collapsible, showing lesson count and publish state in the band.
- **Lesson** — a row with a kind icon (video / quiz / document / text), the
  title, a status chip, and visible action buttons: تعديل، مواد، نشر، حذف. Not a
  hover menu, not an overflow dropdown.
- **Exam** — its own banner above the sections, visually distinct from a
  section, because it is not one.
- **Colour carries meaning:** violet = structure, amber = action, green stays
  reserved for quiz correctness and is never decorative.

Collapsed by default beyond the first section, so a twelve-section course is
navigable. Expansion state is local component state — not persisted, not a URL
param.

### Behaviour

Section and lesson bodies expand on click. The materials panel is inside the
lesson body rather than always rendered, which is what makes a long course
readable.

## Part 4 — Capabilities to wire

Every API endpoint below exists and is tested. The table states what is missing.

| Capability | Endpoint | Missing |
| --- | --- | --- |
| Rename section, edit summary | `PATCH /admin/sections/:id` | action + UI |
| Delete section | `DELETE /admin/sections/:id` | guard (Part 1) + action + UI |
| Reorder sections | `PATCH /admin/courses/:id/sections/order` | UI only — `reorderSectionsAction` exists and is never called |
| Rename lesson | `PATCH /admin/lessons/:id` | action + UI |
| Delete lesson | `DELETE /admin/lessons/:id` | guard (Part 1) + action + UI |
| Lesson settings: free preview, estimated seconds, completion rule | `PATCH /admin/lessons/:id` | action + UI |
| Remove video | `DELETE /admin/lessons/:id/video` | action + UI |
| Edit resource title and description | `PATCH /admin/resources/:id` | UI only — `updateResourceAction` exists and is never called |
| Reorder resources | `PATCH /admin/lessons/:id/resources/order` | UI only — `reorderResourcesAction` exists and is never called |

The completion-rule field is coupled: `LessonCreateSchema.refine` requires
`completionMinViewSeconds` when the mode is `on_view`, and `completionPassGrade`
when it is `on_grade` or `on_pass`. The form shows the dependent field only for
the mode that needs it, and the action sends the pair together so the refine
cannot fail on a partial update.

## Part 5 — Two data-loss bugs

**The video URL field starts empty.** `LessonVideoForm` renders
`<Input name="url" required />` with no `defaultValue`, so an instructor editing
a lesson's duration must retype the whole YouTube URL or the save fails
validation. The payload already carries `video.externalId`; the field prefills
with `https://youtu.be/{externalId}`, which the API's extractor round-trips to
the same id.

**The lesson text field discards the existing body.** `LessonTextForm` renders an
empty `<Textarea required />`, because `CourseService.findForAdmin` does not
select `text` at all. The instructor writes into what looks like an empty lesson
and overwrites content they never saw. `findForAdmin` gains
`text: { select: { bodyHtml: true } }`, the page schema gains the matching
optional field, and the textarea prefills.

`bodyHtml` is sanitize-html output on write, so returning it to the admin editor
introduces no new sanitisation obligation — but the field stays a plain textarea
(`dir="ltr"`), exactly as today. This design does not introduce a rich text
editor.

## Part 6 — Copy

New Arabic strings under `copy.admin`, following the existing tone (Egyptian
colloquial, second person, no formal register):

- `section.edit`, `section.delete`, `section.deleteConfirm`,
  `section.deleteBlockedAttempts`, `section.lessonCount`
- `lesson.edit`, `lesson.delete`, `lesson.deleteConfirm`,
  `lesson.deleteBlockedAttempts`, `lesson.deleteWithProgress`,
  `lesson.removeVideo`, `lesson.completionMode` and its five mode labels,
  `lesson.passGrade`, `lesson.minViewSeconds`
- `exam.scaffold`, `exam.open`, `exam.advanced`, `exam.scaffoldFailed`
- `resource.edit`, `resource.save`, `resource.cancel`

Reorder announcements are currently lesson-specific
(«اتمسكت المحاضرة في الترتيب رقم»). `copy.admin.reorder` gains a section and a
resource variant rather than having three lists announce themselves as lessons.

## Testing

**Unit (API, jest):**
- `lesson.service.spec` — delete refuses with 409 when attempts exist; succeeds
  when they do not; closes the position gap.
- `section.service.spec` — same two cases, counting attempts one cascade further
  out.
- `course.service.spec` — `scaffoldExam` creates section + lesson + quiz + pointer
  in one transaction; returns the existing quiz with `created: false` on a second
  call; the created quiz is `graded` with `maxAttempts: 1`.

**Integration (API):**
- Scaffold twice against a real database; assert exactly one section titled
  «الامتحان النهائي» and one quiz.

**Unit (web, vitest):**
- The completion-rule form sends `completionPassGrade` with `on_pass` and omits
  it for `manual`.
- The video URL prefill produces a URL the contract's extractor maps back to the
  same id.

**E2E (playwright):** one spec covering the whole builder path — create course →
add section → rename it → add video lesson → set the YouTube URL → attach a PDF
→ attach a YouTube material → add the course exam → land on the quiz builder →
return → publish. This replaces nothing; `admin-publish-course.e2e.ts` keeps its
narrower scope.

## Out of scope

- A rich text editor for lesson bodies.
- Bulk operations (multi-select delete, move lessons between sections).
- Course cover image upload — `coverKey` exists but its own flow is separate.
- Changing a resource's kind after creation; delete and re-add stays the model.
- Anything touching the student-facing player or the quiz runner.

## Build order

Each step is independently shippable and leaves the tree green.

1. Delete guards + their unit tests. No UI change, no user-visible behaviour
   change — but nothing below is safe without it.
2. `findForAdmin` payload: `text.bodyHtml`, per-lesson `studentCount`. Prefill
   both broken forms. Fixes Part 5 on the existing UI.
3. The missing server actions, with no UI yet.
4. `scaffoldExam` service + endpoint + tests.
5. The component split, behaviour-identical — a pure move, reviewed as one.
6. The new UI on top of the split: section edit/delete, lesson edit/delete,
   settings form, resource editing, three sortable lists, the exam banner.
7. Copy, then the E2E spec.
