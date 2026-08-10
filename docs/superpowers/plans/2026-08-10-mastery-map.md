# Mastery map — «نقاط ضعفك» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a student the three question-topics they are weakest at, computed from marks they have already earned, with a button to the lesson that taught each — and make room for it on the dashboard by deleting a statistic the page prints twice.

**Architecture:** One new authenticated read (`GET /api/me/mastery`) served by a raw-SQL aggregate over `attempt_questions → question_versions → question_bank_entries → question_categories`, grouped per category over each quiz's most recent graded sitting. No migration. The web side reads it inside the dashboard's existing `Promise.all` through a React `cache()` wrapper that swallows failure, renders a new `<MasteryCard>`, folds the four stat tiles onto the hero band, and reorders the page.

**Tech Stack:** NestJS 11 · Prisma 7 (`$queryRaw`) · PostgreSQL 16 · Next.js 16 App Router · React Server Components · Tailwind 4 + hand-written CSS in `study.css` · Zod 4 (`@ayman/contracts`) · Jest (API) · Vitest + Testing Library (web).

**Spec:** `docs/superpowers/specs/2026-08-10-mastery-map-design.md`

## Global Constraints

- **No migration.** If a step needs a schema change, stop — the design is wrong. (Spec §2.1)
- **No Arabic string literals in components or services.** Every user-visible string goes in `packages/contracts/src/copy/ar.ts`. (README, «كل النصوص في مكان واحد»)
- **RTL only.** ESLint rejects `ml-*`, `mr-*`, `left-*`, `right-*`, `pl-*`, `pr-*` — including inside `cn()`, `clsx()` and ternaries. Use `ms-*`, `me-*`, `ps-*`, `pe-*`, `inline-start`, `inline-end`.
- **Colour discipline.** Amber (`--a-*` / `accent`) is the only "press me" colour and there is exactly one accent-filled button per screen — it belongs to the resume card. Ember (`--e-*`) is structure and is never pressable. `--ok` / `--err` mean *graded outcome* only. `--warn` must not be used on the dashboard at all: in dark mode it is visually identical to the accent. (Spec §2.6, §2.7)
- **Extensionless relative imports** inside `packages/contracts` — Turbopack cannot remap a `.js` specifier onto a `.ts` source.
- **`packages/contracts` may never import from `apps/web` or `apps/api`.** The dependency runs one way.
- **Ownership.** No route in this feature takes an id parameter. The session is the identity. (Spec §3)
- **Never pass `-c user.name=` or `-c user.email=` to `git commit`.** The global config is already correct.

**Commands:**

| what | command |
|---|---|
| API unit + DB-backed specs | `pnpm --filter @ayman/api test` |
| one API spec file | `pnpm --filter @ayman/api exec jest src/modules/quiz/mastery.service.spec.ts` |
| API integration (`*.int-spec.ts`) | `pnpm --filter @ayman/api test:integration` |
| web unit | `pnpm --filter @ayman/web test` |
| one web test file | `pnpm --filter @ayman/web exec vitest run components/dashboard/mastery-card.test.tsx` |
| contracts | `pnpm --filter @ayman/contracts test` |
| lint / types | `pnpm lint` · `pnpm typecheck` |

> **Postgres must be running** for Task 2's spec and Task 3's integration test. `analytics.service.spec.ts` sets the precedent: it is a `.spec.ts` that connects to `DATABASE_URL`.

---

## File Structure

| file | responsibility |
|---|---|
| **Create** `packages/contracts/src/quiz/mastery.ts` | `MasteryTopicSchema`, `StudentMasterySchema`, the three thresholds |
| Modify `packages/contracts/src/quiz/index.ts` | re-export the above |
| Modify `packages/contracts/src/copy/ar.ts` | `dashboard.mastery.*` strings |
| **Create** `apps/api/src/modules/quiz/mastery.service.ts` | the aggregate; the only file that knows the SQL |
| **Create** `apps/api/src/modules/quiz/mastery.service.spec.ts` | DB-backed unit spec |
| Modify `apps/api/src/modules/quiz/me-quizzes.controller.ts` | `@Get('mastery')` |
| Modify `apps/api/src/modules/quiz/quiz.module.ts` | provide `MasteryService` |
| Modify `apps/api/src/test/authorization-matrix.int-spec.ts` | two rows for the new route |
| **Create** `apps/web/lib/mastery.ts` | `getMasteryOrNull()` — `cache()`, never throws |
| **Create** `apps/web/components/dashboard/mastery-card.tsx` | the card, four states |
| **Create** `apps/web/components/dashboard/mastery-card.test.tsx` | the four states |
| Modify `apps/web/components/dashboard/spot-illustration.tsx` | a `'topics'` drawing |
| Modify `apps/web/app/study.css` | `.topic-row*`, `.hero-stat*`; corrects the `--ok`/`--err` comment |
| Modify `apps/web/components/dashboard/dashboard-hero.tsx` | the stats row on the band |
| Modify `apps/web/lib/achievements.ts` | `DISTINCTION_PERCENT` becomes an alias |
| Modify `apps/web/app/(app)/dashboard/page.tsx` | drop the tile row, mount the card, reorder |
| Modify `apps/web/app/(app)/dashboard/loading.tsx` | skeleton matches the new order |

---

### Task 1: The contract — schema, thresholds, copy

**Files:**
- Create: `packages/contracts/src/quiz/mastery.ts`
- Create: `packages/contracts/src/quiz/mastery.spec.ts`
- Modify: `packages/contracts/src/quiz/index.ts`
- Modify: `packages/contracts/src/copy/ar.ts`
- Modify: `apps/web/lib/achievements.ts:62`

**Interfaces:**
- Consumes: nothing.
- Produces: `MasteryTopicSchema`, `MasteryTopic`, `StudentMasterySchema`, `StudentMastery`, `MASTERY_MIN_EVIDENCE: 4`, `MASTERY_REVIEW_BELOW: 70`, `MASTERY_STRONG_AT: 90`, and `copy.dashboard.mastery`. Every later task depends on these exact names.

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/quiz/mastery.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MASTERY_MIN_EVIDENCE,
  MASTERY_REVIEW_BELOW,
  MASTERY_STRONG_AT,
  StudentMasterySchema,
} from './mastery';

const topic = {
  categoryId: '0198c3a2-0000-7000-8000-000000000001',
  name: 'الحلقات المتداخلة',
  answered: 6,
  accuracyPercent: 34,
  lessonId: '0198c3a2-0000-7000-8000-000000000002',
  lessonTitle: 'الحلقات',
  courseSlug: 'cs-y2',
};

describe('StudentMasterySchema', () => {
  it('accepts a topic whose lesson could not be resolved', () => {
    const parsed = StudentMasterySchema.parse({
      weakest: [{ ...topic, lessonId: null, lessonTitle: null, courseSlug: null }],
      strongest: [],
      evaluated: 1,
      pending: 0,
    });
    expect(parsed.weakest[0].lessonId).toBeNull();
  });

  it('rejects more than three weak topics — the card has room for three', () => {
    expect(() =>
      StudentMasterySchema.parse({
        weakest: [topic, topic, topic, topic],
        strongest: [],
        evaluated: 4,
        pending: 0,
      }),
    ).toThrow();
  });

  it('rejects a fractional accuracy — the server rounds', () => {
    expect(() =>
      StudentMasterySchema.parse({
        weakest: [{ ...topic, accuracyPercent: 34.5 }],
        strongest: [],
        evaluated: 1,
        pending: 0,
      }),
    ).toThrow();
  });

  it('orders the thresholds so a topic cannot be weak and strong at once', () => {
    expect(MASTERY_MIN_EVIDENCE).toBe(4);
    expect(MASTERY_REVIEW_BELOW).toBeLessThan(MASTERY_STRONG_AT);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @ayman/contracts test`
Expected: FAIL — `Cannot find module './mastery'`.

- [ ] **Step 3: Write the schema**

Create `packages/contracts/src/quiz/mastery.ts`:

```ts
import { z } from 'zod';

/**
 * «نقاط ضعفك» — a per-topic account of a student's own marks.
 *
 * Nothing here is stored. The whole shape is recomputed on every read from
 * `attempt_questions`, exactly as `apps/web/lib/achievements.ts` recomputes
 * its badges, and for the same reason: a stored verdict outlives the thing
 * that earned it, and a student who revises and retakes must see the number
 * move.
 */

/** Questions a student must have answered in a topic before it is judged at
 *  all. One wrong answer out of one is 0%, and a card that opens by declaring
 *  a student hopeless at a topic they met once is a card they stop believing
 *  on day one. Four is the smallest number where a single unlucky answer
 *  cannot produce a verdict below 75%. */
export const MASTERY_MIN_EVIDENCE = 4;

/** Below this, a topic needs review. It is the Egyptian Bakalorya's own pass
 *  mark — NOT `Quiz.passPercent`, which defaults to 50 and is per-quiz
 *  configurable. Those answer different questions: `passPercent` is "did this
 *  sitting pass", this is "would more work here change my grade". */
export const MASTERY_REVIEW_BELOW = 70;

/** At or above this, a topic is mastered. `apps/web/lib/achievements.ts`
 *  re-exports this as `DISTINCTION_PERCENT` — the dependency runs that way
 *  because contracts may never import from `apps/web`. */
export const MASTERY_STRONG_AT = 90;

export const MasteryTopicSchema = z.object({
  categoryId: z.uuid(),
  /** The category's OWN name, never a parent's. Rolling up to the parent would
   *  average an admin's filing decision into the verdict. */
  name: z.string(),
  /** Questions counted. Always ≥ MASTERY_MIN_EVIDENCE. */
  answered: z.number().int(),
  /** 0–100, whole numbers. A decimal place would be precision that a
   *  four-question sample does not support. */
  accuracyPercent: z.number().int(),
  /** Where to go to fix it — null when the lesson was unpublished or the
   *  student's access to it was revoked. The row still renders; it just has
   *  no button, because a button to a 404 is worse than none. */
  lessonId: z.uuid().nullable(),
  lessonTitle: z.string().nullable(),
  courseSlug: z.string().nullable(),
});
export type MasteryTopic = z.infer<typeof MasteryTopicSchema>;

export const StudentMasterySchema = z.object({
  /** Below MASTERY_REVIEW_BELOW, weakest first. Capped at three because the
   *  card has three rows — a list of every weak topic is a syllabus, not an
   *  instruction. */
  weakest: z.array(MasteryTopicSchema).max(3),
  /** At or above MASTERY_STRONG_AT, best first. Carries lesson fields for
   *  shape consistency; the card never links them, because there is nothing
   *  to fix. */
  strongest: z.array(MasteryTopicSchema).max(3),
  /** Topics that cleared MASTERY_MIN_EVIDENCE, however they scored. Lets the
   *  card say «١٢ موضوع اتقاسوا» rather than implying three is everything. */
  evaluated: z.number().int(),
  /** Topics seen but still under MASTERY_MIN_EVIDENCE. */
  pending: z.number().int(),
});
export type StudentMastery = z.infer<typeof StudentMasterySchema>;
```

- [ ] **Step 4: Re-export it**

In `packages/contracts/src/quiz/index.ts`, add alongside the existing lines (extensionless — see Global Constraints):

```ts
export * from './mastery';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter @ayman/contracts test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Add the copy**

In `packages/contracts/src/copy/ar.ts`, inside the `dashboard: {` object, after the exams block, add:

```ts
    // ── «نقاط ضعفك» — the mastery card ───────────────────────────────────
    mastery: {
      title: 'ذاكر ده',
      /** `{n}` — how many topics cleared the evidence floor. Present so three
       *  rows do not read as "these are all the topics that exist". */
      evaluatedCount: '{n} موضوع اتقاسوا',
      reviewCta: 'راجع',
      strongLabel: 'متمكّن في:',
      /** Nothing sat yet, or every topic still under the evidence floor. */
      emptyBody: 'لسه بنجمّع صورة عن مستواك. امتحن كام امتحان وهتلاقي هنا بالظبط إنت ضعيف في إيه.',
      /** Topics measured, none under the review bar. */
      allClearBody: 'مفيش موضوع محتاج مراجعة دلوقتي — كل اللي اتقاس فوق السبعين.',
      /** `{n}` — topics seen but not yet judged. Appended under the rows. */
      pendingNote: 'لسه في {n} موضوع تحت القياس.',
      /** `{topic}`, `{percent}` — the accessible name of a row, because the
       *  bar itself is `aria-hidden`. */
      accessibleRow: '{topic} — {percent}٪ من الدرجات',
    },
```

- [ ] **Step 7: Point `DISTINCTION_PERCENT` at the shared constant**

In `apps/web/lib/achievements.ts`, change line 62 and the import at the top. The existing comment above it stays exactly as it is — it explains *why* 90 rather than the pass mark, which is still true.

```ts
// at the top, alongside the existing contracts import:
import { MASTERY_STRONG_AT, copy, type Dashboard, type QuizHistorySummary } from '@ayman/contracts';

// line 62 — the doc comment above is unchanged:
export const DISTINCTION_PERCENT = MASTERY_STRONG_AT;
```

- [ ] **Step 8: Verify nothing else broke**

Run: `pnpm --filter @ayman/contracts test && pnpm --filter @ayman/web test && pnpm typecheck`
Expected: PASS everywhere. `typecheck` is the step that proves `copy.dashboard.mastery` is now on the `Copy` type.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/quiz/mastery.ts packages/contracts/src/quiz/mastery.spec.ts \
        packages/contracts/src/quiz/index.ts packages/contracts/src/copy/ar.ts \
        apps/web/lib/achievements.ts
git commit -m "feat(contracts): the shape of a topic a student is weak at

Three thresholds and two schemas, all derived and none stored — the same
rule achievements.ts follows, so a retake moves the number instead of
leaving a stale verdict behind.

MASTERY_STRONG_AT is the 90 that achievements.ts already called
DISTINCTION_PERCENT. That constant becomes an alias of this one rather than
the reverse: contracts is consumed by apps/api too and may never import from
apps/web."
```

---

### Task 2: `MasteryService` — the aggregate

**Files:**
- Create: `apps/api/src/modules/quiz/mastery.service.ts`
- Create: `apps/api/src/modules/quiz/mastery.service.spec.ts`

**Interfaces:**
- Consumes: `StudentMastery`, `MasteryTopic`, `MASTERY_MIN_EVIDENCE`, `MASTERY_REVIEW_BELOW`, `MASTERY_STRONG_AT` from `@ayman/contracts` (Task 1); `GRADED_STATES` from `./analytics.service`; `PrismaService`.
- Produces: `class MasteryService { forUser(userId: string): Promise<StudentMastery> }`, used by Task 3.

> **Why this file sits in `modules/quiz/` and not `modules/dashboard/`:** it is the same question `analytics.service.ts` asks (how did these answers score) posed of one student instead of one quiz, over the same three tables, and it imports that file's `GRADED_STATES`. Two nearly identical raw queries separated by a module boundary is a guarantee they drift.

- [ ] **Step 1: Export `GRADED_STATES` from the analytics service**

It is currently module-private in `apps/api/src/modules/quiz/analytics.service.ts:5`. Add the keyword and a note:

```ts
/** The two states in which an attempt's marks are real. Exported because
 *  `mastery.service.ts` must count exactly the same sittings the admin's item
 *  analysis counts — a student told they are weak at a topic and a teacher
 *  looking at the same questions must not be reading different populations. */
export const GRADED_STATES = ['submitted', 'pending_review'] as const;
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/quiz/mastery.service.spec.ts`. This connects to the real database, exactly as `analytics.service.spec.ts` does.

```ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { MASTERY_MIN_EVIDENCE } from '@ayman/contracts';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { MasteryService } from './mastery.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

describe('MasteryService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new MasteryService(prisma);

  let fixture: QuizFixture;
  const attemptIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Six questions so a topic can clear MASTERY_MIN_EVIDENCE (4) with room
    // to spare, and so a half-right result is not also a boundary case.
    fixture = await seedQuizFixture(prisma, { questionCount: 6 });
  });

  afterEach(async () => {
    if (attemptIds.length > 0) {
      await prisma.attemptQuestion.deleteMany({ where: { attemptId: { in: attemptIds } } });
      await prisma.quizAttempt.deleteMany({ where: { id: { in: attemptIds } } });
      attemptIds.length = 0;
    }
    await fixture?.cleanup();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * Inserts an already-graded attempt directly rather than driving the real
   * start/save/submit flow. `MasteryService` reads straight off
   * `attempt_questions`, so a synthetic historical row is indistinguishable
   * from a real one for its purposes — the same shortcut, for the same
   * reason, that `analytics.service.spec.ts` documents.
   *
   * `marks` is one entry per question: the mark awarded and the mark
   * available. `null` mark means "not graded yet".
   */
  async function seedAttempt(args: {
    attemptNo: number;
    submittedAt: Date;
    state?: 'submitted' | 'pending_review' | 'in_progress';
    marks: { mark: number | null; maxMark: number }[];
  }): Promise<void> {
    const attemptId = randomUUID();
    attemptIds.push(attemptId);

    await prisma.quizAttempt.create({
      data: {
        id: attemptId,
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: args.attemptNo,
        paper: 'original',
        state: args.state ?? 'submitted',
        submittedAt: args.submittedAt,
        startedAt: args.submittedAt,
      },
    });

    await prisma.attemptQuestion.createMany({
      data: args.marks.map((entry, index) => ({
        attemptId,
        slotPosition: index + 1,
        questionVersionId: fixture.versionIds[index],
        optionOrder: [0, 1, 2, 3],
        maxMark: entry.maxMark,
        minFraction: 0,
        maxFraction: 1,
        mark: entry.mark,
        fraction: entry.mark === null ? null : entry.mark / entry.maxMark,
        state: entry.mark === null ? 'needs_grading' : 'graded_partial',
      })),
    });
  }

  it('weights by marks, not by question count', async () => {
    // One 10-mark question wrong, four 1-mark questions right. By question
    // count that is 80%; by marks it is 4/14 = 29%. The card's whole claim is
    // that it reflects the student's GRADE, so it must say 29.
    await seedAttempt({
      attemptNo: 1,
      submittedAt: new Date('2026-05-01T10:00:00Z'),
      marks: [
        { mark: 0, maxMark: 10 },
        { mark: 1, maxMark: 1 },
        { mark: 1, maxMark: 1 },
        { mark: 1, maxMark: 1 },
        { mark: 1, maxMark: 1 },
      ],
    });

    const result = await service.forUser(fixture.studentId);

    expect(result.weakest).toHaveLength(1);
    expect(result.weakest[0].categoryId).toBe(fixture.categoryId);
    expect(result.weakest[0].accuracyPercent).toBe(29);
    expect(result.weakest[0].answered).toBe(5);
  });

  it('holds a topic back until it has MASTERY_MIN_EVIDENCE answers', async () => {
    await seedAttempt({
      attemptNo: 1,
      submittedAt: new Date('2026-05-01T10:00:00Z'),
      marks: Array.from({ length: MASTERY_MIN_EVIDENCE - 1 }, () => ({ mark: 0, maxMark: 1 })),
    });

    const result = await service.forUser(fixture.studentId);

    expect(result.weakest).toEqual([]);
    expect(result.evaluated).toBe(0);
    expect(result.pending).toBe(1);
  });

  it('reads only the most recent graded sitting of a quiz', async () => {
    // The failure the student revised away…
    await seedAttempt({
      attemptNo: 1,
      submittedAt: new Date('2026-05-01T10:00:00Z'),
      marks: Array.from({ length: 5 }, () => ({ mark: 0, maxMark: 1 })),
    });
    // …and the retake that fixed it. Only the second one counts, otherwise
    // the card's promise — revise this and watch it move — is a lie.
    await seedAttempt({
      attemptNo: 2,
      submittedAt: new Date('2026-05-08T10:00:00Z'),
      marks: Array.from({ length: 5 }, () => ({ mark: 1, maxMark: 1 })),
    });

    const result = await service.forUser(fixture.studentId);

    expect(result.weakest).toEqual([]);
    expect(result.strongest).toHaveLength(1);
    expect(result.strongest[0].accuracyPercent).toBe(100);
  });

  it('excludes an ungraded answer instead of scoring it zero', async () => {
    // An essay awaiting marking is not evidence of weakness.
    await seedAttempt({
      attemptNo: 1,
      submittedAt: new Date('2026-05-01T10:00:00Z'),
      state: 'pending_review',
      marks: [
        { mark: 1, maxMark: 1 },
        { mark: 1, maxMark: 1 },
        { mark: 1, maxMark: 1 },
        { mark: 1, maxMark: 1 },
        { mark: null, maxMark: 10 },
      ],
    });

    const result = await service.forUser(fixture.studentId);

    expect(result.strongest[0].accuracyPercent).toBe(100);
    expect(result.strongest[0].answered).toBe(4);
  });

  it('ignores an attempt still in progress', async () => {
    await seedAttempt({
      attemptNo: 1,
      submittedAt: new Date('2026-05-01T10:00:00Z'),
      state: 'in_progress',
      marks: Array.from({ length: 5 }, () => ({ mark: 0, maxMark: 1 })),
    });

    const result = await service.forUser(fixture.studentId);

    expect(result.evaluated).toBe(0);
    expect(result.pending).toBe(0);
  });

  it('resolves the lesson the topic was answered in', async () => {
    await seedAttempt({
      attemptNo: 1,
      submittedAt: new Date('2026-05-01T10:00:00Z'),
      marks: Array.from({ length: 5 }, () => ({ mark: 0, maxMark: 1 })),
    });

    const result = await service.forUser(fixture.studentId);

    expect(result.weakest[0].lessonId).toBe(fixture.lessonId);
    expect(result.weakest[0].courseSlug).not.toBeNull();
  });

  it('drops the lesson link when the lesson is unpublished', async () => {
    await seedAttempt({
      attemptNo: 1,
      submittedAt: new Date('2026-05-01T10:00:00Z'),
      marks: Array.from({ length: 5 }, () => ({ mark: 0, maxMark: 1 })),
    });
    await prisma.lesson.update({
      where: { id: fixture.lessonId },
      data: { isPublished: false },
    });

    const result = await service.forUser(fixture.studentId);

    // The row survives — the student IS weak at it. Only the button goes.
    expect(result.weakest).toHaveLength(1);
    expect(result.weakest[0].lessonId).toBeNull();
    expect(result.weakest[0].lessonTitle).toBeNull();
  });

  it('returns empty arrays for a student who has sat nothing', async () => {
    const result = await service.forUser(fixture.otherStudentId);

    expect(result).toEqual({ weakest: [], strongest: [], evaluated: 0, pending: 0 });
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm --filter @ayman/api exec jest src/modules/quiz/mastery.service.spec.ts`
Expected: FAIL — `Cannot find module './mastery.service'`.

> If it instead fails on `connect ECONNREFUSED`, Postgres is not running. Start it and re-run; do not "fix" the test.

- [ ] **Step 4: Write the service**

Create `apps/api/src/modules/quiz/mastery.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  MASTERY_MIN_EVIDENCE,
  MASTERY_REVIEW_BELOW,
  MASTERY_STRONG_AT,
  type MasteryTopic,
  type StudentMastery,
} from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/** One grouped row, straight out of Postgres. `snake_case` because it is the
 *  raw shape, not the contract. */
interface TopicRow {
  category_id: string;
  name: string;
  answered: number;
  accuracy_percent: number;
  lesson_id: string;
}

/**
 * «نقاط ضعفك» — how a student is scoring, per question topic.
 *
 * ## Why this file exists at all
 *
 * The join it walks has been fully populated since the quiz engine shipped and
 * nothing had ever traversed it: every question belongs to a
 * `QuestionCategory`, every answer carries its `mark` and `maxMark`, and the
 * path between them is three foreign keys. This is the first read that makes
 * that structure visible to the person it describes.
 *
 * ## Ownership
 *
 * `userId` is in the WHERE clause of the only attempt query here, and the
 * route that calls it takes no id parameter — the identity comes from the
 * session and nothing else. Same discipline `QuizHistoryService` and
 * `DashboardController` document, and the cheapest defence against IDOR:
 * there is nothing to tamper with.
 *
 * ## Why raw SQL
 *
 * Prisma's `groupBy` cannot express the "latest graded attempt per quiz"
 * window. Doing it in two round-trips means loading every attempt question the
 * student has ever answered into Node in order to group it there — for an
 * active student that is thousands of rows to produce six.
 */
@Injectable()
export class MasteryService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string): Promise<StudentMastery> {
    /*
     * `DISTINCT ON (quiz_id) … ORDER BY quiz_id, submitted_at DESC` is the
     * latest-sitting window (§2.3): one row per quiz, the most recent graded
     * one. A student who revised and retook is measured on the retake.
     *
     * The state list is `GRADED_STATES` from `analytics.service.ts`, inlined
     * here as literals only because `$queryRaw` cannot parameterise an IN-list
     * of a fixed enum — the import below is what keeps them honest.
     *
     * Accuracy is SUM(mark)/SUM(max_mark), NOT AVG(fraction): averaging
     * fractions gives a one-mark question the same weight as a ten-mark one in
     * the same topic, and the figure the student's grade is actually made of
     * is the share of MARKS they collected.
     */
    const rows = await this.prisma.$queryRaw<TopicRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON (a."quiz_id") a."id", a."quiz_id", a."submitted_at"
        FROM "app"."quiz_attempts" a
        WHERE a."user_id" = ${userId}
          AND a."state" IN ('submitted', 'pending_review')
        ORDER BY a."quiz_id", a."submitted_at" DESC
      ),
      scored AS (
        SELECT
          e."category_id",
          aq."mark",
          aq."max_mark",
          q."lesson_id",
          latest."submitted_at"
        FROM "app"."attempt_questions" aq
        JOIN latest                          ON latest."id" = aq."attempt_id"
        JOIN "app"."question_versions" v     ON v."id" = aq."question_version_id"
        JOIN "app"."question_bank_entries" e ON e."id" = v."bank_entry_id"
        JOIN "app"."quizzes" q               ON q."id" = latest."quiz_id"
        -- An ungraded answer is EXCLUDED, not counted as zero: an essay
        -- awaiting marking is not evidence of weakness.
        WHERE aq."mark" IS NOT NULL AND aq."max_mark" > 0
      )
      SELECT
        s."category_id",
        c."name",
        count(*)::int AS answered,
        round(sum(s."mark") / sum(s."max_mark") * 100)::int AS accuracy_percent,
        -- The lesson of this topic's most recent contributing sitting. Taken
        -- from the ATTEMPT rather than from the question bank, because a
        -- pool-drawn slot has no `bank_entry_id` and would vanish here.
        (array_agg(s."lesson_id" ORDER BY s."submitted_at" DESC))[1] AS lesson_id
      FROM scored s
      JOIN "app"."question_categories" c ON c."id" = s."category_id"
      GROUP BY s."category_id", c."name"
    `;

    const evaluatedRows = rows.filter((row) => row.answered >= MASTERY_MIN_EVIDENCE);
    const pending = rows.length - evaluatedRows.length;

    const weakRows = evaluatedRows
      .filter((row) => row.accuracy_percent < MASTERY_REVIEW_BELOW)
      .sort((a, b) => a.accuracy_percent - b.accuracy_percent)
      .slice(0, 3);

    const strongRows = evaluatedRows
      .filter((row) => row.accuracy_percent >= MASTERY_STRONG_AT)
      .sort((a, b) => b.accuracy_percent - a.accuracy_percent)
      .slice(0, 3);

    // Only the rows that actually reach the card need their lesson resolved —
    // at most six lookups, not one per topic the student has ever met.
    const lessons = await this.publishedLessons(
      [...weakRows, ...strongRows].map((row) => row.lesson_id),
    );

    return {
      weakest: weakRows.map((row) => toTopic(row, lessons)),
      strongest: strongRows.map((row) => toTopic(row, lessons)),
      evaluated: evaluatedRows.length,
      pending,
    };
  }

  /**
   * Titles and course slugs for the handful of lessons the card will link.
   *
   * `isPublished` is checked on BOTH the lesson and its course: a card that
   * offers a button to a 404 is worse than one that offers no button. Access
   * is deliberately NOT re-checked here — a student who answered questions in
   * this lesson was enrolled at the time, and the lesson route enforces
   * entitlement on arrival anyway. Re-deriving it would be a second source of
   * truth for the same question.
   */
  private async publishedLessons(
    ids: readonly string[],
  ): Promise<Map<string, { title: string; courseSlug: string }>> {
    if (ids.length === 0) return new Map();

    const lessons = await this.prisma.lesson.findMany({
      where: {
        id: { in: [...new Set(ids)] },
        isPublished: true,
        section: { course: { isPublished: true } },
      },
      select: { id: true, title: true, section: { select: { course: { select: { slug: true } } } } },
    });

    return new Map(
      lessons.map((lesson) => [
        lesson.id,
        { title: lesson.title, courseSlug: lesson.section.course.slug },
      ]),
    );
  }
}

function toTopic(
  row: TopicRow,
  lessons: Map<string, { title: string; courseSlug: string }>,
): MasteryTopic {
  const lesson = lessons.get(row.lesson_id);
  return {
    categoryId: row.category_id,
    name: row.name,
    answered: row.answered,
    accuracyPercent: row.accuracy_percent,
    lessonId: lesson ? row.lesson_id : null,
    lessonTitle: lesson?.title ?? null,
    courseSlug: lesson?.courseSlug ?? null,
  };
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter @ayman/api exec jest src/modules/quiz/mastery.service.spec.ts`
Expected: PASS, 8 tests.

> `Lesson.section.course.slug` and `Lesson.isPublished` are assumed here. If `typecheck` disagrees about the relation names, read the `Lesson` and `CourseSection` models in `apps/api/prisma/schema.prisma` and correct the `select` — do **not** loosen it to `any`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/quiz/mastery.service.ts \
        apps/api/src/modules/quiz/mastery.service.spec.ts \
        apps/api/src/modules/quiz/analytics.service.ts
git commit -m "feat(api): group a student's own marks by the topic they were earned in

One aggregate over a join that has been populated since the quiz engine
shipped and that nothing had ever walked: attempt_questions to
question_versions to bank entries to categories.

Three decisions the query encodes and the spec argues for. Accuracy is
SUM(mark)/SUM(max_mark) rather than AVG(fraction), because a ten-mark
question and a one-mark question in the same topic are not the same evidence.
Only the latest graded sitting of each quiz counts, so revising and retaking
moves the number instead of being averaged against the failure it replaced.
An ungraded essay is excluded rather than scored zero.

The lesson comes from the ATTEMPT, not the bank entry — a pool-drawn slot has
no bank_entry_id, so routing through the bank would silently drop every
randomly-drawn question."
```

---

### Task 3: The route

**Files:**
- Modify: `apps/api/src/modules/quiz/me-quizzes.controller.ts`
- Modify: `apps/api/src/modules/quiz/quiz.module.ts`
- Modify: `apps/api/src/test/authorization-matrix.int-spec.ts:469`

**Interfaces:**
- Consumes: `MasteryService.forUser` (Task 2).
- Produces: `GET /api/me/mastery` → `StudentMastery`, consumed by Task 4.

> `authorization-matrix.int-spec.ts` asserts it *accounts for every registered route*. A new route fails that assertion until it is named — this is the omission commit `4cf8499` had to correct for the video-duration probe. The rows go in the same commit as the route, never a follow-up.

- [ ] **Step 1: Write the failing test — the matrix rows**

In `apps/api/src/test/authorization-matrix.int-spec.ts`, directly after the `quiz history: student` row at line 469:

```ts
    // Mastery rides the same `quiz:read` permission and the same self-scoped
    // shape as the history above — it is the same attempts, grouped by the
    // topic their questions belong to. Its own rows regardless: the assertion
    // that this matrix accounts for every registered route only holds if a new
    // route is named, whatever it resembles.
    { label: 'mastery: anonymous', method: 'get', path: () => '/api/me/mastery', actor: 'anonymous', status: 401 },
    { label: 'mastery: student', method: 'get', path: () => '/api/me/mastery', actor: 'student', status: 200 },
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @ayman/api test:integration -- authorization-matrix`
Expected: FAIL — the two new rows 404, because the route does not exist yet.

- [ ] **Step 3: Add the route**

In `apps/api/src/modules/quiz/me-quizzes.controller.ts`: extend the imports, the constructor, and add the handler.

```ts
import type { StudentMastery, StudentQuizHistory } from '@ayman/contracts';
import { MasteryService } from './mastery.service';
```

```ts
export class MeQuizzesController {
  constructor(
    private readonly history: QuizHistoryService,
    private readonly mastery: MasteryService,
  ) {}

  // … the existing `quizzes()` handler is unchanged …

  /**
   * `GET /api/me/mastery` — the same finished work as `quizzes` above, grouped
   * by the topic each question belongs to instead of by the quiz it sat in.
   *
   * Here rather than on a controller of its own for exactly the reason this
   * file's header gives for `quizzes`: `quiz:read` is the permission, and a
   * route's home is decided by what guards it. Like its neighbour it is
   * deliberately NOT `@NoAnswerLeak()` — the shape names no question, no
   * option and no correct answer, only the caller's own marks in aggregate.
   */
  @RequirePermission('quiz:read')
  @Get('mastery')
  mastery_(@CurrentUser() user: AuthenticatedUser): Promise<StudentMastery> {
    return this.mastery.forUser(user.id);
  }
}
```

> The trailing underscore matches `DashboardController.path_` — the class already has a `mastery` property, and a method of the same name would shadow it.

- [ ] **Step 4: Register the provider**

In `apps/api/src/modules/quiz/quiz.module.ts`, add the import alongside the others and `MasteryService` to the `providers` array:

```ts
import { MasteryService } from './mastery.service';
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter @ayman/api test:integration -- authorization-matrix`
Expected: PASS — including `accounts for every registered route`.

- [ ] **Step 6: Verify the whole API suite**

Run: `pnpm --filter @ayman/api test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/quiz/me-quizzes.controller.ts \
        apps/api/src/modules/quiz/quiz.module.ts \
        apps/api/src/test/authorization-matrix.int-spec.ts
git commit -m "feat(api): GET /api/me/mastery

On MeQuizzesController because quiz:read is what guards it, which is the same
rule that file's header already sets out for the history route beside it. No
id parameter — the session is the identity.

The authorization matrix names it in this commit rather than a later one. Its
'accounts for every registered route' assertion is the whole point of the
file, and a route that lands without its rows turns a passing suite into a
lie about coverage."
```

---

### Task 4: The web read

**Files:**
- Create: `apps/web/lib/mastery.ts`

**Interfaces:**
- Consumes: `GET /api/me/mastery` (Task 3), `StudentMasterySchema` (Task 1).
- Produces: `getMasteryOrNull(): Promise<StudentMastery | null>`, consumed by Task 7.

> **The trap this task exists to avoid.** `lib/taxonomy.ts` is the file this most resembles and is the one pattern it must not copy. That file is `'use cache'` + `cacheLife('minutes')`, legal there because `/api/taxonomy` is unauthenticated and identical for every student. Mastery is neither, and `getMasteryOrNull` takes **no arguments** — so a `'use cache'` entry has nothing to key on and would serve the first student's weakest topics to every student who loaded the dashboard next. The correct precedent is `lib/dashboard.ts`.

- [ ] **Step 1: Write the file**

Create `apps/web/lib/mastery.ts`:

```ts
import { cache } from 'react';
import { StudentMasterySchema, type StudentMastery } from '@ayman/contracts';
import { apiGetAuthed } from './api-server';

/**
 * `GET /api/me/mastery`, shared across one render, and never fatal.
 *
 * ## Why `cache()` and NOT `'use cache'`
 *
 * This file looks like `lib/taxonomy.ts` and must not behave like it. That one
 * is `'use cache'` + `cacheLife('minutes')`, and its own header states the
 * condition that makes it legal: `/api/taxonomy` is unauthenticated and
 * identical for every student, so «a shared cache entry leaks nothing».
 *
 * Mastery is the opposite on both counts, and this function takes no
 * arguments — so a `'use cache'` entry would have nothing to key on and would
 * serve the FIRST student's weakest topics to every student who loaded the
 * dashboard after them. `cache()` is per-request, and `apiGetAuthed` leaves
 * its `fetch` on `no-store`, which is what `lib/dashboard.ts` relies on for
 * the same reason.
 *
 * ## Why it returns `null` instead of throwing
 *
 * The card is an enhancement to a screen that was complete without it, and the
 * dashboard has been taken down once already by exactly this class of failure:
 * an added read on the busiest authenticated path, answered 429 by the
 * throttler, thrown through `apiGet` into «This page couldn't load»
 * (`app/(app)/dashboard/page.tsx:81-94`). This read makes five parallel API
 * calls on one navigation against a `short` limit of 10 per second
 * (`app.module.ts:81`) — headroom, not comfort.
 *
 * The `try` is inside rather than at the call site so no future caller can
 * forget it. A `cache()`-wrapped function throws normally, so either would
 * work — unlike the `'use cache'` case, where only the inner form catches.
 *
 * Server Components / Server Actions only: `apiGetAuthed` reads `cookies()`.
 */
export const getMasteryOrNull = cache(async function getMasteryOrNull(): Promise<StudentMastery | null> {
  try {
    return await apiGetAuthed('/api/me/mastery', StudentMasterySchema);
  } catch {
    return null;
  }
});
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @ayman/web typecheck && pnpm --filter @ayman/web lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/mastery.ts
git commit -m "feat(web): read the mastery map, per request and never fatally

React cache() around apiGetAuthed, following lib/dashboard.ts — deliberately
NOT lib/taxonomy.ts, which this file otherwise resembles. That one is
'use cache' because /api/taxonomy is unauthed and identical for everyone;
this function takes no arguments and returns one student's own weaknesses, so
a shared entry would hand the first student's topics to the next.

Returns null on failure. The card is an enhancement to a page that was
complete without it, and this is the exact failure that already took the
dashboard down once — an added read on the busiest authed path, answered 429."
```

---

### Task 5: The card — illustration, styles, component

**Files:**
- Modify: `apps/web/components/dashboard/spot-illustration.tsx`
- Modify: `apps/web/app/study.css` (new block; and the `--ok`/`--err` comment at ~line 945)
- Create: `apps/web/components/dashboard/mastery-card.tsx`
- Create: `apps/web/components/dashboard/mastery-card.test.tsx`

**Interfaces:**
- Consumes: `StudentMastery`, `MasteryTopic`, `copy.dashboard.mastery` (Task 1).
- Produces: `<MasteryCard mastery={StudentMastery} />`, mounted by Task 7. `SpotName` gains `'topics'`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/dashboard/mastery-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { copy } from '@ayman/contracts';
import { describe, expect, it } from 'vitest';
import { MasteryCard } from './mastery-card';

const c = copy.dashboard.mastery;

const topic = {
  categoryId: '0198c3a2-0000-7000-8000-000000000001',
  name: 'الحلقات المتداخلة',
  answered: 6,
  accuracyPercent: 34,
  lessonId: '0198c3a2-0000-7000-8000-000000000002',
  lessonTitle: 'الحلقات',
  courseSlug: 'cs-y2',
};

describe('MasteryCard', () => {
  it('renders one row per weak topic with its own review link', () => {
    render(
      <MasteryCard
        mastery={{
          weakest: [topic, { ...topic, categoryId: 'b', name: 'المصفوفات', accuracyPercent: 68 }],
          strongest: [],
          evaluated: 5,
          pending: 0,
        }}
      />,
    );

    expect(screen.getByText('الحلقات المتداخلة')).toBeInTheDocument();
    expect(screen.getByText('المصفوفات')).toBeInTheDocument();
    // One button per row — never a single button at the bottom for three
    // different problems.
    expect(screen.getAllByRole('link', { name: new RegExp(c.reviewCta) })).toHaveLength(2);
  });

  it('renders a row with no button when its lesson could not be resolved', () => {
    render(
      <MasteryCard
        mastery={{
          weakest: [{ ...topic, lessonId: null, lessonTitle: null, courseSlug: null }],
          strongest: [],
          evaluated: 1,
          pending: 0,
        }}
      />,
    );

    expect(screen.getByText('الحلقات المتداخلة')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the first-run body when nothing has been measured', () => {
    render(
      <MasteryCard mastery={{ weakest: [], strongest: [], evaluated: 0, pending: 0 }} />,
    );

    expect(screen.getByText(c.emptyBody)).toBeInTheDocument();
  });

  it('congratulates rather than emptying when every topic is above the bar', () => {
    render(
      <MasteryCard
        mastery={{
          weakest: [],
          strongest: [{ ...topic, name: 'المتغيّرات', accuracyPercent: 96 }],
          evaluated: 4,
          pending: 0,
        }}
      />,
    );

    expect(screen.getByText(c.allClearBody)).toBeInTheDocument();
    expect(screen.getByText(/المتغيّرات/)).toBeInTheDocument();
    expect(screen.queryByText(c.emptyBody)).not.toBeInTheDocument();
  });

  it('names each row for a screen reader, since the bar is decorative', () => {
    render(
      <MasteryCard mastery={{ weakest: [topic], strongest: [], evaluated: 1, pending: 0 }} />,
    );

    expect(
      screen.getByText(
        c.accessibleRow.replace('{topic}', 'الحلقات المتداخلة').replace('{percent}', '34'),
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @ayman/web exec vitest run components/dashboard/mastery-card.test.tsx`
Expected: FAIL — `Failed to resolve import "./mastery-card"`.

- [ ] **Step 3: Add the `'topics'` illustration**

In `apps/web/components/dashboard/spot-illustration.tsx`, widen the union, add the branch, and add the drawing:

```tsx
export type SpotName = 'courses' | 'exams' | 'scores' | 'topics';
```

```tsx
      {name === 'courses' ? (
        <Courses />
      ) : name === 'exams' ? (
        <Exams />
      ) : name === 'topics' ? (
        <Topics />
      ) : (
        <Scores />
      )}
```

```tsx
/** A magnifier over a short list — "we have not measured you yet". Built from
 *  the same three token classes as its siblings so the four read as a set: the
 *  rows are structure, the lens is the one live element. */
function Topics() {
  return (
    <g>
      <rect x="26" y="24" width="46" height="42" rx="4" className="spot__solid" />
      <path d="M34 36 h26 M34 45 h20 M34 54 h23" className="spot__mark" />
      <circle cx="80" cy="44" r="16" className="spot__accent-fill" />
      <circle cx="80" cy="44" r="9" className="spot__line" />
      <path d="M91 55 l8 8" className="spot__accent-glyph" />
    </g>
  );
}
```

- [ ] **Step 4: Correct the colour rule in `study.css`**

Find the `## Colour` paragraph in the exam-screen header (around line 944) and replace the sentence that claims exclusivity:

```
   ## Colour

   `--ok` and `--err` may colour a GRADED OUTCOME and nothing else. That is
   the rule; the list of places it licenses is the exam screen below,
   `.verdict--pass` / `.verdict--fail`, and `.topic-row__fill` on the
   dashboard's mastery card.

   This paragraph used to say the two tokens appear "here and NOWHERE else in
   the study surface". That was already untrue when it was written:
   `.verdict--fail` is built from `--err` and `ExamsSection` renders one on the
   dashboard for every failed exam. A rule whose stated scope contradicts the
   code is a rule nobody can apply — either it gets cited as licence for
   anything, or it gets believed and used to reject a case the codebase had
   already blessed.

   What has NOT changed: ember is still structure, amber is still the only
   thing you press, and `--warn` is still unused on the study surface. In dark
   mode `--warn` is oklch(0.75 0.14 85) against the accent's
   oklch(0.780 0.150 74) — the same colour to the eye, so anything drawn in it
   reads as a second "press me".
```

- [ ] **Step 5: Add the card's styles**

Append to `apps/web/app/study.css`, after the `.verdict--fail` block:

```css
/* ---------------------------------------------------------------------------
   .topic-row — one weak topic on the dashboard's mastery card.

   Deliberately built on `.attempt-row`'s proportions rather than as a new
   shape: it sits four sections above an `.attempt-row` list on the same page,
   both are "a thing you did, a figure, and a button", and two near-identical
   rows drawn differently is how a page starts to look assembled from parts.

   The bar is the one thing the exam rows do not have, because an exam has a
   verdict and a topic has a degree.
   --------------------------------------------------------------------------- */

.topic-row {
  display: flex;
  align-items: center;
  gap: var(--s-12);
  padding: var(--s-12);
  border-radius: var(--r-md);
  background: var(--n-1);
  box-shadow: inset 0 0 0 var(--hairline) var(--border);
}

.topic-row__text {
  display: flex;
  min-inline-size: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.375rem;
}

.topic-row__title {
  overflow: hidden;
  font-size: var(--fs-text-sm);
  font-weight: var(--fw-medium);
  color: var(--n-12);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The track, and the marks that were not collected drawn over it. `--err`
   here means precisely what it means on `.verdict--fail` further down the
   page: marks the student did not get. */
.topic-row__bar {
  display: block;
  block-size: 6px;
  overflow: hidden;
  border-radius: var(--r-xs);
  background: var(--n-4);
}

.topic-row__fill {
  display: block;
  block-size: 100%;
  border-radius: var(--r-xs);
  background: var(--err);
}

.topic-row__value {
  flex-shrink: 0;
  font-size: var(--fs-text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--n-11);
}

/* The mastered topics, one line. Deliberately the smallest thing on the card:
   it is there so the block is not purely an indictment, not to compete with
   the three rows that carry the instruction. */
.topic-strong {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-8);
  margin-block-start: var(--s-12);
  font-size: var(--fs-text-sm);
  color: var(--n-11);
}

.topic-strong__item {
  color: var(--ok);
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Write the component**

Create `apps/web/components/dashboard/mastery-card.tsx`:

```tsx
import Link from 'next/link';
import { copy, formatCopy, type MasteryTopic, type StudentMastery } from '@ayman/contracts';
import { SpotIllustration } from './spot-illustration';

const c = copy.dashboard.mastery;

/**
 * «ذاكر ده» — the three topics whose marks the student is losing most of, and
 * a way into the lesson that taught each.
 *
 * ## Why this is the only block on the page that is red
 *
 * Everything else on the dashboard describes volume — courses, lessons,
 * averages. This is the only one that names a *cause*, and the only one whose
 * rows a student can act on individually. `--err` is licensed here on the
 * same terms `.verdict--fail` holds it three sections below: it is a graded
 * outcome, and specifically the share of marks that were not collected.
 *
 * ## Why the button is quiet
 *
 * Three of them on one card, and the resume card directly above owns the
 * screen's single accent-filled button. Three amber buttons here would make
 * four primary actions on one screen, which is the exact failure the
 * dashboard rebuild exists to have removed.
 *
 * ## Why an all-clear state exists separately from the empty one
 *
 * "We have not measured you yet" and "we measured you and you are fine" are
 * different facts, and collapsing them means a student who has mastered
 * everything gets told the platform knows nothing about them.
 */
export function MasteryCard({ mastery }: { mastery: StudentMastery }) {
  const hasWeak = mastery.weakest.length > 0;
  const measured = mastery.evaluated > 0;

  return (
    <section>
      <div className="group-head">
        <span className="group-head__mark" aria-hidden="true" />
        <h2 className="group-head__title">{c.title}</h2>
        {measured ? (
          <span className="group-head__count">
            {formatCopy(c.evaluatedCount, { n: mastery.evaluated })}
          </span>
        ) : null}
      </div>

      {hasWeak ? (
        <>
          <ul className="space-y-2">
            {mastery.weakest.map((topic) => (
              <li key={topic.categoryId}>
                <TopicRow topic={topic} />
              </li>
            ))}
          </ul>
          {mastery.pending > 0 ? (
            <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">
              {formatCopy(c.pendingNote, { n: mastery.pending })}
            </p>
          ) : null}
          <StrongLine topics={mastery.strongest} />
        </>
      ) : (
        <div className="empty">
          <SpotIllustration name="topics" />
          <p className="empty__body">{measured ? c.allClearBody : c.emptyBody}</p>
          <StrongLine topics={mastery.strongest} />
        </div>
      )}
    </section>
  );
}

function TopicRow({ topic }: { topic: MasteryTopic }) {
  return (
    <div className="topic-row">
      <span className="topic-row__text">
        <span className="topic-row__title">{topic.name}</span>
        {/*
          `aria-hidden`: the row's own accessible line below states the topic
          and the figure in words. A `progressbar` role here would announce the
          same number a second time — the call `StatTile` documents at its
          meter, made the same way.
        */}
        <span className="topic-row__bar" aria-hidden="true">
          <span
            className="topic-row__fill"
            style={{ inlineSize: `${Math.min(Math.max(topic.accuracyPercent, 0), 100)}%` }}
          />
        </span>
      </span>

      <span className="topic-row__value" aria-hidden="true">
        {topic.accuracyPercent}%
      </span>

      {/* The one piece of text that carries the whole row to a screen reader. */}
      <span className="sr-only">
        {formatCopy(c.accessibleRow, {
          topic: topic.name,
          percent: topic.accuracyPercent,
        })}
      </span>

      {topic.courseSlug && topic.lessonId ? (
        <Link
          href={`/courses/${topic.courseSlug}/lessons/${topic.lessonId}`}
          className="chip chip--quiet flex-shrink-0"
        >
          {c.reviewCta}
        </Link>
      ) : null}
    </div>
  );
}

/** The mastered topics. Renders nothing at all when there are none — an
 *  empty «متمكّن في:» label is worse than no label. */
function StrongLine({ topics }: { topics: readonly MasteryTopic[] }) {
  if (topics.length === 0) return null;

  return (
    <p className="topic-strong">
      <span>{c.strongLabel}</span>
      {topics.map((topic) => (
        <span key={topic.categoryId} className="topic-strong__item">
          {topic.name} {topic.accuracyPercent}%
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `pnpm --filter @ayman/web exec vitest run components/dashboard/mastery-card.test.tsx`
Expected: PASS, 5 tests.

> The lesson href is written as `/courses/${courseSlug}/lessons/${lessonId}`. **Confirm this against the real player route** before moving on: `ls "apps/web/app/(app)/courses/[slug]"`. If the segment differs, fix the component — do not adjust the test to match a wrong URL.

- [ ] **Step 8: Lint and typecheck**

Run: `pnpm --filter @ayman/web lint && pnpm --filter @ayman/web typecheck`
Expected: PASS. The RTL rule is the one most likely to bite — the card uses `inlineSize`, `flex-shrink-0` and logical CSS properties only.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/dashboard/mastery-card.tsx \
        apps/web/components/dashboard/mastery-card.test.tsx \
        apps/web/components/dashboard/spot-illustration.tsx \
        apps/web/app/study.css
git commit -m "feat(web): the card that says which topic is costing the marks

Three rows, each with its own button to the lesson that taught it — never one
button at the bottom for three different problems. The buttons are quiet
because the resume card above owns the screen's single accent-filled action.

Two empty states, not one: 'we have not measured you yet' and 'we measured
you and you are fine' are different facts, and a student who has mastered
everything should not be told the platform knows nothing about them.

Also corrects study.css's colour paragraph, which claimed --ok and --err
appear on the exam screen and nowhere else. .verdict--fail is built from
--err and ExamsSection renders one on the dashboard — the sentence was
already untrue, and a rule whose stated scope contradicts the code is one
nobody can apply."
```

---

### Task 6: The hero carries the figures

**Files:**
- Modify: `apps/web/components/dashboard/dashboard-hero.tsx`
- Modify: `apps/web/app/study.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: `<DashboardHero>` gains three required props — `courseCount: number`, `completedLessons: number`, `averageScore: number | null` — supplied by Task 7.

- [ ] **Step 1: Add the styles**

Append to `apps/web/app/study.css`, immediately after the existing `.dash-hero__fact` rules:

```css
/* The second fact row. `.dash-hero__facts` above it is WHO YOU ARE — year,
   track, school. This is HOW MUCH YOU HAVE DONE, and the two are kept apart
   because a school name and a lesson count are not the same kind of claim.

   No wells, no meters and no icons: these were four `.tile`s a moment ago,
   and re-drawing four shapes on the band would move the clutter rather than
   remove it. The band stays a band — nothing on it is pressable. */
.dash-hero__stats {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-12);
  margin-block-start: var(--s-12);
}

.dash-hero__stat {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  font-size: var(--fs-text-sm);
  color: var(--stage-fg-2);
}

/* Separators drawn between items rather than after each, so the row never
   ends on a hanging rule. */
.dash-hero__stat + .dash-hero__stat {
  padding-inline-start: var(--s-12);
  border-inline-start: var(--hairline) solid rgb(255 255 255 / 0.16);
}

.dash-hero__stat-value {
  font-size: var(--fs-text-base);
  font-weight: var(--fw-medium);
  font-variant-numeric: tabular-nums;
  color: var(--ink-fg);
}
```

- [ ] **Step 2: Extend the component**

In `apps/web/components/dashboard/dashboard-hero.tsx`, add the three props and render the row directly after the closing `</div>` of `.dash-hero__facts` (still inside `.dash-hero__text`):

```tsx
  courseCount,
  completedLessons,
  averageScore,
}: {
  // … the existing props are unchanged …
  courseCount: number;
  completedLessons: number;
  /** `null` until the student has been graded at all. */
  averageScore: number | null;
}) {
```

```tsx
          {/*
            The three figures that used to be `.tile`s under the band.

            The fourth — «إجمالي تقدّمك» — is NOT here, and is not anywhere
            else either: it was `overallPercent`, which is the number the ring
            at the inline end of this very band draws and labels. One figure
            printed twice, six inches apart, was a third of what made this
            screen read as cluttered.
          */}
          <div className="dash-hero__stats">
            <span className="dash-hero__stat">
              <span className="dash-hero__stat-value">{courseCount}</span>
              <span>{c.statCourses}</span>
            </span>
            <span className="dash-hero__stat">
              <span className="dash-hero__stat-value">{completedLessons}</span>
              <span>{c.statLessonsDone}</span>
            </span>
            <span className="dash-hero__stat">
              <span className="dash-hero__stat-value">
                {averageScore === null ? c.statNoScores : `${averageScore}%`}
              </span>
              <span>{c.statAverage}</span>
            </span>
          </div>
```

> The row sits **outside** the `yearLabel || trackLabel || schoolName` conditional. Identity chips are optional because a profile can legitimately lack a school; these three are always true — zero courses is a fact, not a missing value.

- [ ] **Step 3: Verify it compiles and the callers are flagged**

Run: `pnpm --filter @ayman/web typecheck`
Expected: **FAIL**, once, at `app/(app)/dashboard/page.tsx` — `courseCount` is missing. That failure is the point: it proves the page cannot ship without supplying them. Task 7 fixes it.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/dashboard/dashboard-hero.tsx apps/web/app/study.css
git commit -m "feat(web): the band carries the three figures worth keeping

Courses, lessons done and average score move onto the hero as a second fact
row. The row above is who you are; this one is how much you have done, kept
apart because a school name and a lesson count are not the same kind of claim.

The fourth figure is gone entirely rather than moved. 'إجمالي تقدّمك' was
overallPercent, which the ring at the other end of this same band already
draws and labels — one number printed twice on one screen.

No wells, no meters, no icons. These were four tiles a moment ago and
redrawing four shapes on the band would relocate the clutter, not remove it.

typecheck now fails on the dashboard page until it supplies the three props,
which is deliberate."
```

---

### Task 7: The page

**Files:**
- Modify: `apps/web/app/(app)/dashboard/page.tsx`
- Modify: `apps/web/app/(app)/dashboard/loading.tsx`

**Interfaces:**
- Consumes: `getMasteryOrNull` (Task 4), `<MasteryCard>` (Task 5), the widened `<DashboardHero>` (Task 6).
- Produces: the finished screen.

- [ ] **Step 1: Read the two summary maps into the hero**

In `apps/web/app/(app)/dashboard/page.tsx`, add the mastery read to the existing `Promise.all` — a sixth entry, issued in parallel, never awaited in sequence:

```tsx
  const [dashboard, me, quizzes, taxonomy, session, mastery] = await Promise.all([
    getDashboard(),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
    apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema),
    getTaxonomyOrNull(),
    getSession(),
    /*
     * CACHED per-request and allowed to fail — see `lib/mastery.ts` for both,
     * and in particular for why it is `cache()` rather than the `'use cache'`
     * the taxonomy read above uses. This makes six parallel calls against a
     * `short` throttle of 10/second; the card is the one that degrades.
     */
    getMasteryOrNull(),
  ]);
```

Add the imports:

```tsx
import { getMasteryOrNull } from '@/lib/mastery';
import { MasteryCard } from '@/components/dashboard/mastery-card';
```

- [ ] **Step 2: Feed the hero and delete the tile row**

Extend the `<DashboardHero>` call:

```tsx
        overallPercent={overallPercent}
        courseCount={dashboard.enrolledCourses.length}
        completedLessons={completedLessons}
        averageScore={averageScore}
      />
```

Then **delete the entire `<section className="mb-8 grid grid-cols-2 …">` block** containing the four `<StatTile>` elements, together with its comment block, and remove the now-unused imports:

```tsx
// delete this import line entirely:
import { StatTile } from '@/components/dashboard/stat-tile';
// and from the lucide import, drop the four icons the tiles used:
import { BookOpen, GaugeCircle, Layers, Target } from 'lucide-react';
```

> `StatTile` itself is **not** deleted. `/results`, `/profile` and `/quizzes/[lessonId]` all use it. That those three and the dashboard opened with an identical four-tile row is part of what this change fixes: after it, the home screen no longer looks like the three report screens.

- [ ] **Step 3: Mount the card and reorder**

In the place the tile row occupied — directly after the resume / first-run block — insert:

```tsx
      {/*
        «ذاكر ده» — the page's answer to "what should I work on", and the only
        block that names a cause rather than a quantity.

        `null` when the read failed, and the card is simply absent then: this
        is an enhancement to a screen that was complete without it, and the
        page has been taken down once already by an added read throwing.
      */}
      {mastery ? (
        <section className="mb-8">
          <MasteryCard mastery={mastery} />
        </section>
      ) : null}
```

Then move the `<div className="mb-8"><Achievements … /></div>` block from above «كورساتي» to **after** the `<ExamsSection>` block at the bottom of the page, and replace its comment with:

```tsx
      {/*
        «إنجازاتك», last — and this is a reversal of where it used to sit.

        It was above «كورساتي» on the argument that everything below it
        described work outstanding, so a student should meet what they had
        already done first. That was right for a page with no other positive
        block on it. The mastery card's «متمكّن في» line and its all-clear
        state now carry that at the TOP of the page, and a rewards strip
        between "fix this" and "your courses" interrupts the only run of the
        page that is about acting.

        The page now reads: what to do now → what to fix → your work → your
        marks → what you have earned.
      */}
```

- [ ] **Step 4: Match the loading skeleton to the new order**

`apps/web/app/(app)/dashboard/loading.tsx` mirrors the page's blocks. Remove the four-tile skeleton row, add a skeleton for the mastery card in its place (a heading bar plus three rows), and move the badge-strip skeleton to the end. A skeleton whose shape does not match what replaces it produces a visible jump on every load.

- [ ] **Step 5: Typecheck, lint, test**

Run: `pnpm --filter @ayman/web typecheck && pnpm --filter @ayman/web lint && pnpm --filter @ayman/web test`
Expected: PASS — including the `typecheck` failure Task 6 deliberately left behind, now resolved.

- [ ] **Step 6: See it in the browser**

Run: `pnpm dev`, sign in as the seeded design fixture student, open `http://localhost:3200/dashboard`.

Confirm, in this order:

1. The band shows the portrait, greeting, identity chips, **the three figures**, and the ring.
2. There is **no** four-tile row.
3. The percentage in the ring appears exactly once on the screen.
4. The mastery card sits directly under the resume card, with a red bar per row and a «راجع» button per row.
5. Pressing «راجع» opens the lesson — not a 404.
6. `إنجازاتك` is the last block on the page.
7. Toggle to light mode: the red bars and the `متمكّن في` chips are both legible.
8. Narrow to 360px: the band's stats row wraps rather than overflowing, and no horizontal scrollbar appears.

- [ ] **Step 7: Run the accessibility sweep**

Run: `pnpm --filter @ayman/web test:e2e -- a11y`
Expected: PASS. `/dashboard` is already in the sweep list, so the card is covered without editing it — any `serious` or `critical` violation fails the run.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(app)/dashboard/page.tsx" "apps/web/app/(app)/dashboard/loading.tsx"
git commit -m "feat(web): the dashboard says what to study, not how you are doing three times

Six sections become five. The four stat tiles are gone — three of the figures
moved onto the band and the fourth was deleted, because it was the same
overallPercent the ring beside it already draws.

The mastery card takes the freed row, directly under the one primary action.
It is the first thing on this page that answers 'what should I work on' with
something more specific than 'the video you paused'.

إنجازاتك moves last, reversing where the rebuild put it. That order was right
for a page whose every other block described outstanding work; the mastery
card now carries the positive note at the top, and a rewards strip between
'fix this' and 'your courses' interrupts the run that is about acting.

The read is the sixth in the page's Promise.all and the only one allowed to
fail silently — the card is an enhancement, and an added read on this path is
exactly what took the page down once before."
```

---

## Self-Review

**Spec coverage:**

| spec | task |
|---|---|
| §2.1 no migration | Global Constraints; no task touches `schema.prisma` |
| §2.2 derived, never stored | Task 1 (schema doc), Task 2 (no write path) |
| §2.3 latest graded sitting | Task 2 step 1 (`GRADED_STATES` export), step 2 test 3, step 4 SQL |
| §2.4 evidence floor | Task 1 constant, Task 2 test 2 |
| §2.5 70% review bar | Task 1 constant, Task 2 filter |
| §2.6 two colours, no `--warn` | Task 5 CSS + Global Constraints |
| §2.7 colour-rule correction | Task 5 step 4 |
| §2.8 leaf category | Task 2 SQL groups by `category_id`, no parent join |
| §2.9 lesson from the attempt | Task 2 step 4 `array_agg`; test 6 |
| §2.10 empty state with illustration | Task 5 steps 3, 6; test 3 |
| §3 endpoint shape | Task 1 |
| §4 query + mark weighting | Task 2 test 1 |
| §4 caching, `cache()` not `'use cache'` | Task 4 |
| §5.1 tiles onto the band | Tasks 6, 7 |
| §5.2 the card, four states | Task 5 |
| §5.3 page order | Task 7 step 3 |
| §6 copy in contracts | Task 1 step 6 |
| §7 accessibility | Task 5 (`sr-only` row, `aria-hidden` bar); Task 7 step 7 |
| §8 testing | Tasks 1, 2, 3, 5 |

**Deviations from the spec, and why:**

- The spec's §8 lists an authz row as «200 student with no attempts». That case is a *service* concern, not an authorization one, so it is Task 2's last test (`returns empty arrays for a student who has sat nothing`) rather than a third matrix row. The matrix keeps the two rows its neighbours have.
- The spec described a separate «congratulation pose» for the illustration. One `'topics'` drawing serves both states; the two are distinguished by their copy, which is what actually differs. A second SVG for the same shape is weight for no information.

**Verified against the codebase while writing this plan** — these are facts, not assumptions:

- `apps/web/app/(app)/courses/[slug]/lessons/[lessonId]` exists, so the href in Task 5 step 6 is the real route.
- `Lesson.title`, `Lesson.isPublished` and `Lesson → section → course → slug` all exist as Task 2 step 4 uses them (`schema.prisma:614`, `:584`).
- `formatCopy(template, vars)` takes `Record<string, string | number>` — the `{n}`, `{topic}` and `{percent}` calls are correctly shaped (`packages/contracts/src/format.ts:11`).
- `--ink-fg` is a real token (`packages/ui/src/tokens/color.css:141`), and `sr-only` is in use across the app, so neither needs defining.
- `StatTile` has three consumers besides the dashboard — `/results`, `/profile`, `/quizzes/[lessonId]` — so Task 7 removes a usage, never the component.

**The two notes left in the tasks are guardrails, not open questions.** Task 2 step 5 and Task 5 step 7 tell the implementer what to do *if* typecheck or the route disagrees; both are expected to pass as written.
