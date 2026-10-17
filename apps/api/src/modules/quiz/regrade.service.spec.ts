import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { AuditService } from '../../audit/audit.service';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService, type StartedAttempt } from './attempt.service';
import { QuestionBankService } from './question-bank.service';
import { QuizAccessService } from './quiz-access.service';
import { RegradeService } from './regrade.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * The case this exists for, replayed: a question goes live with the key on
 * the wrong option, students answer, the teacher fixes the key — and the
 * students who were right must get their mark, the ones who picked the old
 * key must lose it, and nobody may be touched who should not be.
 */
describe('RegradeService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const lessonAccess = () =>
    new LessonAccessService(prisma, new LessonGateService(prisma, new EntitlementService(prisma)), new EntitlementService(prisma));
  const progress = new LessonProgressService(
    prisma,
    lessonAccess(),
    new CourseProgressService(new NotificationsService(prisma)),
    new NotificationsService(prisma),
  );
  const attempts = new AttemptService(
    prisma,
    new QuizAccessService(prisma, lessonAccess()),
    new AttemptEventsService(),
    progress,
    lessonAccess(),
    new NotificationsService(prisma),
  );
  const audit = new AuditService(prisma);
  const bank = new QuestionBankService(prisma, audit);
  const service = new RegradeService(prisma, attempts, progress, bank, audit);

  const fixtures: QuizFixture[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    while (fixtures.length > 0) await fixtures.pop()!.cleanup();
  }, 30_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** The fixture's question 1 as stored: «أ (الصحيحة)» keyed, then ب ج د. */
  async function storedInput(bankEntryId: string): Promise<QuestionInput> {
    return (await bank.getForEdit(bankEntryId)).input;
  }

  /** The teacher moves the key to «ب» and publishes. */
  async function moveKeyTo(bankEntryId: string, body: string, actorId: string): Promise<void> {
    const input = await storedInput(bankEntryId);
    const edited = {
      ...input,
      options: input.options.map((option) => ({
        ...option,
        fraction: 'bodyHtml' in option && option.bodyHtml === body ? 1 : 0,
      })),
    } as QuestionInput;
    const saved = await bank.saveDraft(bankEntryId, edited, actorId);
    await bank.publish(saved.versionId);
  }

  function optionIdByBody(started: StartedAttempt, slot: number, body: string): string {
    const option = started.questions[slot]!.options.find((row) => row.bodyHtml === body);
    if (!option) throw new Error(`no option ${body}`);
    return option.id;
  }

  async function answerAndSubmit(userId: string, quizId: string, body: string): Promise<string> {
    const started = await attempts.start(userId, quizId);
    await attempts.saveAnswers(userId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [optionIdByBody(started, 0, body)] } }],
    });
    await attempts.submit(userId, started.attemptId, { attemptToken: started.attemptToken });
    return started.attemptId;
  }

  async function markOf(attemptId: string): Promise<number | null> {
    const row = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId, slotPosition: 0 },
      select: { mark: true },
    });
    return row.mark === null ? null : Number(row.mark);
  }

  it('gives the mark to the right answer and takes it from the old key', async () => {
    const f = await seedQuizFixture(prisma, { questionCount: 1 });
    fixtures.push(f);
    const right = await answerAndSubmit(f.studentId, f.quizId, '<p>ب</p>');
    const oldKey = await answerAndSubmit(f.otherStudentId, f.quizId, '<p>أ (الصحيحة)</p>');
    expect(await markOf(right)).toBe(0);
    expect(await markOf(oldKey)).toBe(1);

    // Asked BEFORE the edit is published — what the save confirmation does —
    // 'stale' sees nothing yet, and 'all' sees the two answers about to go stale.
    expect(await service.preview(f.bankEntryIds[0]!, 'stale')).toMatchObject({ answers: 0 });
    expect(await service.preview(f.bankEntryIds[0]!, 'all')).toMatchObject({ answers: 2, students: 2 });

    await moveKeyTo(f.bankEntryIds[0]!, '<p>ب</p>', f.adminId);

    expect(await service.preview(f.bankEntryIds[0]!)).toMatchObject({
      version: 2,
      answers: 2,
      finished: 2,
      inProgress: 0,
      students: 2,
    });

    const result = await service.regradeEntry(f.bankEntryIds[0]!, f.adminId);
    expect(result).toEqual({ moved: 2, regraded: 2, raised: 1, lowered: 1, skipped: 0, attempts: 2 });
    expect(await markOf(right)).toBe(1);
    expect(await markOf(oldKey)).toBe(0);

    // The papers now point at the corrected version, with the answer carried
    // onto ITS option ids — so the review highlights the right row.
    const latest = await prisma.questionVersion.findFirstOrThrow({
      where: { bankEntryId: f.bankEntryIds[0]!, version: 2 },
      select: { id: true, options: { select: { id: true, bodyHtml: true } } },
    });
    const moved = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: right, slotPosition: 0 },
      select: { questionVersionId: true, response: true, state: true },
    });
    expect(moved.questionVersionId).toBe(latest.id);
    expect(moved.state).toBe('graded_right');
    const chosen = (moved.response as { optionIds: string[] }).optionIds[0];
    expect(latest.options.find((option) => option.id === chosen)?.bodyHtml).toBe('<p>ب</p>');

    const paper = await prisma.quizAttempt.findUniqueOrThrow({ where: { id: right }, select: { scaledScore: true } });
    expect(Number(paper.scaledScore)).toBe(100);

    // Running it again finds nothing left to move.
    expect(await service.regradeEntry(f.bankEntryIds[0]!, f.adminId)).toMatchObject({ moved: 0, regraded: 0 });
  });

  it('leaves an answer alone when its option was rewritten out of the question', async () => {
    const f = await seedQuizFixture(prisma, { questionCount: 1 });
    fixtures.push(f);
    const paper = await answerAndSubmit(f.studentId, f.quizId, '<p>د</p>');

    const input = await storedInput(f.bankEntryIds[0]!);
    const rewritten = {
      ...input,
      options: [
        { bodyHtml: '<p>أ (الصحيحة)</p>', fraction: 0 },
        { bodyHtml: '<p>ب</p>', fraction: 1 },
        { bodyHtml: '<p>ج</p>', fraction: 0 },
        { bodyHtml: '<p>اختيار جديد خالص مكتوب من الأول</p>', fraction: 0 },
      ],
    } as QuestionInput;
    const saved = await bank.saveDraft(f.bankEntryIds[0]!, rewritten, f.adminId);
    await bank.publish(saved.versionId);

    const result = await service.regradeEntry(f.bankEntryIds[0]!, f.adminId);
    expect(result).toMatchObject({ moved: 0, skipped: 1 });
    const row = await prisma.attemptQuestion.findFirstOrThrow({
      where: { attemptId: paper, slotPosition: 0 },
      select: { questionVersionId: true },
    });
    expect(row.questionVersionId).toBe(f.versionIds[0]);
  });

  it('never overrides a mark a teacher set by hand', async () => {
    const f = await seedQuizFixture(prisma, { questionCount: 1 });
    fixtures.push(f);
    const paper = await answerAndSubmit(f.studentId, f.quizId, '<p>ج</p>');
    await prisma.attemptQuestion.updateMany({
      where: { attemptId: paper, slotPosition: 0 },
      data: { mark: 0.5, gradedBy: f.adminId },
    });

    // Not offered either: a count the button cannot change is a banner that never clears.
    expect(await service.preview(f.bankEntryIds[0]!, 'all')).toMatchObject({ answers: 0 });

    await moveKeyTo(f.bankEntryIds[0]!, '<p>ج</p>', f.adminId);
    expect(await service.regradeEntry(f.bankEntryIds[0]!, f.adminId)).toMatchObject({ moved: 0, skipped: 1 });
    expect(await markOf(paper)).toBe(0.5);
    expect(await service.quizEdits(f.quizId)).toEqual({ pendingDrafts: 0, staleAnswers: 0, students: 0 });
  });

  it('moves a paper still being sat, and marks it against the new key — even from a stale tab', async () => {
    const f = await seedQuizFixture(prisma, { questionCount: 1 });
    fixtures.push(f);
    const started = await attempts.start(f.studentId, f.quizId);
    const oldIdOfB = optionIdByBody(started, 0, '<p>ب</p>');
    await attempts.saveAnswers(f.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [oldIdOfB] } }],
    });

    await moveKeyTo(f.bankEntryIds[0]!, '<p>ب</p>', f.adminId);
    expect(await service.regradeEntry(f.bankEntryIds[0]!, f.adminId)).toMatchObject({ moved: 1, regraded: 0 });

    // The student's tab still holds version 1 and saves its old id again.
    await attempts.saveAnswers(f.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 2,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [oldIdOfB] } }],
    });
    await attempts.submit(f.studentId, started.attemptId, { attemptToken: started.attemptToken });
    expect(await markOf(started.attemptId)).toBe(1);
  });

  it('reports what an exam has waiting, and publishes and regrades it in one go', async () => {
    const f = await seedQuizFixture(prisma, { questionCount: 2 });
    fixtures.push(f);
    const paper = await answerAndSubmit(f.studentId, f.quizId, '<p>ب</p>');

    // An edit saved as a draft — students are still served version 1.
    const input = await storedInput(f.bankEntryIds[0]!);
    await bank.saveDraft(
      f.bankEntryIds[0]!,
      {
        ...input,
        options: input.options.map((option) => ({
          ...option,
          fraction: 'bodyHtml' in option && option.bodyHtml === '<p>ب</p>' ? 1 : 0,
        })),
      } as QuestionInput,
      f.adminId,
    );
    expect(await service.quizEdits(f.quizId)).toEqual({ pendingDrafts: 1, staleAnswers: 0, students: 0 });

    expect(await service.publishQuizEdits(f.quizId)).toEqual({ published: 1, failed: [] });
    expect(await service.quizEdits(f.quizId)).toEqual({ pendingDrafts: 0, staleAnswers: 1, students: 1 });

    expect(await service.regradeQuiz(f.quizId, f.adminId)).toMatchObject({ moved: 1, raised: 1 });
    expect(await markOf(paper)).toBe(1);
    expect(await service.quizEdits(f.quizId)).toEqual({ pendingDrafts: 0, staleAnswers: 0, students: 0 });
  });

  it('serves a question that points at its own letters in the order it was written, without the typed letters', async () => {
    const f = await seedQuizFixture(prisma, { questionCount: 0, shuffleOptions: true });
    fixtures.push(f);
    const created = await bank.create(
      {
        type: 'mcq_single',
        categoryId: f.categoryId,
        stemHtml: '<p>العامل الذي قد يجعل نتائج الذكاء الاصطناعي غير دقيقة</p>',
        defaultMark: 1,
        settings: { shuffleOptions: true, caseSensitive: false },
        options: [
          { bodyHtml: '<p>أ) تحيز بيانات التدريب</p>', fraction: 0 },
          { bodyHtml: '<p>ب) سرعة الجهاز</p>', fraction: 0 },
          { bodyHtml: '<p>ج) حجم الشاشة</p>', fraction: 0 },
          { bodyHtml: '<p>د) أ و ب معا</p>', fraction: 1 },
        ],
      } as QuestionInput,
      f.adminId,
    );
    await bank.publish(created.versionId);
    f.bankEntryIds.push(created.bankEntryId);
    f.versionIds.push(created.versionId);
    await prisma.quizSlot.create({ data: { quizId: f.quizId, position: 0, maxMark: 1, bankEntryId: created.bankEntryId } });

    // Shuffled, «أ و ب معا» would name two other rows. Two sittings, the same
    // written order both times, and the runner's own letters line up.
    for (const userId of [f.studentId, f.otherStudentId]) {
      const started = await attempts.start(userId, f.quizId);
      expect(started.questions[0]!.options.map((option) => option.bodyHtml)).toEqual([
        '<p>تحيز بيانات التدريب</p>',
        '<p>سرعة الجهاز</p>',
        '<p>حجم الشاشة</p>',
        '<p>أ و ب معا</p>',
      ]);
    }
  });
});
