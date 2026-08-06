# The final exam, its improvement sitting, and the end of retakes

**Date:** 2026-08-07
**Branch:** `feat/exam-improvement`

## The problem

The quiz engine shipped with three ideas the product does not want:

1. **Appeals (التظلمات).** A full vertical slice — `grade_appeals`, a service, a
   controller, `/admin/appeals`, a student dialog, a notification kind, and a
   promise in the terms page. Nobody wants the feature.
2. **Retakes.** `maxAttempts` (defaulting to *unlimited*), `retryCooldownHours`,
   and four selectable `gradeMethod` algorithms. A student can sit a lesson quiz
   as many times as they like.
3. **Practice mode.** The default `QuizMode`, which means the default quiz is
   an ungraded one with unlimited attempts and per-question answers revealed
   mid-attempt.

What the product wants instead is narrow and strict: **one sitting per quiz.**
The single exception is the course's final exam, which may offer **one optional
improvement sitting (تحسين) on a different paper**, with the higher of the two
scores counting.

Alongside that, the student's exam experience needs to state its own stakes —
a consent gate before the first question — and to be worth looking at.

## Decisions taken

| Question | Decision |
|---|---|
| How is the improvement exam defined? | One quiz, two papers |
| Which grade counts? | The higher of the two |
| How many improvement sittings? | Exactly one |
| Existing appeal rows? | Dropped with the table |
| Practice mode? | Removed; every quiz is graded |
| Existing multi-attempt data? | None — no real students yet |

## Architecture

### One quiz, two papers

An exam is already a `Lesson` of kind `quiz` that `Course.examLessonId` points
at, which is what lets the whole engine apply to it unbranched. That property is
worth preserving, so the improvement exam is **not** a second quiz — `Quiz`
holds `lessonId` as `@unique`, and a second exam lesson would create a second
"the student's exam score" that could drift from the first.

Instead the *paper* becomes a dimension of the existing quiz:

```prisma
enum QuizPaper { original  improvement }

Quiz.allowsImprovement    Boolean   @default(false)
Quiz.improvementSumMarks  Decimal   @default(0)
QuizSlot.paper            QuizPaper @default(original)
QuizPool.paper            QuizPaper @default(original)
QuizAttempt.paper         QuizPaper                    // snapshot at start
```

`QuizSlot`'s unique becomes `(quizId, paper, position)` — positions restart per
paper. That unique is the DEFERRABLE one, so the migration must rebuild it
deferrable or drag-reordering breaks.

`QuizAttempt.paper` is a **snapshot**, for the same reason `deadlineAt` and
`sumMarks` are: an instructor editing either paper must not alter an attempt
already in flight.

`Quiz.improvementSumMarks` mirrors the existing `sumMarks` denormalisation
(recomputed on every slot write) so the runner still never aggregates.

### The attempt allowance

`maxAttempts`, `retryCooldownHours` and `gradeMethod` are deleted. Allowance
stops being a number in a table and becomes a rule:

```
attempts sat = 0                        → allowed, paper = original
attempts sat = 1 and allowsImprovement  → allowed, paper = improvement
otherwise                               → blocked: no_attempts_left
```

`BlockedReason.retry_cooldown` is deleted with the column that fed it.

`gradeMethod`'s four algorithms collapse to one `Math.max` over the student's
attempts — which is what `highest` already meant, minus the ability to configure
it into something else.

`QuizAttempt.extraAttempts` is **kept**. It is not a student-facing retake: it
is an admin accommodation, written through an audited grant, and without it a
student whose connection dies mid-exam can only be rescued by a hand-written
`UPDATE` against production.

### Publishing guard

An exam with `allowsImprovement` will not publish unless:

- the improvement paper has at least one slot, and
- no fixed bank entry appears on both papers.

An improvement paper made of the same questions is precisely the failure this
feature exists to prevent, so it is a refusal, not a warning.

### Removing appeals

`grade_appeals` and `appeal_status` are dropped in a migration. The API module,
DTO, contracts, admin pages, student dialogs, notification kind, the
`appeal:resolve` permission and the terms-page paragraph all go with them.

**One deliberate exception:** `AttemptEventKind.appeal_opened` and
`appeal_resolved` stay in the enum. `attempt_events` is append-only with UPDATE
and DELETE revoked at the database level, and Postgres cannot remove a value
from an enum in place. They are documented as retired and nothing writes them.

## The student flow

### Consent gate

Before the first question, a dialog that states the stakes plainly: focus, the
result is recorded permanently, it will not be deleted, and there is no second
sitting (or, on an improvable exam, exactly one). Confirming sends
`{ acknowledged: true }` with `POST /attempts`; the acknowledgement is recorded
in the `attempt_started` event payload, so "the student was told" is a fact in
the log rather than a claim about the UI.

The illustration is an inline SVG built from the study surface's own tokens —
theme-aware, RTL-correct, and no image request.

### Improvement gate

A second, different dialog on the exam's improvement action: the questions will
be different, study first, and a lower score cannot cost the student the grade
they already hold.

### Result

The review screen already resolves the 4×7 review matrix server-side. It gains
a result header carrying the score, and a «الأسئلة اللي غلطت فيها» filter, so
the answer to "where did I go wrong" is one press rather than a scroll. On an
improvable exam it shows both sittings and marks which one counts.

## The dashboard exams section

Scope is deliberately **this section only** — the rest of the dashboard is
untouched in this change.

A full-width «امتحاناتك» section built from the existing study vocabulary
(`.stage`, `.unit`, `.lesson-row`, `.chip`, `.tile`) rather than new classes:
the course exam as its own card carrying its gate state (locked / open / passed
/ improvable), and the lesson quizzes as rows that each end in their own action
chip. Colour follows the file's existing rule — violet is structure, amber is
what you press — with green and red reserved to the quiz, which is where they
already belong.

## Admin

- The quiz builder gains a paper switcher, shown only when the quiz is a course
  exam with improvement enabled.
- The settings form loses mode, max attempts, cooldown and grade method, and
  gains the improvement toggle.
- `/admin/appeals`, its nav entry, its command-palette shortcut and its overview
  tile are deleted.
- The attempts table loses its appeal column.

## Testing

- **Unit** — the allowance rule at 0/1/2 attempts with and without improvement;
  paper resolution; highest-of-two; the publish guard's refusals.
- **Contract** — `quiz-leak.contract.spec.ts` must continue to pass: no answer
  key may reach a learner payload through the new `paper` field.
- **E2E** — `quiz.spec.ts` updated for the consent gate, the single sitting, and
  the improvement flow end to end.

## Deliberately not doing

- **Retakes behind an admin flag.** The point is to remove the concept.
- **More than two papers.** Two is what "تحسين" means here; N papers is a
  different feature with a different UI.
- **Redesigning the whole dashboard.** Named as out of scope by the user.
