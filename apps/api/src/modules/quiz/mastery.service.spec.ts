import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
// Same subpath the service uses, not the root barrel — a spec that imported it
// differently would be testing a resolution path the application never takes.
import { MASTERY_MIN_EVIDENCE } from '@ayman/contracts/quiz/mastery';
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
    // Six questions so a topic can clear MASTERY_MIN_EVIDENCE (4) with room to
    // spare, and so a half-right result is not also a boundary case.
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
   * from a real one for its purposes — the same shortcut, for the same reason,
   * that `analytics.service.spec.ts` documents.
   *
   * `marks` is one entry per question: the mark awarded and the mark
   * available. A `null` mark means "not graded yet".
   */
  async function seedAttempt(args: {
    attemptNo: number;
    submittedAt: Date;
    state?: 'submitted' | 'pending_review' | 'in_progress';
    marks: { mark: number | null; maxMark: number }[];
  }): Promise<void> {
    const attemptId = randomUUID();
    attemptIds.push(attemptId);

    // B7: `sumMarks`/`gradeOutOf`/`passPercent` are snapshotted onto the
    // attempt at start(), so a direct `create()` bypassing that flow has to
    // supply them. Read off the quiz this attempt belongs to — the same thing
    // `analytics.service.spec.ts` does, and for the same reason.
    const quiz = await prisma.quiz.findUniqueOrThrow({
      where: { id: fixture.quizId },
      select: { sumMarks: true, gradeOutOf: true, passPercent: true },
    });

    await prisma.quizAttempt.create({
      data: {
        id: attemptId,
        quizId: fixture.quizId,
        userId: fixture.studentId,
        attemptNo: args.attemptNo,
        paper: 'original',
        state: args.state ?? 'submitted',
        submittedAt: args.state === 'in_progress' ? null : args.submittedAt,
        startedAt: args.submittedAt,
        sumMarks: quiz.sumMarks,
        gradeOutOf: quiz.gradeOutOf,
        passPercent: quiz.passPercent,
      },
    });

    await prisma.attemptQuestion.createMany({
      data: args.marks.map((entry, index) => ({
        attemptId,
        slotPosition: index + 1,
        questionVersionId: fixture.versionIds[index]!,
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
    expect(result.weakest[0]!.categoryId).toBe(fixture.categoryId);
    expect(result.weakest[0]!.accuracyPercent).toBe(29);
    expect(result.weakest[0]!.answered).toBe(5);
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
    // …and the retake that fixed it. Only the second one counts, otherwise the
    // card's promise — revise this and watch it move — is a lie.
    await seedAttempt({
      attemptNo: 2,
      submittedAt: new Date('2026-05-08T10:00:00Z'),
      marks: Array.from({ length: 5 }, () => ({ mark: 1, maxMark: 1 })),
    });

    const result = await service.forUser(fixture.studentId);

    expect(result.weakest).toEqual([]);
    expect(result.strongest).toHaveLength(1);
    expect(result.strongest[0]!.accuracyPercent).toBe(100);
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

    expect(result.strongest).toHaveLength(1);
    expect(result.strongest[0]!.accuracyPercent).toBe(100);
    expect(result.strongest[0]!.answered).toBe(4);
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

    expect(result.weakest[0]!.lessonId).toBe(fixture.lessonId);
    expect(result.weakest[0]!.courseSlug).not.toBeNull();
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
    expect(result.weakest[0]!.lessonId).toBeNull();
    expect(result.weakest[0]!.lessonTitle).toBeNull();
  });

  it('returns empty arrays for a student who has sat nothing', async () => {
    const result = await service.forUser(fixture.otherStudentId);

    expect(result).toEqual({ weakest: [], strongest: [], evaluated: 0, pending: 0 });
  });
});
