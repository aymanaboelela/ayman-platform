# Mistakes notebook — «دفتر أخطائي» — design

**Date:** 2026-08-11
**Status:** approved
**Builds on:** `2026-08-10-mastery-map-design.md`
**Scope:** every question a student got wrong, across all their quizzes,
grouped by the topic it belongs to; the page that renders them; and the link
from the mastery card's weak topics into it.
**Out of scope:** any change to the review matrix, its defaults, or the review
screen itself; any generated practice quiz (still blocked on
`quizzes.lesson_id` being `@unique NOT NULL`).

---

## 1. Why

The mastery card names the topic. It cannot show the questions, and the
questions are where the studying actually happens — the notebook a strong
student keeps by hand is a list of what they got wrong, not a list of topics.

What already exists, and what does not:

- **Per attempt, "show only my mistakes" is built.** `review-list.tsx` has a
  `wrongOnly` toggle. A student can already see their mistakes *in one
  sitting*.
- **Across sittings, nothing.** There is no view of "every question I have
  ever got wrong", and no way to reach the questions of a topic from the
  topic itself. `/results` lists quizzes and percentages; the review screen
  needs an attempt id.

So the notebook adds exactly one thing: **the same wrong questions, gathered
across attempts and grouped by topic** — the destination the mastery card's
weak topics have been pointing at without a page to point to.

---

## 2. The constraint that shapes everything

A quiz carries a **4×7 review matrix**: for each of four windows (`during`,
`immediatelyAfter`, `laterWhileOpen`, `afterClose`), seven flags decide what a
student may see. The default (`DEFAULT_REVIEW_OPTIONS`,
`packages/contracts/src/quiz/quiz-settings.ts:66`) is:

| window | response · correctness · marks · feedback | rightAnswer |
|---|---|---|
| `during` | ✗ | ✗ |
| `immediatelyAfter` | ✓ | ✓ |
| **`laterWhileOpen`** | ✓ | **✗** |
| `afterClose` | ✓ | ✓ |

The third row is the interesting one and it is deliberate: a student revisiting
a quiz **that is still open to their classmates** sees that they were wrong and
sees the teacher's feedback, but **not the model answer** — which they could
otherwise photograph and circulate.

A notebook that ignores this is a back door around every answer-leak control in
the quiz engine. So:

**The notebook reuses the review path's own machinery and re-derives none of
it.** All four live in code already:

```ts
resolveReviewWindow({ submittedAt, openUntil, now })   // which window
resolveReviewFlags(quiz.reviewOptions, window)          // what is permitted
toReviewQuestion(row, flags)                            // strips the rest
lessonAccess.requireOwnership(userId, lessonId)         // may they still look
```

The first three are in
`apps/api/src/modules/quiz/serializers/review.serializer.ts`; the fourth is
`LessonAccessService`. `AttemptService.review` composes exactly these four, and
`MistakesService` composes the same four over many attempts instead of one.

The fourth is not a formality. Its own comment in `attempt.service.ts` states
the failure it prevents: without it, *"an unpublished question bank leaks its
model answers to a revoked student once the review window resolves to
`afterClose`"*. The notebook spans many lessons, so it must run that check
**per lesson**, not once.

---

## 3. Decisions

1. **Zero migration.** Every column is already written. Same as the mastery
   slice; if this needs a schema change, the design is wrong.

2. **Latest graded attempt per quiz.** Identical to `MasteryService`, and
   imported from it rather than restated (§4). A student who revised and
   retook a quiz correctly should find that question **gone** from the
   notebook — that is the loop the whole feature exists to close, and counting
   every historical sitting would keep their old failures on the page forever.

3. **A question appears only when its window permits `correctness`.** Not a
   policy choice — an epistemic one. With `correctness` withheld the server has
   not told the client the question was wrong, and a notebook is by definition
   a list of wrong questions. `review-list.tsx` reaches the same conclusion for
   its own filter: *"In a window that withholds correctness there is nothing to
   filter BY"*.

4. **The right answer appears only when the window permits `rightAnswer`;
   the question appears either way.** This is the founder's call, taken
   explicitly: a student in `laterWhileOpen` sees the stem, the options, their
   own wrong answer and the teacher's feedback, with the model answer replaced
   by one line saying it unlocks when the quiz closes. Studying starts now;
   the key waits. The alternative — hiding the whole question until the key is
   available — was rejected because it makes the notebook empty exactly when a
   student is most likely to open it, in the days after sitting the paper.

5. **`<ReviewQuestion>` is reused unchanged.** It already renders a stem,
   options, the student's answer, the right-answer highlight and both feedback
   kinds, and it already handles every optional field being absent — which is
   precisely the `laterWhileOpen` case. A second renderer would be a second
   place for an answer to leak.

6. **Grouping is by leaf `QuestionCategory`**, the same join and the same
   no-roll-up rule the mastery map documents. The topic names on the card and
   the topic chips on this page must be the same strings, or the link between
   them reads as a coincidence.

---

## 4. The endpoint

`GET /api/me/mistakes` → `StudentMistakes`, `quiz:read`, no id parameter.

```ts
export const MistakeSchema = z.object({
  /** The `attempt_questions` row id — stable, and already the key the review
   *  screen anchors on. */
  attemptQuestionId: z.string(),
  attemptId: z.uuid(),
  lessonId: z.uuid(),
  quizTitle: z.string(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  submittedAt: z.string(),
  /** Whether this quiz's CURRENT window permits the model answer. False means
   *  the card prints `copy.mistakes.answerLocked` in its place — the field is
   *  on the row rather than inferred from `question.rightAnswerText` being
   *  absent, because absent is also what a question with no model answer
   *  looks like. */
  answerAvailable: z.boolean(),
  /** The SAME shape the review screen renders, produced by the SAME
   *  serializer. Optional fields are absent exactly as the window dictates. */
  question: ReviewQuestionSchema,
});

export const StudentMistakesSchema = z.object({
  mistakes: z.array(MistakeSchema),
  /** Every topic present in `mistakes`, most mistakes first — the filter
   *  chips. Derived server-side so the page does not have to group twice. */
  topics: z.array(z.object({
    categoryId: z.uuid(),
    name: z.string(),
    count: z.number().int(),
  })),
  /** Quizzes that contributed nothing because their window withholds
   *  `correctness` (§3.3). Drives one honest line under the list rather than
   *  letting a partial notebook read as a complete one. */
  withheldQuizzes: z.number().int(),
});
```

`ReviewQuestionSchema` does not exist in `packages/contracts` today — the
review page declares it inline
(`apps/web/app/(app)/quizzes/[lessonId]/attempt/[attemptId]/review/page.tsx`).
This slice moves that declaration into `packages/contracts/src/quiz/attempt.ts` beside the
`ReviewQuestion` **interface** it mirrors, and the review page imports it from
there. Two Zod schemas for one interface, in two packages, is the drift this
avoids; it is also the smallest possible change to that page.

### Ordering

Most recently submitted first. A notebook is read newest-first — the paper you
just sat is the one you came to look at — and the topic chips are what serve
"show me one subject at a time".

---

## 5. The query

`MistakesService.forUser`, in `apps/api/src/modules/quiz/` beside
`MasteryService` and `AnalyticsService`.

**Step 1 — the same attempts mastery counts.** `MasteryService` gains one
exported helper so the two features cannot disagree about which sittings are
real:

```ts
/** The most recent graded attempt per quiz, for one student. */
export async function latestGradedAttempts(
  prisma: PrismaService,
  userId: string,
): Promise<{ id: string; quizId: string }[]>
```

`MasteryService.forUser` is refactored onto it in the same commit — a shared
helper that only one caller uses is not shared, it is just moved.

**Step 2 — load those attempts** with the exact `select` shape
`AttemptService.review` uses (it is what `toReviewQuestion` requires), plus the
category join:

```
attempt_questions → question_versions → question_bank_entries → question_categories
```

**Step 3 — resolve and serialize, per attempt**, with the four functions from
§2, then keep a question only when:

```
flags.correctness === true
  AND state ∈ { graded_wrong, graded_partial }
```

`state`, not `mark < maxMark`: the four `graded_*` values are the enum the
grader writes, and `needs_grading` must not be read as a mistake.

**Step 4 — access.** `requireOwnership` per distinct `lessonId`, resolved once
per lesson and cached for the request. An attempt whose lesson throws is
dropped silently — the student has lost access, and a 404 for the whole page
because one old course was unpublished would be a worse answer than a shorter
notebook.

### Cost

This is heavier than the mastery aggregate: it loads full question rows,
options and feedback rather than counting marks. Bounded two ways — only the
latest attempt per quiz, and only questions that survive the filter — but a
student with forty quizzes is a real payload.

`GET /api/me/mistakes` is therefore **not** on the dashboard's critical path.
It is read only by `/mistakes`, a page a student navigates to deliberately.
The dashboard's `Promise.all` is already at six calls against a `short`
throttle of 10/second (`app.module.ts`); adding a seventh, heavier one to serve
a card that links out is exactly the mistake the mastery caching note warns
about.

---

## 6. The page

`/mistakes`, in the `(app)` group, with a `STUDENT_NAV` entry
(`components/app/student-nav-items.ts`) between «نتائجي» and «الكورسات» —
beside the other account of how the student is doing, and before the library.
Icon `NotebookPen`, lucide, per Global Constraint 9.

```
┌──────────────────────────────────────────────────────────┐
│  ◆  دفتر أخطائي                            ١٤ سؤال       │
│                                                          │
│  [ الكل ٤ ]  [ الحلقات المتداخلة ٦ ]  [ المصفوفات ٥ ]  … │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ الحلقات المتداخلة · اختبار الوحدة الثالثة · ٣ مايو │  │
│  │                                                    │  │
│  │        <ReviewQuestion question={…} />             │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- **The chips** are `.chip chip--quiet`, the control this surface already uses.
  `?topic=<categoryId>` is a real URL — a student sharing or bookmarking a
  topic gets that topic, and the mastery card links straight into it. The
  active chip is `.chip--solid`.
- **Filtering is client-side.** The payload is already loaded and already
  grouped; a round-trip per chip would be slower and no more correct.
- **Each card is headed** by topic · quiz · date, so a question torn out of its
  paper still says where it came from.
- **The withheld line**, when `withheldQuizzes > 0`: one sentence saying N
  quizzes are not shown yet because their review is still closed. Without it a
  student who knows they failed something and cannot find it concludes the
  page is broken.

**Empty states**, and they are three different facts:

| condition | what renders |
|---|---|
| no mistakes at all, nothing withheld | `SpotIllustration` + «مفيش أخطاء متسجّلة عليك» |
| no mistakes, but `withheldQuizzes > 0` | the illustration + «مراجعة امتحاناتك لسه مقفولة» |
| a topic filter with no matches | the chip row stays, one line offering «الكل» |

---

## 7. The mastery card gains a link

`MasteryCard`'s topic **name** becomes a `<Link>` to
`/mistakes?topic=<categoryId>`. «راجع» is unchanged and still opens the lesson.

Two actions per row, and they do not compete because they are different verbs
on different objects: the name is the mistakes, the button is the lesson. The
row gains no new visual weight — the title was already there.

**`MasteryService` learns nothing about review flags, deliberately.** The first
draft of this section had `MasteryTopic` gain a `hasVisibleMistakes` boolean,
so the card could leave the name unlinked when the notebook would come back
empty. That case is real but narrow: it needs an admin to have switched
`correctness` off for a window a *submitted* attempt resolves into — `during`
cannot produce it, because an attempt still in `during` has not been submitted
and mastery never counted it.

The cost was the wrong shape. Mastery would have had to resolve the review
matrix per topic, which teaches a marks aggregate about answer-disclosure
policy and couples two features that are currently independent. `/mistakes`
already renders the honest answer for that state — «مراجعة امتحاناتك لسه
مقفولة», §6 — so a rare click that lands on an explained empty page is a better
outcome than a permanent coupling.

---

## 8. Accessibility

The chips are a `role="group"` with an `aria-label` from copy, each an
`aria-pressed` toggle button — they filter in place rather than navigating, so
they are buttons that update the URL, not links. `<ReviewQuestion>` carries its
own semantics unchanged.

`/mistakes` is a new authenticated route, so it goes in the axe sweep list in
`apps/web/e2e/a11y.e2e.ts` — that list is maintained by hand, and a route
missing from it is exactly the one that breaks unnoticed.

---

## 9. Testing

- **`mistakes.service.spec.ts`** (DB-backed, as `mastery.service.spec.ts` is):
  a question in a `laterWhileOpen` quiz comes back with no `rightAnswerText`
  and `answerAvailable: false`; the same quiz after `openUntil` comes back with
  both; a quiz whose window withholds `correctness` contributes zero questions
  and increments `withheldQuizzes`; a `needs_grading` question is not a
  mistake; a retake that answered correctly removes the question; a revoked
  enrolment drops that lesson's questions and does not fail the request.
- **Leak contract:** the existing `no-answer-leak.interceptor` covers
  controllers it decorates. This route is deliberately not decorated, for the
  same reason `MeQuizzesController` documents — but that carve-out was written
  for payloads carrying **no** question data, and this one carries stems and
  options. So the spec above asserts the absence of `rightAnswerText` directly,
  which is the property that actually matters.
- **`mistakes-page.test.tsx`:** the three empty states, chip filtering, and
  that a card with `answerAvailable: false` renders the locked line.
- **Authz matrix:** `/api/me/mistakes`, 401 anonymous / 200 student.
- **Barrel guard:** any runtime value this needs from contracts comes from a
  subpath export — `test/contracts-barrel.check.ts` fails the build otherwise.

---

## 10. Out of scope, and why

- **Changing the review defaults.** `laterWhileOpen` withholding the model
  answer is a deliberate anti-cheating control. This design works within it.
- **Marking a mistake as "understood".** A per-question dismiss flag is the
  first thing this design was tempted by and the first thing cut: it needs a
  table, it needs a write path, and the notebook already empties itself
  correctly when the student retakes the quiz and gets it right — which is a
  better signal than self-assessment.
- **A generated practice quiz.** Unchanged from the mastery spec:
  `quizzes.lesson_id` is `@unique NOT NULL`, so an ad-hoc paper has no legal
  place to exist. That is a schema conversation.
