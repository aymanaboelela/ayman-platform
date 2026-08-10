# Mastery map — «نقاط ضعفك» — design

**Date:** 2026-08-10
**Status:** approved
**Builds on:** `2026-08-03-student-shell-dashboard-design.md` (slice 1),
`2026-08-03-student-quiz-insights-design.md` (slice 2)
**Scope:** a per-topic account of what a student is weak at, derived from
answers they have already given; the dashboard card that surfaces the three
weakest topics with a way to act on each; and the dashboard re-layout that
makes room for it by deleting a duplicated statistic.
**Out of scope:** the wrong-answer notebook (§9), any generated practice quiz
(§9), any points economy — that stays decided against in
`2026-08-02-learning-path-design.md` §2.

---

## 1. Why

Two separate facts, one card.

**The data exists and nothing reads it.** Every question in the bank belongs to
a `QuestionCategory`, which is a tree. Every answer a student has ever given
lives in `AttemptQuestion` with its `mark`, its `maxMark` and a pointer to the
`QuestionVersion` that resolves to its bank entry and therefore to its
category. The join from "this student got this wrong" to "this student is weak
at loops" is three foreign keys long and fully populated. `grep -r categoryId`
over `apps/api/src/modules` finds it only in admin question-bank CRUD and in
`QuizPool.sourceFilter`. **No analytics path in the product traverses it.**

**The dashboard answers one question three times and another one never.** The
hero ring, the «إجمالي تقدّمك» stat tile and the achievements strip all answer
*how am I doing* — and the first two answer it with the **same number**:
`overallPercent` is passed to `DashboardHero` and to `StatTile` on adjacent
lines of `page.tsx`. Meanwhile the only thing on the screen that answers *what
should I study* is the resume card, which can say nothing more specific than
"the video you paused".

A student who has failed a quiz currently learns their percentage and nothing
about **which topic cost them the marks**. That is the gap this closes, and it
closes it with no new table.

---

## 2. Decisions

1. **Zero migration.** Every column this needs is already written on every
   submitted attempt. If this design needs a migration, it has gone wrong.

2. **Mastery is derived on read, never stored.** Same rule, and the same
   reasoning, as `lib/achievements.ts`: a stored verdict is written once and
   survives the thing that earned it. A student who revises and retakes must
   see the number move, and a stored `is_weak_at` flag would not. The
   trade-off is the same one that file accepts out loud — a verdict can go
   backwards, which at the moment it does is correct.

3. **Only the most recent graded attempt per quiz counts.** "Graded" is
   `analytics.service.ts`'s existing `GRADED_STATES` — `submitted` and
   `pending_review` — imported, not restated, so the student's own view of a
   topic and the admin's item analysis of the same questions can never disagree
   about which sittings are real. Mastery is a picture of *now*, not a
   permanent record. Counting every historical sitting
   means the answers a student got wrong before they revised drag their topic
   down forever, which makes the card's central promise — revise this, watch it
   move — a lie. A retake replacing the old evidence is what makes the loop
   close.

4. **Minimum evidence: four answered questions in a topic.** Below that the
   topic is counted as *pending*, not as weak. One wrong answer out of one is
   0%, and a card that opens by declaring a student hopeless at a topic they
   met once is a card they stop believing on day one. Four is the smallest
   number where a single unlucky answer cannot produce a verdict below 75%.

5. **The review bar is 70%, and it is the Bakalorya pass mark.** A topic enters
   «أضعف المواضيع» only below 70% accuracy — not below the quiz's own
   `passPercent`, which defaults to 50 and is per-quiz configurable. The two
   are different questions: `passPercent` is *did this sitting pass*, and this
   is *would more work here change my grade*. 70 is the number the Egyptian
   Bakalorya itself requires (README, «نظام البكالوريا»), so the card is
   measuring students against the bar they are actually sitting for.

6. **Two colours, not a traffic light.** `--err` for a weak topic, `--ok` for a
   strong one, and nothing in between. `--warn` is unusable here: in dark mode
   it is `oklch(0.75 0.14 85)` against the accent's `oklch(0.780 0.150 74)` —
   the same colour to the eye. A third band drawn in it would put a second
   "press me" hue on a screen whose entire colour discipline is *amber is what
   you press* (`stat-tile.tsx`, `study.css`). Topics between 70% and the strong
   bar simply do not appear on the card; they are neither a problem nor an
   achievement.

7. **Green and red leave the results screen, and the rule that kept them there
   is widened rather than broken.** `study.css` states, in the exam-screen
   header, that `--ok` and `--err` «appear here and NOWHERE else in the study
   surface, which is what makes them mean a graded outcome rather than
   decoration». This card is the first thing outside that screen with a claim
   on them — and it has the claim, because *every figure on it is computed from
   marks*. Nothing here is a mood or a category; the red bar is a fraction of
   marks collected, exactly as the results screen's red is.

   So the constraint is restated in that comment, in the same commit, as: **`--ok`
   and `--err` may colour a GRADED OUTCOME and nothing else** — and the two
   places that qualify are named. Leaving the comment saying "nowhere else"
   while a second file uses them is how a design system stops being believed;
   the next person to want red would cite this card as precedent for a rule
   nobody had actually re-decided.

8. **The category is used as a leaf, not as a tree.** `QuestionCategory` has a
   `parentId` and the admin builds real hierarchies with it. Mastery groups by
   the **exact category the question sits in** and prints its own `name` — no
   roll-up to the parent. A roll-up would average an admin's organisational
   choice into the verdict: two subtopics under one parent, one mastered and
   one failed, average to a topic the student is told they are fine at. The
   name a student sees is the name Ayman typed on the questions themselves.

9. **The review link comes from the attempt, not from the question bank.**
   `AttemptQuestion → QuizAttempt → Quiz → Lesson` gives the exact lesson the
   student answered that topic in, in one join, and it works identically for
   fixed slots and for pool draws. Routing through `QuizSlot.bankEntryId`
   instead would miss every pool-drawn question, because a pool slot has no
   `bankEntryId` at all — its questions are chosen at attempt creation.

10. **The card has no empty state that reads as a failure.** A student who has
   sat nothing has no topics, and the card says so with a `SpotIllustration`
   and one line — the same treatment `page.tsx` already gives an empty course
   grid, and for the reason stated there: a dashed grey box is
   indistinguishable from something that failed to load.

---

## 3. The endpoint

`GET /api/me/mastery` → `StudentMastery`, authenticated, student scope.

```ts
export const MasteryTopicSchema = z.object({
  categoryId:      z.uuid(),
  name:            z.string(),          // the category's own name, as typed
  answered:        z.number().int(),    // questions counted, ≥ MIN_EVIDENCE
  /** 0–100, rounded to a whole number on the server. The card prints it as
   *  text and draws it as a bar; a decimal place would be precision the
   *  underlying sample size (four questions minimum) does not support. */
  accuracyPercent: z.number().int(),
  /** Where to go to fix it. Null when the lesson has since been unpublished
   *  or the student's access to it was revoked — the row still renders, it
   *  just has no button. */
  lessonId:        z.uuid().nullable(),
  lessonTitle:     z.string().nullable(),
  courseSlug:      z.string().nullable(),
});

export const StudentMasterySchema = z.object({
  /** Below REVIEW_BELOW, weakest first, at most three. */
  weakest:   z.array(MasteryTopicSchema).max(3),
  /** At or above STRONG_AT, best first, at most three. Carries no lesson
   *  link — there is nothing to fix. */
  strongest: z.array(MasteryTopicSchema).max(3),
  /** Topics that cleared MIN_EVIDENCE, however they scored. Lets the card say
   *  «١٢ موضوع اتقاسوا» rather than implying these three are everything. */
  evaluated: z.number().int(),
  /** Topics seen but still under MIN_EVIDENCE. Drives the «لسه بنجمّع» line. */
  pending:   z.number().int(),
});
```

Constants live beside the schema in `packages/contracts`, so the query, the
card and the tests cannot drift:

```ts
export const MASTERY_MIN_EVIDENCE = 4;   // §2.4
export const MASTERY_REVIEW_BELOW = 70;  // §2.5
export const MASTERY_STRONG_AT    = 90;  // matches DISTINCTION_PERCENT
```

`MASTERY_STRONG_AT` is deliberately the same 90 that `achievements.ts` already
calls `DISTINCTION_PERCENT`, and imports it rather than restating it. Two
definitions of "excellent" on one screen is exactly the drift this note exists
to prevent.

---

## 4. The query

One statement, in `MasteryService.forUser`. The service lives in
`apps/api/src/modules/quiz/` beside `analytics.service.ts` — it is the same
question (how did these answers score) asked of one student instead of one
quiz, over the same three tables, and it imports that file's `GRADED_STATES`.
Putting it under `dashboard/` would separate two nearly identical raw queries
by module boundary and guarantee they drift.

Raw SQL rather than Prisma's
`groupBy` — the latter cannot express the "latest attempt per quiz" window, and
doing it in two round-trips means loading every attempt question the student
has ever answered into Node to group it there.

```sql
WITH latest AS (
  -- §2.3 — one sitting per quiz, the most recent graded one.
  SELECT DISTINCT ON (a.quiz_id) a.id, a.quiz_id, a.submitted_at
  FROM app.quiz_attempts a
  WHERE a.user_id = $1 AND a.state IN ('submitted', 'pending_review')
  ORDER BY a.quiz_id, a.submitted_at DESC
),
scored AS (
  SELECT
    e.category_id,
    aq.mark,
    aq.max_mark,
    q.lesson_id,
    latest.submitted_at
  FROM app.attempt_questions aq
  JOIN latest                      ON latest.id = aq.attempt_id
  JOIN app.question_versions v     ON v.id = aq.question_version_id
  JOIN app.question_bank_entries e ON e.id = v.bank_entry_id
  JOIN app.quizzes q               ON q.id = latest.quiz_id
  -- Ungraded answers are excluded, not counted as zero: an essay awaiting
  -- Ayman's marking is not evidence of weakness.
  WHERE aq.mark IS NOT NULL AND aq.max_mark > 0
)
SELECT
  s.category_id,
  c.name,
  COUNT(*)                                     AS answered,
  SUM(s.mark) / NULLIF(SUM(s.max_mark), 0) * 100 AS accuracy_percent,
  -- §2.9 — the lesson of this topic's most recent contributing sitting.
  (ARRAY_AGG(s.lesson_id ORDER BY s.submitted_at DESC))[1] AS lesson_id
FROM scored s
JOIN app.question_categories c ON c.id = s.category_id
GROUP BY s.category_id, c.name
HAVING COUNT(*) >= $2;
```

`latest` therefore also selects `a.submitted_at`, and `question_versions`
points at its entry through `bank_entry_id` — the column is named for the
relation, not shortened.

**Accuracy is `SUM(mark) / SUM(max_mark)`, not `AVG(fraction)`.** Averaging
fractions gives a one-mark multiple-choice question the same weight as a
ten-mark question in the same topic. The mark-weighted form is the one that
answers "how many of this topic's marks did I actually collect", which is the
figure the student's grade is made of.

Its title and course slug come from a second, small lookup over the handful of
lesson ids the first query returned — and the lesson is dropped to `null` unless it is still
published and the student still holds access, checked through the existing
`LessonAccessService`. A card that offers a button to a 404 is worse than one
that offers no button.

### Caching

The route is `cache()`-wrapped on the web side and read in the dashboard's
existing `Promise.all`, so it costs one round-trip in parallel with the four
already there and no extra render pass.

It is **not** allowed to fail the page. `getMasteryOrNull()` follows
`lib/taxonomy.ts` exactly — this whole card is an enhancement to a screen that
was complete without it, and the dashboard has already been taken down once by
an uncached read tripping the rate limiter (`page.tsx:81-94`). A null result
renders the page with no mastery card at all.

---

## 5. The dashboard

### 5.1 The tile row goes onto the band

The four `StatTile`s under the hero are deleted from **this page only**.
`StatTile` itself stays: `/results`, `/profile` and `/quizzes/[lessonId]` all
use it, and all three are pages whose entire subject is figures. That those
four screens currently open with the identical four-tile row is itself part of
what reads as «لخبطة» — after this change the dashboard opens differently from
the three report screens, which is what a home screen should do.

Of the four figures:

- **«إجمالي تقدّمك» is deleted outright.** It is `overallPercent`, which the
  ring on the band beside it already draws and labels. One number, printed
  twice, six inches apart.
- **The other three move onto the band** as a second fact row,
  `.dash-hero__stats`, under the existing identity chips. Same ember surface,
  same non-pressable rule the band already obeys — see `page.tsx:40-48` for why
  nothing on the band may be pressable.

The two rows are visually distinct because they are different kinds of fact:
`.dash-hero__facts` is *who you are* (year, track, school) and
`.dash-hero__stats` is *how much you have done* (courses, lessons, average).
The stats row prints value and label together, `tabular-nums`, hairline
separators between items, no wells and no meters — a band is not a place for
four more shapes.

Net effect: one full-width section removed from the page, one duplicated
number removed from the screen, and the band earns the height it already had.

### 5.2 The card

`<MasteryCard>` sits **directly under the resume / first-run card**, which is
the first thing the eye reaches after the page's one primary action.

```
┌──────────────────────────────────────────────────────────┐
│  ◆  ذاكر ده                          ١٢ موضوع اتقاسوا     │
│                                                          │
│  الحلقات المتداخلة        ▓▓▓▓▓░░░░░░░░░░  ٣٤٪   [راجع] │
│  الدوال والـ return       ▓▓▓▓▓▓▓▓░░░░░░░  ٥٢٪   [راجع] │
│  المصفوفات                ▓▓▓▓▓▓▓▓▓▓░░░░░  ٦٨٪   [راجع] │
│                                                          │
│  متمكّن في:  المتغيّرات ٩٦٪ · الشروط ٩٤٪                  │
└──────────────────────────────────────────────────────────┘
```

- The **bar** is the topic's accuracy, filled in `--err`, on a `surface-4`
  track. It is the only red on the student's screen, and it is red for a
  reason a student can state.
- The **percentage** is text, `tabular-nums`, so three rows cannot jitter
  against each other.
- **«راجع»** is a per-row button to the lesson — one action per row, never a
  single button at the bottom of the card for three different problems.
  Secondary tone, because the resume card above it owns the screen's one
  accent-filled button; the rule in `page.tsx:36-38` survives this addition
  intact.
- The **«متمكّن في» line** is one line of `--ok` chips, not a second block. It
  exists so the card is not purely an indictment, and it is deliberately the
  smallest thing on the card.
- The **head count** («١٢ موضوع اتقاسوا») is what stops three rows reading as
  "these are all the topics that exist".

Rendered with `.group-head` and the existing card surface — this introduces no
new container, only a new arrangement inside one.

**States.**

| condition | what renders |
|---|---|
| nothing sat yet, or every topic still under MIN_EVIDENCE | `SpotIllustration` + «لسه بنجمّع صورة عن مستواك — امتحن كام امتحان وهتلاقي هنا بالظبط إنت ضعيف في إيه.» |
| topics evaluated, none below 70% | the illustration in its congratulation pose + «مفيش موضوع محتاج مراجعة دلوقتي» + the «متمكّن في» line |
| one or two weak topics | that many rows; the card does not pad to three |
| endpoint failed | the card is absent entirely (§4) |

### 5.3 The order of the page

| before | after |
|---|---|
| hero | hero *(now carries the three figures)* |
| resume / first-run | resume / first-run |
| **four stat tiles** | **نقاط ضعفك** |
| إنجازاتك | كورساتي |
| كورساتي | امتحاناتك |
| امتحاناتك | إنجازاتك |

Five sections instead of six, and the sequence now reads **what to do now →
what to fix → your work → your marks → what you have earned**.

Moving «إنجازاتك» below is a **reversal of a documented decision**, so the
reason is recorded rather than left implicit. `page.tsx:203-206` put it above
the courses on the argument that everything below it was work outstanding, so a
student should meet what they had already done first. That argument was correct
*for a page with no other positive block on it*. The mastery card's «متمكّن في»
line and its congratulation state now carry that job at the top of the page,
and a rewards strip sitting between "fix this" and "your courses" interrupts
the only run of the page that is about acting.

---

## 6. Copy

All strings into `packages/contracts/src/copy/ar.ts` under a new
`dashboard.mastery` key — no Arabic in the component, per the rule in README.
Nothing existing is renamed. New keys: `title`, `evaluatedCount` (`{n}`),
`reviewCta`, `strongLabel`, `emptyBody`, `allClearBody`, `pendingNote` (`{n}`),
and an `accessibleRow` template (`{topic}`, `{percent}`) for the bar's
screen-reader name.

---

## 7. Accessibility

Each bar is a `role="progressbar"` with `aria-valuenow` **only** where the
percentage is not already adjacent text — it is, so the bars are `aria-hidden`
and the row's accessible name is the topic plus the printed percentage. This
is the same call `StatTile` documents at `stat-tile.tsx:92-95`, and made the
same way for the same reason: a progressbar role beside the number it draws
announces the figure twice.

`/dashboard` is already in the axe sweep list in `apps/web/e2e/a11y.e2e.ts`, so
this card is covered by an existing test with no list edit. The red bar is
never the sole carrier of meaning — the percentage and the topic name are text.

---

## 8. Testing

- **`mastery.service.spec.ts`** — the evidence floor (3 answers → pending, 4 →
  evaluated); mark weighting (one 10-mark wrong + one 1-mark right ≠ 50%); the
  latest-attempt-per-quiz window (an old failed sitting must not drag a retaken
  quiz down); ungraded answers excluded rather than zeroed; a topic whose
  lesson was unpublished returns the row with a null lesson.
- **Integration** — the endpoint against a real database with a seeded attempt
  across two categories.
- **`mastery-card.spec.tsx`** — the four states in §5.2, and that a row with a
  null `lessonId` renders no button.
- **Authz matrix** — `apps/api/src/test/authorization-matrix.int-spec.ts`
  asserts it *accounts for every registered route*, so a new endpoint fails it
  until it is named. Three rows: 401 anonymous, 200 student, 200 student with
  no attempts (empty arrays, not 404). Added in the same commit as the route.
  (This is the omission commit `4cf8499` had to correct for the duration probe.)

---

## 9. Out of scope, and why

- **The wrong-answer notebook.** Clicking a weak topic to see the actual
  questions missed in it is the natural next slice, and this endpoint is what
  makes it cheap. It is not in this one because it needs a review-screen
  variant filtered by category, which is a second surface, not a card.
- **A generated practice quiz on the weak topic.** `QuizPool.sourceFilter`
  already carries `{ categoryIds, types }`, so the *engine* could draw it
  today. What blocks it is that `quizzes.lesson_id` is `@unique` and `NOT
  NULL` — a quiz is a property of a lesson, so an ad-hoc practice paper has no
  legal place to exist. That is a schema conversation, and this slice was
  scoped on having none.
- **Any points economy.** Unchanged from `learning-path-design.md` §2.
