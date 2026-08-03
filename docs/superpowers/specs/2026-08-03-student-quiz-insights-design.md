# Student quiz insights — design

**Date:** 2026-08-03
**Status:** slice 2 of 4
**Builds on:** `2026-08-03-student-shell-dashboard-design.md` (slice 1)
**Scope:** the student's own quiz history — how many they have sat, how they
scored over time, seeing what they answered last time, and sitting a quiz again.

## Why

The quiz engine is complete and none of it is visible to a student outside the
one quiz they are standing in front of. Concretely, today:

- `/quizzes/:lessonId` lists previous attempts as **inert cards**. The review
  screen exists at `…/attempt/:attemptId/review`, is fully built, and *nothing
  in the product links to it*. A student cannot see what they answered last
  time because there is no route to the page that would tell them.
- Retaking works — `StartAttemptButton` posts a new attempt and the access
  service already computes `attemptsRemaining`, `maxAttempts` and the cooldown
  — but the control is labelled "ابدأ الامتحان" whether it is the first sitting
  or the fourth.
- There is no view of results across quizzes at all. The dashboard shows the
  last five as a strip (slice 1); beyond that, nothing.

## Decisions

1. **One new read endpoint, no schema change.** Everything needed is already in
   `quiz_attempts` — `scaledScore`, `gradeOutOf`, `passed`, `submittedAt`,
   `attemptNo`. Slice 2 adds no migration.
2. **A dedicated results page**, not more cards on the dashboard. The dashboard
   answers "what do I do next"; this answers "how am I doing", which is a
   different question and deserves its own destination in the rail.
3. **Charts stay hand-rolled.** `admin/quiz/score-histogram.tsx` (ten bars) and
   slice 1's `score-strip.tsx` (five bars) set the precedent. A trend line over
   N points is one `<polyline>` and a `viewBox`; a charting library is 40kB+ of
   JavaScript on a page that renders one chart.

## The endpoint

`GET /api/me/quizzes` → `StudentQuizHistory`

```ts
{
  summary: {
    quizzesTaken:    number,        // distinct quizzes with ≥1 submitted attempt
    attemptsTotal:   number,
    averagePercent:  number | null, // over graded attempts; null when none
    bestPercent:     number | null,
    passedCount:     number,        // quizzes whose BEST attempt passed
  },
  series: [{                        // every submitted attempt, oldest first
    attemptId, lessonId, quizTitle, scorePercent, passed, submittedAt, attemptNo
  }],
  quizzes: [{                       // one row per quiz, most recent first
    lessonId, quizTitle, courseTitle, courseSlug,
    attemptsUsed, maxAttempts, attemptsRemaining: number | null,
    bestPercent, latestPercent, latestAttemptId, passed, lastSubmittedAt
  }],
}
```

**Ownership is in the `WHERE` clause**, exactly as `QuizScoreFeed.recentFor`
does it: `where: { userId, submittedAt: { not: null } }`. There is no id
parameter on the route to tamper with, which is the cheapest possible defence
against IDOR — the same discipline `DashboardController` documents.

`averagePercent` is over **attempts**, not over quizzes: it answers "how do I
score when I sit an exam". `passedCount` is over **quizzes**, keyed on the best
attempt, because "did I pass this quiz" is settled by the best sitting under
`gradeMethod: highest` — counting attempts there would make a student who
passed on the third try look two-thirds failed.

`null` rather than `0` for every average and best when nothing is graded, for
the reason slice 1 already established: `0%` reads as "you scored nothing".

### Where it lives

A `QuizHistoryService` in `QuizModule`, exposed by a small `MeQuizzesController`
(`@Controller('me')`, `@RequirePermission('quiz:read')`). Not on
`AttemptController`, whose class-level permission is `quiz:attempt` and whose
documented shape is the runner. Not on `DashboardController` either — that
module reaches quiz data through the `SCORE_FEED` port precisely so it does not
depend on quiz internals, and widening that port to carry a full history would
undo the separation it exists for.

## The page — `/results`

Added to `STUDENT_NAV` (slice 1's one nav table), so the rail entry, the mobile
sheet entry and the topbar title all appear from a single edit.

```
┌─ summary ───────┬──────────┬──────────┬───────────────┐
│ quizzes sat     │ attempts │ average  │ best          │
└─────────────────┴──────────┴──────────┴───────────────┘
┌─ score trend ─────────────────────────────────────────┐
│  a polyline over every submitted attempt, with the    │
│  pass line drawn as a dashed rule                     │
└───────────────────────────────────────────────────────┘
┌─ per quiz ────────────────────────────────────────────┐
│  title · best · latest · attempts left                │
│  [ راجع إجاباتك ]  [ حاول تاني ]                       │
└───────────────────────────────────────────────────────┘
```

**Chart direction.** The document is RTL, so the series runs **oldest at the
right, newest at the left** — time advances in the same direction the text is
read. This is the same reasoning slice 1's `ScoreStrip` records, and it is
deliberate rather than an oversight to be "fixed" later.

**Accessibility.** The `<svg>` is `aria-hidden`; the per-quiz list underneath
states every number in text, and the chart carries a visually-hidden summary
sentence naming the range. A polyline is not information a screen reader can
use, and announcing N bare percentages is the same data twice without labels.

## The two fixes on `/quizzes/:lessonId`

1. **Each previous attempt becomes a link to its review.** The review route is
   already gated server-side by the 4×7 review matrix and renders a designed
   `<ReviewLocked>` state when the window is closed, so linking unconditionally
   is safe: a student who cannot review yet gets an explanation, not an error.
2. **The primary control is labelled from state.** `copy.quiz.retry`
   ("حاول تاني") already exists and is unused; it replaces
   `copy.quiz.start` once `attemptsUsed > 0`.

## Error handling

Unchanged in kind from slice 1. `/results` is a Server Component doing one
authenticated fetch; its `loading.tsx` mirrors the settled layout, and a
non-2xx throws `ApiRequestError` into the route's error boundary. A student
with no attempts at all is not an error — it is the designed empty state, and
it is the state every new student is in.

## Testing

- `summarise`-style pure derivations (`quiz-history-view.ts`): average over
  attempts, passed over quizzes, nulls when nothing is graded, and the
  polyline's point projection for 0, 1 and N points — a one-point series must
  not divide by zero computing its x-step.
- API: ownership (another user's attempts never appear), unsubmitted attempts
  excluded, `attemptsRemaining` null for unlimited quizzes.
- e2e: sit the seeded quiz, submit, then assert the results page shows it, the
  review link resolves to the student's own answers, and the retake control is
  labelled "حاول تاني".

## Out of scope

Notifications (slice 4), the profile page and watch-history timeline (slice 3),
and any change to grading, the review matrix, or the runner itself.
