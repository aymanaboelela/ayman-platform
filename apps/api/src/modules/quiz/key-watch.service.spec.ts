import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { QuestionInput } from '@ayman/contracts/quiz/question';
import { AuditService } from '../../audit/audit.service';
import { rolesWithPermission } from '../../auth/permissions';
import { PrismaClient, type Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseProgressService } from '../progress/course-progress.service';
import { LessonAccessService } from '../progress/lesson-access.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { LessonProgressService } from '../progress/lesson-progress.service';
import { AttemptEventsService } from './attempt-events.service';
import { AttemptService } from './attempt.service';
import { KeyWatchService } from './key-watch.service';
import { QuestionBankService } from './question-bank.service';
import { QuizAccessService } from './quiz-access.service';
import { seedQuizFixture, type QuizFixture } from './testing/quiz-fixtures';

/**
 * «الإجابة الصح غالبًا متسجّلة غلط», end to end: a real submit, the alert it
 * raises in the bell, and the admin band. Asserted on the EFFECT — rows in
 * `notifications` and what `listSuspects` returns — never on which method ran.
 *
 * The shape is the 2026-10-18 report: a true/false statement that is FALSE,
 * saved with «صح» as the key, and every student correctly answering «خطأ».
 */
describe('KeyWatchService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const bank = new QuestionBankService(prisma, new AuditService(prisma));

  function attemptService(notifications: NotificationsService, keyWatch: KeyWatchService): AttemptService {
    const lessonAccess = () =>
      new LessonAccessService(prisma, new LessonGateService(prisma, new EntitlementService(prisma)), new EntitlementService(prisma));
    return new AttemptService(
      prisma,
      new QuizAccessService(prisma, lessonAccess()),
      new AttemptEventsService(),
      new LessonProgressService(prisma, lessonAccess(), new CourseProgressService(notifications), notifications),
      lessonAccess(),
      notifications,
      keyWatch,
    );
  }

  const notifications = new NotificationsService(prisma);
  const keyWatch = new KeyWatchService(prisma, notifications);
  const attempts = attemptService(notifications, keyWatch);

  let fixture: QuizFixture | undefined;
  const extraUserIds: string[] = [];
  const startedAt = new Date();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await keyWatch.idle();
    await fixture?.cleanup();
    fixture = undefined;
    if (extraUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: extraUserIds } } });
      extraUserIds.length = 0;
    }
  });

  afterAll(async () => {
    // Staff outside the fixture were told too (that is the audience). Their
    // rows go by (user, created_at) — the indexed path — not by payload.
    const staff = await prisma.user.findMany({
      where: { role: { in: rolesWithPermission('question:write') } },
      select: { id: true },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: staff.map((user) => user.id) }, kind: 'suspect_key', createdAt: { gte: startedAt } },
    });
    await prisma.$disconnect();
  });

  /** A quiz holding ONE true/false question keyed as `key`. */
  async function trueFalseQuiz(key: 'صح' | 'خطأ'): Promise<{ versionId: string; right: string; wrong: string }> {
    fixture = await seedQuizFixture(prisma, { questionCount: 0, shuffleOptions: false });
    const created = await bank.create(
      {
        type: 'true_false',
        categoryId: fixture.categoryId,
        stemHtml: '<p>الذاكرة RAM بتحتفظ بالبيانات بعد قفل الجهاز</p>',
        defaultMark: 1,
        settings: {},
        options: [
          { bodyHtml: '<p>صح</p>', fraction: key === 'صح' ? 1 : 0 },
          { bodyHtml: '<p>خطأ</p>', fraction: key === 'خطأ' ? 1 : 0 },
        ],
      } as QuestionInput,
      fixture.adminId,
    );
    await bank.publish(created.versionId);
    fixture.bankEntryIds.push(created.bankEntryId);
    await prisma.quizSlot.create({
      data: { quizId: fixture.quizId, position: 0, maxMark: 1, bankEntryId: created.bankEntryId },
    });
    await prisma.quiz.update({ where: { id: fixture.quizId }, data: { sumMarks: 1 } });

    const options = await prisma.questionOption.findMany({
      where: { questionVersionId: created.versionId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    // The statement is FALSE, so «خطأ» is what a student who knows it picks.
    return { versionId: created.versionId, right: options[1]!.id, wrong: options[0]!.id };
  }

  /** A handed-in paper, written directly — the history before today's submit. */
  async function pastAnswer(versionId: string, optionId: string, fraction: number): Promise<void> {
    const userId = randomUUID();
    await prisma.user.create({
      data: { id: userId, name: 'Past Student', email: `${userId}@example.test`, role: 'student' },
    });
    extraUserIds.push(userId);
    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: fixture!.quizId,
        userId,
        attemptNo: 1,
        state: 'submitted',
        startedAt: new Date(),
        submittedAt: new Date(),
        scaledScore: fraction * 100,
        rawScore: fraction,
        passed: fraction === 1,
        sumMarks: 1,
        gradeOutOf: 100,
        passPercent: 70,
      },
      select: { id: true },
    });
    await prisma.attemptQuestion.create({
      data: {
        attemptId: attempt.id,
        slotPosition: 0,
        questionVersionId: versionId,
        optionOrder: [0, 1],
        maxMark: 1,
        minFraction: 0,
        maxFraction: 1,
        fraction,
        mark: fraction,
        state: fraction === 1 ? 'graded_right' : 'graded_wrong',
        response: { kind: 'choice', optionIds: [optionId] } as Prisma.InputJsonValue,
      },
    });
  }

  /** The fifth answer, through the real start → save → submit. */
  async function submitThrough(service: AttemptService, optionId: string) {
    const started = await service.start(fixture!.studentId, fixture!.quizId);
    await service.saveAnswers(fixture!.studentId, started.attemptId, {
      attemptToken: started.attemptToken,
      seq: 1,
      answers: [{ slotPosition: 0, response: { kind: 'choice', optionIds: [optionId] } }],
    });
    return service.submit(fixture!.studentId, started.attemptId, { attemptToken: started.attemptToken });
  }

  function alertsFor(userId: string) {
    return prisma.notification.findMany({ where: { userId, kind: 'suspect_key' }, select: { payload: true } });
  }

  it('raises exactly one alert for a reversed true/false key, and lists it on the band', async () => {
    const { versionId, right } = await trueFalseQuiz('صح');
    for (let i = 0; i < 4; i += 1) await pastAnswer(versionId, right, 0);

    const result = await submitThrough(attempts, right);
    await keyWatch.idle();

    // The student's paper is marked exactly as the key says — the alert is
    // about the key, it does not touch the marks.
    expect(result.attemptState).toBe('submitted');

    const alerts = await alertsFor(fixture!.adminId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.payload).toMatchObject({ questionVersionId: versionId, picks: 5, answers: 5 });

    // The bell renders it: the quiz, the evidence, the key it contradicts.
    const feed = await notifications.feed(fixture!.adminId, 10);
    const entry = feed.entries.find((row) => row.kind === 'suspect_key');
    expect(entry).toMatchObject({
      kind: 'suspect_key',
      pickedText: 'خطأ',
      keyText: 'صح',
      picks: 5,
      answers: 5,
      quizTitle: 'اختبار',
    });

    const band = await keyWatch.listSuspects();
    expect(band.filter((row) => row.questionVersionId === versionId)).toEqual([
      expect.objectContaining({ pickedText: 'خطأ', keyText: 'صح', picks: 5, answers: 5, edited: false }),
    ]);

    // Another wrong-looking answer on the same version is not a second alert.
    await pastAnswer(versionId, right, 0);
    await keyWatch.checkAttempt((await prisma.quizAttempt.findFirstOrThrow({
      where: { quizId: fixture!.quizId, userId: fixture!.studentId },
      select: { id: true },
    })).id);
    expect(await alertsFor(fixture!.adminId)).toHaveLength(1);
  }, 180_000);

  it('raises nothing when the key is right', async () => {
    const { versionId, right } = await trueFalseQuiz('خطأ');
    for (let i = 0; i < 4; i += 1) await pastAnswer(versionId, right, 1);

    await submitThrough(attempts, right);
    await keyWatch.idle();

    expect(await alertsFor(fixture!.adminId)).toHaveLength(0);
    expect((await keyWatch.listSuspects()).some((row) => row.questionVersionId === versionId)).toBe(false);
  }, 180_000);

  it('still hands the paper in when the notification insert throws, and tries again next time', async () => {
    class BrokenNotifications extends NotificationsService {
      override emitToPermission(): Promise<string[]> {
        return Promise.reject(new Error('notifications table is on fire'));
      }
    }
    const broken = new BrokenNotifications(prisma);
    const brokenWatch = new KeyWatchService(prisma, broken);
    const service = attemptService(broken, brokenWatch);

    const { versionId, right } = await trueFalseQuiz('صح');
    for (let i = 0; i < 4; i += 1) await pastAnswer(versionId, right, 0);

    const result = await submitThrough(service, right);
    await brokenWatch.idle();

    expect(result.attemptState).toBe('submitted');
    const stored = await prisma.quizAttempt.findFirstOrThrow({
      where: { quizId: fixture!.quizId, userId: fixture!.studentId },
      select: { id: true, state: true },
    });
    expect(stored.state).toBe('submitted');

    // Nothing half-written: no alert, and no dedup row claiming one was sent…
    expect(await alertsFor(fixture!.adminId)).toHaveLength(0);
    expect(await prisma.suspectKeyAlert.count({ where: { questionVersionId: versionId } })).toBe(0);

    // …so the next look, with the notifications working, raises it.
    expect(await keyWatch.checkAttempt(stored.id)).toBe(1);
    expect(await alertsFor(fixture!.adminId)).toHaveLength(1);
  }, 180_000);
});
