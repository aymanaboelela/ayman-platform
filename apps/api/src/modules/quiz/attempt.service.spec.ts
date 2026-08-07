import 'dotenv/config';
import { AuditService } from '../../audit/audit.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { DEFAULT_REVIEW_OPTIONS } from '@ayman/contracts/quiz/quiz-settings';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptEventsService } from './attempt-events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttemptService, type StartedAttempt } from './attempt.service';
import { OverdueService } from './overdue.service';
import { QuizAccessService } from './quiz-access.service';
import { QuestionBankService } from './question-bank.service';
import { collectKeysDeep, FORBIDDEN_ANSWER_KEYS } from './serializers/learner.serializer';
import { seedQuizFixture, type QuizFixture, type QuizFixtureOverrides } from './testing/quiz-fixtures';

describe('AttemptService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const access = new QuizAccessService(prisma, new LessonAccessService(prisma, new LessonGateService(prisma)));
  const events = new AttemptEventsService();
  const progress = new LessonProgressService(
    prisma,
    new LessonAccessService(prisma, new LessonGateService(prisma)),
    new CourseProgressService(),
  );
  const service = new AttemptService(prisma, access, events, progress, new LessonAccessService(prisma, new LessonGateService(prisma)), new NotificationsService(prisma));
  const overdue = new OverdueService(prisma, service);
  const bank = new QuestionBankService(prisma, new AuditService(prisma));

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

  /** Starts an attempt against a freshly seeded fixture with `questionCount`
   *  questions. Every later describe block in this file builds on this. */
  async function startAttempt(
    questionCount = 1,
    overrides: QuizFixtureOverrides = {},
  ): Promise<{ started: StartedAttempt; fixture: QuizFixture }> {
    const created = await fixture({ questionCount, ...overrides });
    const started = await service.start(created.studentId, created.quizId);
    return { started, fixture: created };
  }

  function firstOptionId(started: StartedAttempt, slot = 0): string {
    return started.questions[slot]!.options[0]!.id;
  }

  /** The correct option id, read directly from the database rather than
   *  assumed to be index 0 of the (possibly server-shuffled) presented list. */
  async function correctOptionId(started: StartedAttempt, slot = 0): Promise<string> {
    const row = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: started.attemptId, slotPosition: slot },
      select: { questionVersionId: true },
    });
    const option = await prisma.questionOption.findFirstOrThrow({
      where: { questionVersionId: row.questionVersionId, fraction: 1 },
      select: { id: true },
    });
    return option.id;
  }

  async function wrongOptionId(started: StartedAttempt, slot = 0): Promise<string> {
    const row = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: started.attemptId, slotPosition: slot },
      select: { questionVersionId: true },
    });
    const option = await prisma.questionOption.findFirstOrThrow({
      where: { questionVersionId: row.questionVersionId, fraction: { not: 1 } },
      select: { id: true },
    });
    return option.id;
  }

  async function answerCorrectly(
    userId: string,
    started: StartedAttempt,
    slot = 0,
    seq = 1,
  ): Promise<void> {
    const optionId = await correctOptionId(started, slot);
    await service.saveAnswers(userId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq,
      answers: [{ slotPosition: slot, response: { kind: 'choice', optionIds: [optionId] } }],
    });
  }

  async function answerIncorrectly(
    userId: string,
    started: StartedAttempt,
    slot = 0,
    seq = 1,
  ): Promise<void> {
    const optionId = await wrongOptionId(started, slot);
    await service.saveAnswers(userId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq,
      answers: [{ slotPosition: slot, response: { kind: 'choice', optionIds: [optionId] } }],
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
    // 20s, not Jest's 5000ms default: the "actually shuffles" test above
    // pushes 20 fixtures in one run, and this hook tears down whatever the
    // PRECEDING test accumulated — it has to be at least as patient as the
    // heaviest test in the file, not the average one.
    while (fixtures.length > 0) {
      await fixtures.pop()!.cleanup();
    }
  }, 20_000);

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

    it('advances nextSeq past whatever a previous tab already saved, so a fresh page load cannot lose a write', async () => {
      const created = await fixture({ questionCount: 1 });
      const started = await service.start(created.studentId, created.quizId);
      expect(started.nextSeq).toBe(1);

      const optionId = started.questions[0]!.options[0]!.id;
      await service.saveAnswers(created.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 5,
        answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [optionId] } }],
      });

      // A brand-new page load (fresh in-memory seq counter) resumes and must
      // be told to start ABOVE 5, or its first save (whatever seq it picks)
      // could collide with the already-stored value and silently no-op.
      const resumed = await service.resume(created.studentId, started.attemptId);
      expect(resumed.nextSeq).toBe(6);

      const saved = await service.saveAnswers(created.studentId, started.attemptId, {
        attemptToken: resumed.attemptToken,
        seq: resumed.nextSeq,
        answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [optionId] } }],
      });
      expect(saved.savedSlots).toEqual([0]);
    });

    it('actually shuffles when shuffleOptions is on', async () => {
      // Twenty independent attempt CREATIONS (each against its own fixture,
      // since the option order is a fresh shuffle per attempt) — a
      // single-attempt assertion would pass 1 time in 24 by luck, so this
      // asserts at least two distinct orders appear across the run.
      //
      // Explicit 20s timeout (Jest's own per-test default is 5000ms): this
      // is ~20 full course->section->lesson->quiz->question fixture builds
      // plus 20 `start()` calls, all real Postgres round trips, sequential
      // by design (each fixture needs its own quiz). That legitimately runs
      // past 5s under machine load (observed: passes in ~1-2s idle, flakes
      // under concurrent load) — Postgres's own `statement_timeout` on
      // `ayman_runtime` is 15s per statement (Task 10) and was never the
      // cause; this is Jest's client-side test timeout being tight for a
      // deliberately heavy test, raised here rather than by loosening the
      // role's statement_timeout for every other query in the suite.
      const orders = new Set<string>();
      for (let i = 0; i < 20; i += 1) {
        const f = await fixture({ questionCount: 1, shuffleOptions: true });
        const started = await service.start(f.studentId, f.quizId);
        orders.add(started.questions[0]!.options.map((option) => option.id).join(','));
      }
      expect(orders.size).toBeGreaterThan(1);
    }, 20_000);

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

    it('allows exactly one sitting of an ordinary quiz', async () => {
      const created = await fixture({});
      await submitAttempt(created.studentId, created.quizId);
      await expect(service.start(created.studentId, created.quizId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('adds granted extra attempts to the allowance', async () => {
      const created = await fixture({});
      const attempt = await submitAttempt(created.studentId, created.quizId);
      await expect(service.start(created.studentId, created.quizId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await prisma.quizAttempt.update({ where: { id: attempt.id }, data: { extraAttempts: 1 } });
      await expect(service.start(created.studentId, created.quizId)).resolves.toBeDefined();
    });

    /*
     * The improvement sitting, end to end through the real write path: a
     * second sitting is allowed, it draws the OTHER paper, and a third is
     * refused.
     */
    it('serves the improvement paper as the second sitting of an improvable exam', async () => {
      const created = await fixture({ allowsImprovement: true, improvementQuestionCount: 2 });
      const first = await submitAttempt(created.studentId, created.quizId);
      expect((await prisma.quizAttempt.findUniqueOrThrow({ where: { id: first.id } })).paper).toBe(
        'original',
      );

      const second = await service.start(created.studentId, created.quizId);
      const secondRow = await prisma.quizAttempt.findUniqueOrThrow({
        where: { id: second.attemptId },
        select: { paper: true, attemptNo: true, questions: { select: { id: true } } },
      });
      expect(secondRow.paper).toBe('improvement');
      expect(secondRow.attemptNo).toBe(2);
      // Drawn from the improvement paper's own two slots, not the original's.
      expect(secondRow.questions).toHaveLength(2);
    });

    it('refuses a third sitting once the improvement is spent', async () => {
      const created = await fixture({ allowsImprovement: true, improvementQuestionCount: 2 });
      await submitAttempt(created.studentId, created.quizId);
      const second = await service.start(created.studentId, created.quizId);
      await service.submit(created.studentId, second.attemptId, {
        attemptToken: second.attemptToken,
      });

      await expect(service.start(created.studentId, created.quizId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('records the student\u2019s acknowledgement on the attempt_started event', async () => {
      const created = await fixture({});
      const started = await service.start(created.studentId, created.quizId);
      const event = await prisma.attemptEvent.findFirstOrThrow({
        where: { attemptId: started.attemptId, kind: 'attempt_started' },
        select: { payload: true },
      });
      // "The student was told the result is permanent" is a fact in an
      // append-only log, not a claim about a dialog that may not have rendered.
      expect(event.payload).toMatchObject({ acknowledged: true, paper: 'original' });
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

  describe('AttemptService.saveAnswers', () => {
    it('stores a choice response and marks the question complete', async () => {
      const { started, fixture: f } = await startAttempt();
      await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [firstOptionId(started)] } }],
      });
      const row = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId, slotPosition: 0 },
      });
      expect(row!.state).toBe('complete');
      expect(row!.answeredAt).toBeInstanceOf(Date);
    });

    // Q4 — THE TOKEN.
    it('rejects a write carrying a stale attemptToken', async () => {
      const { started, fixture: f } = await startAttempt();
      await service.resume(f.studentId, started.attemptId); // rotates the token
      await expect(
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('records a stale_write_rejected event so the trail shows the stale tab', async () => {
      const { started, fixture: f } = await startAttempt();
      await service.resume(f.studentId, started.attemptId);
      await service
        .saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
        })
        .catch(() => undefined);

      const event = await prisma.attemptEvent.findFirst({
        where: { attemptId: started.attemptId, kind: 'stale_write_rejected' },
      });
      expect(event).not.toBeNull();
      expect((event!.payload as { tokenPrefix: string }).tokenPrefix).toBe(
        started.attemptToken.slice(0, 8),
      );
    });

    it("rejects a write to another student's attempt", async () => {
      const { started, fixture: f } = await startAttempt();
      await expect(
        service.saveAnswers(f.otherStudentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a write after submission', async () => {
      const { started, fixture: f } = await startAttempt();
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { submittedAt: new Date(), state: 'submitted' },
      });
      await expect(
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 2,
          answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('ignores an out-of-order autosave from a backgrounded tab', async () => {
      const { started, fixture: f } = await startAttempt();
      const save = (seq: number, text: string) =>
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq,
          answers: [{ slotPosition: 0, response: { kind: 'text', text } }],
        });

      await save(5, 'newer');
      await save(3, 'older'); // arrives late
      const row = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId, slotPosition: 0 },
      });
      expect((row!.response as { text: string }).text).toBe('newer');
      expect(row!.responseSeq).toBe(5);
    });

    it('appends exactly one answer_saved event per saved slot', async () => {
      const { started, fixture: f } = await startAttempt(3);
      await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [
          { slotPosition: 0, response: { kind: 'text', text: 'a' } },
          { slotPosition: 1, response: { kind: 'text', text: 'b' } },
        ],
      });
      const attemptEvents = await prisma.attemptEvent.findMany({
        where: { attemptId: started.attemptId, kind: 'answer_saved' },
        orderBy: { seq: 'asc' },
      });
      expect(attemptEvents).toHaveLength(2);
      expect(attemptEvents.map((event) => event.seq)).toEqual([2, 3]); // 1 was attempt_started
    });

    it('never writes a grade into the event payload', async () => {
      const { started, fixture: f } = await startAttempt();
      await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [firstOptionId(started)] } }],
      });
      const event = await prisma.attemptEvent.findFirst({
        where: { attemptId: started.attemptId, kind: 'answer_saved' },
      });
      for (const key of collectKeysDeep(event!.payload)) {
        expect(FORBIDDEN_ANSWER_KEYS.has(key)).toBe(false);
      }
    });

    it('clears an answer back to todo when the response is null', async () => {
      const { started, fixture: f } = await startAttempt();
      await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'x' } }],
      });
      await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 2,
        answers: [{ slotPosition: 0, response: null }],
      });
      const row = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId, slotPosition: 0 },
      });
      expect(row!.state).toBe('todo');
      expect(row!.response).toBeNull();
    });

    it('rejects a slotPosition that is not part of this attempt', async () => {
      const { started, fixture: f } = await startAttempt(2);
      await expect(
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 99, response: { kind: 'text', text: 'x' } }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a save past the deadline plus grace', async () => {
      const { started, fixture: f } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 60 });
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 120_000) },
      });
      await expect(
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 0, response: { kind: 'text', text: 'late' } }],
        }),
      ).rejects.toThrow(/overdue/i);
    });

    it('accepts a save inside the grace window', async () => {
      const { started, fixture: f } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 60 });
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 10_000) },
      });
      await expect(
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 0, response: { kind: 'text', text: 'just in time' } }],
        }),
      ).resolves.toBeDefined();
    });

    it('honours granted extra time without touching deadlineAt', async () => {
      const { started, fixture: f } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 0 });
      const before = (await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } }))!
        .deadlineAt;
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 30_000), extraTimeSeconds: 300 },
      });
      await expect(
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 1,
          answers: [{ slotPosition: 0, response: { kind: 'text', text: 'ok' } }],
        }),
      ).resolves.toBeDefined();
      expect(before).toBeInstanceOf(Date);
    });

    it('returns a server-computed answered count, not one the client sent', async () => {
      const { started, fixture: f } = await startAttempt(3);
      const result = await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'a' } }],
      });
      expect(result.answeredCount).toBe(1);
    });

    it('returns a fresh serverTime so the client can resync its timer', async () => {
      const { started, fixture: f } = await startAttempt();
      const result = await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: 0, response: { kind: 'text', text: 'a' } }],
      });
      expect(Math.abs(new Date(result.serverTime).getTime() - Date.now())).toBeLessThan(5000);
    });
  });

  describe('AttemptService.setFlag', () => {
    it('toggles the flag and records an event', async () => {
      const { started, fixture: f } = await startAttempt();
      const result = await service.setFlag(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        slotPosition: 0,
        flagged: true,
      });
      expect(result.flagged).toBe(true);
      const row = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId, slotPosition: 0 },
      });
      expect(row!.flagged).toBe(true);
      const event = await prisma.attemptEvent.findFirst({
        where: { attemptId: started.attemptId, kind: 'flag_toggled' },
      });
      expect(event).not.toBeNull();
    });

    it('requires a valid attemptToken', async () => {
      const { started, fixture: f } = await startAttempt();
      await expect(
        service.setFlag(f.studentId, started.attemptId, {
          attemptToken: '00000000-0000-0000-0000-000000000000',
          slotPosition: 0,
          flagged: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('AttemptService.submit', () => {
    it('grades from FRESH database reads, ignoring anything the client sends', async () => {
      const { started, fixture: f } = await startAttempt(2);
      await answerCorrectly(f.studentId, started, 0);
      await answerIncorrectly(f.studentId, started, 1, 2);
      const result = await service.submit(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        // A hostile client would attach its own grade here — the DTO's
        // `.strict()` rejects it before this ever runs (see the mass
        // assignment test below), and even without that, nothing in
        // `gradeAndFinalise` ever reads a client-supplied field.
      });
      expect(result.rawScore).toBe(1);
      expect(result.scaledScore).toBe(50);
    });

    // Q4 — REPLAY FOR A BETTER SCORE.
    it('rejects a second submit of the same attempt', async () => {
      const { started, fixture: f } = await startAttempt();
      await service.submit(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
      });
      await expect(
        service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets exactly one of two concurrent submits win', async () => {
      const { started, fixture: f } = await startAttempt();
      const results = await Promise.allSettled([
        service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken }),
        service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const submittedEvents = await prisma.attemptEvent.count({
        where: { attemptId: started.attemptId, kind: 'submitted' },
      });
      expect(submittedEvents).toBe(1);
    });

    // B1 — THE REAL REPRO. `recordQuizResult` used to open its own
    // `$transaction` from inside `submit`'s already-open one — a SECOND
    // pooled connection checked out per submit, on top of the first.
    // `pg.Pool` defaulted to `max: 10` with no explicit ceiling, so ten
    // concurrent submits at one exam deadline (ten DIFFERENT students, ten
    // DIFFERENT attempts — nothing here is a same-row lock contention case)
    // wedged the pool solid: every outer transaction's connection was itself
    // waiting on a connection its own nested call was holding, and every one
    // of them rolled back at the 5s interactive-transaction timeout. A
    // skeptic reproduced this on the real database with the unmodified
    // stack: 10 concurrent -> all 10 fail; 9 concurrent -> all 9 succeed.
    // `recordQuizResultTx` threads the caller's OWN transaction through
    // instead of opening a second one, so this now holds regardless of N.
    it('lets N concurrent submits across DIFFERENT attempts all succeed (B1 — no nested transaction wedges the pool)', async () => {
      const N = 12; // > the pg.Pool default of 10 that this bug wedged solid
      const attempts: { studentId: string; attemptId: string; attemptToken: string }[] = [];
      for (let i = 0; i < N; i += 1) {
        const f = await fixture({ questionCount: 1 });
        const started = await service.start(f.studentId, f.quizId);
        await answerCorrectly(f.studentId, started, 0);
        attempts.push({
          studentId: f.studentId,
          attemptId: started.attemptId,
          attemptToken: started.attemptToken,
        });
      }

      const results = await Promise.allSettled(
        attempts.map((a) => service.submit(a.studentId, a.attemptId, { attemptToken: a.attemptToken })),
      );

      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (rejected.length > 0) {
        // Surface WHY, not just the count, if this ever regresses.
        console.error('B1 concurrent-submit failures:', rejected.map((r) => r.reason));
      }
      expect(rejected).toHaveLength(0);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(N);

      for (const a of attempts) {
        const attempt = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: a.attemptId } });
        expect(attempt.state).toBe('submitted');
        expect(attempt.submittedAt).not.toBeNull();
      }
    }, 30_000);

    it('does not let a changed answer after submission alter the recorded score', async () => {
      const { started, fixture: f } = await startAttempt(1);
      await answerIncorrectly(f.studentId, started, 0);
      const first = await service.submit(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
      });
      const correctId = await correctOptionId(started, 0);
      await expect(
        service.saveAnswers(f.studentId, started.attemptId, {
          attemptToken: started.attemptToken,
          seq: 99,
          answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [correctId] } }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
      expect(Number(attempt!.rawScore)).toBe(first.rawScore);
    });

    it('writes rightAnswerText and responseText only at submit time', async () => {
      const { started, fixture: f } = await startAttempt(1);
      await answerCorrectly(f.studentId, started, 0);
      const before = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId },
      });
      expect(before!.rightAnswerText).toBeNull();
      await service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
      const after = await prisma.attemptQuestion.findFirst({
        where: { attemptId: started.attemptId },
      });
      expect(after!.rightAnswerText).not.toBeNull();
      expect(after!.responseText).not.toBeNull();
    });

    it('lists EVERY option carrying positive credit in rightAnswerText, even when none reaches ~100% alone', async () => {
      // A regression test for a real bug found via manual browser verification:
      // `describeRightAnswer` used to filter options by `fraction >
      // RIGHT_THRESHOLD` (0.999999) — the constant that classifies a
      // STUDENT'S TOTAL SCORE as "basically 100%", not "is this option part
      // of the correct set". A two-correct-answer mcq_multi question built
      // the ordinary way (`redistribute()` in the admin's own option
      // picker splits credit 1/n across ticked options) has NEITHER correct
      // option above that threshold, so the old filter silently returned
      // `null` for every such question — hiding the model answer from
      // review forever, even after the quiz closed, and disabling the
      // review page's per-option correct-answer highlight (which keys off
      // this same string).
      const f = await fixture({ questionCount: 1 });
      const multiInput = {
        type: 'mcq_multi',
        categoryId: f.categoryId,
        stemHtml: '<p>سؤال متعدد الإجابات</p>',
        defaultMark: 1,
        settings: { shuffleOptions: false, caseSensitive: false },
        options: [
          { bodyHtml: '<p>أ</p>', fraction: 0.5 },
          { bodyHtml: '<p>ب</p>', fraction: 0.5 },
          { bodyHtml: '<p>ج</p>', fraction: 0 },
        ],
      } as QuestionInput;
      const created = await bank.create(multiInput, f.adminId);
      await bank.publish(created.versionId);
      // `f.bankEntryIds`/`f.versionIds` are the SAME arrays `fixture.cleanup()`
      // closes over — pushing onto them here (rather than tracking this bank
      // entry separately) makes cleanup delete it automatically, in the
      // correct order (after the attempt tree and the quiz's slots, both of
      // which reference it), instead of racing cleanup's own deletes.
      f.bankEntryIds.push(created.bankEntryId);
      f.versionIds.push(created.versionId);
      await prisma.quizSlot.create({
        data: { quizId: f.quizId, position: 1, maxMark: 1, bankEntryId: created.bankEntryId },
      });
      await prisma.quiz.update({ where: { id: f.quizId }, data: { sumMarks: 2 } });

      const started = await service.start(f.studentId, f.quizId);
      const multiSlot = started.questions.find((q) => q.stemHtml.includes('متعدد الإجابات'))!;
      const optionA = multiSlot.options.find((o) => o.bodyHtml.includes('أ'))!;
      await service.saveAnswers(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
        seq: 1,
        answers: [{ slotPosition: multiSlot.slotPosition, response: { kind: 'choice', optionIds: [optionA.id] } }],
      });
      await service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });

      const row = await prisma.attemptQuestion.findFirstOrThrow({
        where: { attemptId: started.attemptId, slotPosition: multiSlot.slotPosition },
      });
      expect(row.rightAnswerText).not.toBeNull();
      expect(row.rightAnswerText).toContain('أ');
      expect(row.rightAnswerText).toContain('ب');
      expect(row.rightAnswerText).not.toContain('ج');
    });

    it('marks the attempt pending_review when it contains an essay', async () => {
      const { started, fixture: f } = await startAttempt(1, { includeEssay: true });
      // slot 0 is mcq_single, slot 1 is the essay (appended after the fixed
      // questions) — answer the mcq, leave the essay ungraded.
      await answerCorrectly(f.studentId, started, 0);
      const result = await service.submit(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
      });
      expect(result.needsGrading).toBe(true);
      expect(result.attemptState).toBe('pending_review');
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
      expect(attempt!.state).toBe('pending_review');
    });

    it('calls LessonProgressService.recordQuizResultTx exactly once, through the SAME transaction (B1/B2)', async () => {
      const { started, fixture: f } = await startAttempt(1);
      await answerCorrectly(f.studentId, started, 0);
      // B1/B2: `submit()` now calls the `Tx` variant, threaded through its
      // own already-open transaction — never the standalone `recordQuizResult`,
      // which used to open a SECOND pooled connection from inside `submit`'s
      // transaction and wedge the pool under concurrency (see the
      // "N concurrent submits" test below for the actual repro).
      const txSpy = jest.spyOn(progress, 'recordQuizResultTx');
      const nonTxSpy = jest.spyOn(progress, 'recordQuizResult');
      await service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
      expect(txSpy).toHaveBeenCalledTimes(1);
      expect(nonTxSpy).not.toHaveBeenCalled();
      const lessonProgress = await prisma.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: {
            enrollmentId: (
              await prisma.enrollment.findFirstOrThrow({
                where: { userId: f.studentId, courseId: f.courseId },
                select: { id: true },
              })
            ).id,
            lessonId: f.lessonId,
          },
        },
      });
      expect(lessonProgress!.state).toBe('passed');
      txSpy.mockRestore();
      nonTxSpy.mockRestore();
    });

    it('appends a submitted event and one graded event per question', async () => {
      const { started, fixture: f } = await startAttempt(2);
      await answerCorrectly(f.studentId, started, 0);
      await service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
      const gradedEvents = await prisma.attemptEvent.count({
        where: { attemptId: started.attemptId, kind: 'graded' },
      });
      const submittedEvents = await prisma.attemptEvent.count({
        where: { attemptId: started.attemptId, kind: 'submitted' },
      });
      expect(gradedEvents).toBe(2);
      expect(submittedEvents).toBe(1);
    });

    it('rejects a submit with a stale token', async () => {
      const { started, fixture: f } = await startAttempt();
      await service.resume(f.studentId, started.attemptId);
      await expect(
        service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects a submit on another student's attempt with a 404", async () => {
      const { started, fixture: f } = await startAttempt();
      await expect(
        service.submit(f.otherStudentId, started.attemptId, { attemptToken: started.attemptToken }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('AttemptService.preflight', () => {
    it('counts unanswered questions on the SERVER', async () => {
      const { started, fixture: f } = await startAttempt(4);
      await answerCorrectly(f.studentId, started, 0);
      const preflight = await service.preflight(f.studentId, started.attemptId);
      expect(preflight).toEqual({ unansweredCount: 3, total: 4 });
    });

    it("refuses another student's attempt", async () => {
      const { started, fixture: f } = await startAttempt();
      await expect(
        service.preflight(f.otherStudentId, started.attemptId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('overdue handling', () => {
    it('autosubmits past the deadline plus grace and grades what is there', async () => {
      const { started, fixture: f } = await startAttempt(2, {
        durationSeconds: 60,
        graceSeconds: 60,
        overdueHandling: 'autosubmit',
      });
      await answerCorrectly(f.studentId, started, 0);
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 120_000) },
      });

      const closed = await overdue.sweep();
      expect(closed).toBe(1);
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
      expect(attempt!.state).toBe('submitted');
      expect(Number(attempt!.rawScore)).toBe(1);
      const event = await prisma.attemptEvent.findFirst({
        where: { attemptId: started.attemptId, kind: 'autosubmitted' },
      });
      expect(event).not.toBeNull();
    });

    it('does not touch an attempt still inside the grace window', async () => {
      const { started } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 60 });
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 10_000) },
      });
      expect(await overdue.sweep()).toBe(0);
    });

    it('adds granted extra time to the grace calculation', async () => {
      const { started } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 0 });
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 30_000), extraTimeSeconds: 300 },
      });
      expect(await overdue.sweep()).toBe(0);
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
      expect(attempt!.state).toBe('in_progress');
    });

    it('abandons instead of grading when overdueHandling is autoabandon', async () => {
      const { started } = await startAttempt(1, {
        durationSeconds: 60,
        graceSeconds: 0,
        overdueHandling: 'autoabandon',
      });
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 60_000) },
      });
      await overdue.sweep();
      const attempt = await prisma.quizAttempt.findUnique({ where: { id: started.attemptId } });
      expect(attempt!.state).toBe('abandoned');
      expect(attempt!.rawScore).toBeNull();
    });

    it('never touches an untimed attempt', async () => {
      await startAttempt(1, { durationSeconds: null });
      expect(await overdue.sweep()).toBe(0);
    });

    // I1 — THE REAL REPRO. `closeOverdue`'s `findFirst` carries no row lock,
    // so a submit that commits between that read and the write used to be
    // clobbered: the unconditional `update({ where: { id } })` re-matched the
    // now-submitted row (`WHERE id = $1` is always true) and stamped
    // `abandoned` — or re-wrote `submitted_at` — over an attempt the student
    // had already submitted and been graded on, which then silently dropped
    // out of analytics. `service.closeOverdue` is called directly here
    // (bypassing the sweeper's own candidate-selection query, which already
    // excludes `submitted_at IS NOT NULL`) to simulate exactly that race: the
    // attempt is submitted first, THEN closeOverdue runs against it.
    it('is a no-op on an attempt that was already submitted — does not clobber it (I1)', async () => {
      const { started, fixture: f } = await startAttempt(1, {
        durationSeconds: 60,
        overdueHandling: 'autoabandon',
      });
      await answerCorrectly(f.studentId, started, 0);
      const submitted = await service.submit(f.studentId, started.attemptId, {
        attemptToken: started.attemptToken,
      });
      const before = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });

      const outcome = await service.closeOverdue(started.attemptId);

      expect(outcome).toBeNull();
      const after = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: started.attemptId } });
      expect(after.state).toBe('submitted'); // NOT 'abandoned'
      expect(after.submittedAt?.getTime()).toBe(before.submittedAt?.getTime());
      expect(Number(after.rawScore)).toBe(submitted.rawScore);
      // Never re-appended a second grading/abandon event over the real one.
      const events = await prisma.attemptEvent.findMany({ where: { attemptId: started.attemptId } });
      expect(events.filter((e) => e.kind === 'abandoned')).toHaveLength(0);
      expect(events.filter((e) => e.kind === 'submitted')).toHaveLength(1);
    });

    it('is idempotent — a second sweep closes nothing', async () => {
      const { started } = await startAttempt(1, { durationSeconds: 60, graceSeconds: 0 });
      await prisma.quizAttempt.update({
        where: { id: started.attemptId },
        data: { deadlineAt: new Date(Date.now() - 60_000) },
      });
      expect(await overdue.sweep()).toBe(1);
      expect(await overdue.sweep()).toBe(0);
    });
  });

  describe('AttemptService.review', () => {
    it("refuses to review another student's attempt", async () => {
      const { started, fixture: f } = await startAttempt();
      await expect(service.review(f.otherStudentId, started.attemptId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s review once the enrolment is revoked, even for a submitted attempt (I3)', async () => {
      const { started, fixture: f } = await startAttempt(1, {});
      await answerCorrectly(f.studentId, started, 0);
      await service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
      // Baseline: a submitted graded attempt is reviewable straight away.
      await expect(service.review(f.studentId, started.attemptId)).resolves.toBeDefined();
      // Admin revokes access — a status change, not a delete, so the
      // ownership-only WHERE would still have matched and leaked the paper.
      await prisma.enrollment.updateMany({
        where: { userId: f.studentId, courseId: f.courseId },
        data: { status: 'revoked' },
      });
      await expect(service.review(f.studentId, started.attemptId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns a locked payload with a reason when every flag is off', async () => {
      const { started, fixture: f } = await startAttempt(1, {});
      const result = await service.review(f.studentId, started.attemptId);
      expect(result).toEqual({ locked: true, reason: 'during' });
    });

    /*
     * The review ROUTE still reads the `during` window, even though nothing
     * mid-attempt grades a question any more — an in-progress attempt resolves
     * to `window: 'during'`, and what that window permits is what the payload
     * carries. Stated inline rather than via a shared fixture so the matrix
     * under test is visible in the test.
     */
    it('honours a during-window correctness flag while withholding the right answer', async () => {
      const { started, fixture: f } = await startAttempt(1, {
        reviewOptions: {
          ...DEFAULT_REVIEW_OPTIONS,
          during: {
            response: true,
            correctness: true,
            marks: true,
            specificFeedback: true,
            generalFeedback: false,
            rightAnswer: false,
            overallFeedback: false,
          },
        },
      });
      await answerCorrectly(f.studentId, started, 0);
      const result = await service.review(f.studentId, started.attemptId);
      expect(result.locked).toBe(false);
      if (result.locked) throw new Error('unreachable');
      expect(result.questions[0]).toHaveProperty('correctness');
      expect(result.questions[0]).not.toHaveProperty('rightAnswerText');
    });

    it('reveals everything immediately after submission on a graded quiz', async () => {
      const { started, fixture: f } = await startAttempt(1, {});
      await answerCorrectly(f.studentId, started, 0);
      await service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
      const result = await service.review(f.studentId, started.attemptId);
      expect(result.locked).toBe(false);
      if (result.locked) throw new Error('unreachable');
      expect(result.window).toBe('immediatelyAfter');
      expect(result.questions[0]).toHaveProperty('rightAnswerText');
      expect(result.questions[0]).toHaveProperty('correctness', 'correct');
      expect(result.questions[0]).toHaveProperty('mark', 1);
    });

    it('carries the quiz passPercent, so the results screen can render the pass line', async () => {
      const { started, fixture: f } = await startAttempt(1, { passPercent: 65 });
      await answerCorrectly(f.studentId, started, 0);
      await service.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
      const result = await service.review(f.studentId, started.attemptId);
      expect(result.locked).toBe(false);
      if (result.locked) throw new Error('unreachable');
      expect(result.passPercent).toBe(65);
    });
  });
});
