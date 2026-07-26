import 'dotenv/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { QuizAccessService } from './quiz-access.service';
import { QuestionBankService } from './question-bank.service';
import { collectKeysDeep, FORBIDDEN_ANSWER_KEYS } from './serializers/learner.serializer';
import { seedQuizFixture, type QuizFixture, type QuizFixtureOverrides } from './testing/quiz-fixtures';

describe('AttemptService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const access = new QuizAccessService(prisma);
  const events = new AttemptEventsService();
  const service = new AttemptService(prisma, access, events);
  const bank = new QuestionBankService(prisma);

  const fixtures: QuizFixture[] = [];

  async function fixture(overrides: QuizFixtureOverrides = {}): Promise<QuizFixture> {
    const created = await seedQuizFixture(prisma, overrides);
    fixtures.push(created);
    return created;
  }

  /** Fabricates an already-submitted attempt without going through grading —
   *  Task 10 only needs "an attempt exists and is submitted" for the attempt
   *  limit / cooldown tests; grading correctness is Task 12's own describe
   *  block below. */
  async function submitAttempt(
    userId: string,
    quizId: string,
    submittedAt: Date = new Date(),
  ): Promise<{ id: string }> {
    const started = await service.start(userId, quizId);
    return prisma.quizAttempt.update({
      where: { id: started.attemptId },
      data: { submittedAt, state: 'submitted' },
      select: { id: true },
    });
  }

  function editedQuestion(categoryId: string): QuestionInput {
    return {
      type: 'mcq_single',
      categoryId,
      stemHtml: '<p>سؤال معدّل</p>',
      defaultMark: 1,
      settings: { shuffleOptions: true, caseSensitive: false },
      options: [
        { bodyHtml: '<p>أ (الصحيحة)</p>', fraction: 1 },
        { bodyHtml: '<p>ب</p>', fraction: 0 },
        { bodyHtml: '<p>ج</p>', fraction: 0 },
        { bodyHtml: '<p>د</p>', fraction: 0 },
      ],
    } as QuestionInput;
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    while (fixtures.length > 0) {
      await fixtures.pop()!.cleanup();
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('AttemptService.start', () => {
    it('creates attempt 1 with one attempt_question per slot', async () => {
      const created = await fixture({ questionCount: 5 });
      const started = await service.start(created.studentId, created.quizId);
      expect(started.questions).toHaveLength(5);
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
      expect(attempt!.attemptNo).toBe(1);
      expect(attempt!.state).toBe('in_progress');
    });

    // Q2 — THE VERSION SNAPSHOT.
    it('snapshots the question version, so publishing a new version does not rewrite history', async () => {
      const created = await fixture({ questionCount: 1 });
      const started = await service.start(created.studentId, created.quizId);
      const before = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId },
      });

      // The instructor edits and republishes the question.
      const v2 = await bank.saveDraft(
        created.bankEntryIds[0]!,
        editedQuestion(created.categoryId),
        created.adminId,
      );
      await bank.publish(v2.versionId);

      const after = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId },
      });
      expect(after!.questionVersionId).toBe(before!.questionVersionId);
      expect(after!.questionVersionId).not.toBe(v2.versionId);

      // And a NEW attempt picks up the new version.
      const second = await service.start(created.otherStudentId, created.quizId);
      const secondQuestion = await prisma.attemptQuestion.findFirst({
        where: { attemptId: second.attemptId },
      });
      expect(secondQuestion!.questionVersionId).toBe(v2.versionId);
    });

    // Q2 — THE ORDER SNAPSHOT.
    it('snapshots the option order and replays it byte-for-byte on resume', async () => {
      const created = await fixture({ questionCount: 1, shuffleOptions: true });
      const started = await service.start(created.studentId, created.quizId);
      const firstOrder = started.questions[0]!.options.map((option) => option.id);

      for (let i = 0; i < 5; i += 1) {
        const resumed = await service.resume(created.studentId, started.attemptId);
        expect(resumed.questions[0]!.options.map((option) => option.id)).toEqual(firstOrder);
      }
    });

    it('actually shuffles when shuffleOptions is on', async () => {
      // Twenty independent attempt CREATIONS (each against its own fixture,
      // since the option order is a fresh shuffle per attempt) — a
      // single-attempt assertion would pass 1 time in 24 by luck, so this
      // asserts at least two distinct orders appear across the run.
      const orders = new Set<string>();
      for (let i = 0; i < 20; i += 1) {
        const f = await fixture({ questionCount: 1, shuffleOptions: true });
        const started = await service.start(f.studentId, f.quizId);
        orders.add(started.questions[0]!.options.map((option) => option.id).join(','));
      }
      expect(orders.size).toBeGreaterThan(1);
    });

    it('keeps authoring order when shuffleOptions is off', async () => {
      const created = await fixture({ questionCount: 1, shuffleOptions: false });
      const started = await service.start(created.studentId, created.quizId);
      const stored = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId },
      });
      expect(stored!.optionOrder).toEqual([0, 1, 2, 3]);
    });

    // Q3 — THE PERSISTED DEADLINE.
    it('persists deadlineAt at start', async () => {
      const created = await fixture({ durationSeconds: 600 });
      const started = await service.start(created.studentId, created.quizId);
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
      expect(attempt!.deadlineAt).toBeInstanceOf(Date);
      const delta = attempt!.deadlineAt!.getTime() - attempt!.startedAt.getTime();
      expect(delta).toBeGreaterThanOrEqual(600_000 - 1000);
      expect(delta).toBeLessThanOrEqual(600_000 + 1000);
    });

    it('does NOT recompute deadlineAt when the instructor changes the time limit mid-attempt', async () => {
      const created = await fixture({ durationSeconds: 600 });
      const started = await service.start(created.studentId, created.quizId);
      const before = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!
        .deadlineAt;

      await prisma.quiz.update({ where: { id: created.quizId }, data: { durationSeconds: 60 } });
      const resumed = await service.resume(created.studentId, started.attemptId);

      const after = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!
        .deadlineAt;
      expect(after!.getTime()).toBe(before!.getTime());
      expect(new Date(resumed.deadlineAt!).getTime()).toBe(before!.getTime());
    });

    it('clamps the deadline to openUntil when the window closes first', async () => {
      const openUntil = new Date(Date.now() + 60_000);
      const created = await fixture({ durationSeconds: 3600, openUntil });
      const started = await service.start(created.studentId, created.quizId);
      expect(new Date(started.deadlineAt!).getTime()).toBe(openUntil.getTime());
    });

    it('leaves deadlineAt null for an untimed quiz', async () => {
      const created = await fixture({ durationSeconds: null });
      const started = await service.start(created.studentId, created.quizId);
      expect(started.deadlineAt).toBeNull();
    });

    it('returns the SAME in-progress attempt instead of starting a second one', async () => {
      const created = await fixture({});
      const first = await service.start(created.studentId, created.quizId);
      const second = await service.start(created.studentId, created.quizId);
      expect(second.attemptId).toBe(first.attemptId);
      expect(await prisma.quizAttempt.count({ where: { quizId: created.quizId } })).toBe(1);
    });

    it('survives two concurrent start requests without creating two attempts', async () => {
      const created = await fixture({});
      const [a, b] = await Promise.all([
        service.start(created.studentId, created.quizId),
        service.start(created.studentId, created.quizId),
      ]);
      expect(a.attemptId).toBe(b.attemptId);
      expect(await prisma.quizAttempt.count({ where: { quizId: created.quizId } })).toBe(1);
    });

    it('enforces the attempt limit', async () => {
      const created = await fixture({ maxAttempts: 2, retryCooldownHours: 0 });
      await submitAttempt(created.studentId, created.quizId);
      await submitAttempt(created.studentId, created.quizId);
      await expect(service.start(created.studentId, created.quizId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('treats maxAttempts 0 as unlimited', async () => {
      const created = await fixture({ maxAttempts: 0, retryCooldownHours: 0 });
      for (let i = 0; i < 4; i += 1) await submitAttempt(created.studentId, created.quizId);
      await expect(service.start(created.studentId, created.quizId)).resolves.toBeDefined();
    });

    it('adds granted extra attempts to the allowance', async () => {
      const created = await fixture({ maxAttempts: 1, retryCooldownHours: 0 });
      const attempt = await submitAttempt(created.studentId, created.quizId);
      await expect(service.start(created.studentId, created.quizId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await prisma.quizAttempt.update({ where: { id: attempt.id }, data: { extraAttempts: 1 } });
      await expect(service.start(created.studentId, created.quizId)).resolves.toBeDefined();
    });

    it('enforces the 24h retry cooldown and reports when it lifts', async () => {
      const created = await fixture({ retryCooldownHours: 24 });
      const attempt = await submitAttempt(created.studentId, created.quizId);
      await expect(service.start(created.studentId, created.quizId)).rejects.toThrow(/cooldown/i);

      // 23h59m — still blocked. 24h01m — allowed. Boundary, not "roughly".
      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: { submittedAt: new Date(Date.now() - (24 * 3600 - 60) * 1000) },
      });
      await expect(service.start(created.studentId, created.quizId)).rejects.toThrow(/cooldown/i);

      await prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: { submittedAt: new Date(Date.now() - (24 * 3600 + 60) * 1000) },
      });
      await expect(service.start(created.studentId, created.quizId)).resolves.toBeDefined();
    });

    it('refuses a student who is not enrolled', async () => {
      const created = await fixture({});
      await prisma.enrollment.deleteMany({ where: { userId: created.studentId } });
      await expect(service.start(created.studentId, created.quizId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses an unpublished lesson', async () => {
      const created = await fixture({});
      await prisma.lesson.update({ where: { id: created.lessonId }, data: { isPublished: false } });
      await expect(service.start(created.studentId, created.quizId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses before openFrom and after openUntil, with distinct machine-readable codes', async () => {
      const notYet = await fixture({ openFrom: new Date(Date.now() + 3600_000) });
      await expect(service.start(notYet.studentId, notYet.quizId)).rejects.toMatchObject({
        status: 403,
        response: { code: 'quiz_not_open_yet' },
      });

      const closed = await fixture({ openUntil: new Date(Date.now() - 1000) });
      await expect(service.start(closed.studentId, closed.quizId)).rejects.toMatchObject({
        status: 403,
        response: { code: 'quiz_closed' },
      });
    });

    it('draws pool questions once and snapshots them', async () => {
      const created = await fixture({ questionCount: 0 });
      // Five ready questions in the fixture's category, pool picks 2. Pushed
      // onto the fixture's own `bankEntryIds` (the SAME array `cleanup()`
      // closes over) so teardown deletes them too.
      for (let i = 0; i < 5; i += 1) {
        const q = await bank.create(
          {
            type: 'mcq_single',
            categoryId: created.categoryId,
            stemHtml: `<p>سؤال مجمع ${i}</p>`,
            defaultMark: 1,
            settings: { shuffleOptions: false, caseSensitive: false },
            options: [
              { bodyHtml: '<p>أ</p>', fraction: 1 },
              { bodyHtml: '<p>ب</p>', fraction: 0 },
            ],
          } as QuestionInput,
          created.adminId,
        );
        await bank.publish(q.versionId);
        created.bankEntryIds.push(q.bankEntryId);
      }

      const pool = await prisma.quizPool.create({
        data: {
          quizId: created.quizId,
          name: 'مجمع',
          pickCount: 2,
          pointsPerQuestion: 1,
          sourceFilter: { categoryIds: [created.categoryId] },
        },
      });
      await prisma.quizSlot.create({
        data: { quizId: created.quizId, position: 0, maxMark: 1, poolId: pool.id },
      });
      await prisma.quiz.update({ where: { id: created.quizId }, data: { sumMarks: 2 } });

      const started = await service.start(created.studentId, created.quizId);
      expect(started.questions).toHaveLength(2);

      const resumed = await service.resume(created.studentId, started.attemptId);
      const firstVersionIds = (
        await prisma.attemptQuestion.findMany({
          where: { attemptId: started.attemptId },
          orderBy: { slotPosition: 'asc' },
          select: { questionVersionId: true },
        })
      ).map((row) => row.questionVersionId);
      expect(resumed.questions).toHaveLength(2);
      const afterVersionIds = (
        await prisma.attemptQuestion.findMany({
          where: { attemptId: started.attemptId },
          orderBy: { slotPosition: 'asc' },
          select: { questionVersionId: true },
        })
      ).map((row) => row.questionVersionId);
      expect(afterVersionIds).toEqual(firstVersionIds);
    });

    it('writes an attempt_started event with seq 1', async () => {
      const created = await fixture({});
      const started = await service.start(created.studentId, created.quizId);
      const attemptEvents = await prisma.attemptEvent.findMany({
        where: { attemptId: started.attemptId },
      });
      expect(attemptEvents).toHaveLength(1);
      expect(attemptEvents[0]!.seq).toBe(1);
      expect(attemptEvents[0]!.kind).toBe('attempt_started');
    });

    it('issues an attemptToken and rotates it on an explicit resume', async () => {
      const created = await fixture({});
      const started = await service.start(created.studentId, created.quizId);
      const resumed = await service.resume(created.studentId, started.attemptId);
      expect(resumed.attemptToken).not.toBe(started.attemptToken);
    });

    it("refuses to resume another student's attempt", async () => {
      const created = await fixture({});
      const started = await service.start(created.studentId, created.quizId);
      await expect(
        service.resume(created.otherStudentId, started.attemptId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns no answer data in the start payload', async () => {
      const created = await fixture({});
      const started = await service.start(created.studentId, created.quizId);
      for (const key of collectKeysDeep(started)) {
        expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
      }
    });
  });
});
