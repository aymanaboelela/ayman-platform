import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { OutreachSettings } from '@ayman/contracts/admin/settings';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SettingsService } from '../admin/settings/settings.service';
import { OutreachService } from './outreach.service';
import { OutreachSweeper } from './outreach-sweeper.service';

/**
 * The sweeper's QUERIES, against a real database.
 *
 * ## Why these are worth an integration test and the composer is not
 *
 * `compose.spec.ts` covers the words and `outreach.service.spec.ts` covers the
 * write. What neither can reach is the half that decides WHO gets a message,
 * and that half is four Prisma predicates over five tables — the shape of code
 * that typechecks, passes review, returns zero rows in production, and fails
 * completely silently. Nobody would ever see an error; students would simply
 * never hear from anybody.
 *
 * ## Every case here is a way the platform could say something false
 *
 * A student nudged about a quiz they already sat. A message about a paper still
 * awaiting an essay mark, quoting a score that is not final. Praise for a lesson
 * that has a quiz they never opened. Those are not edge cases — they are the
 * normal states of a live course, and each is one wrong clause away.
 */

const SETTINGS: OutreachSettings = {
  quizResult: true,
  quizNudge: true,
  lessonPraise: true,
  whatsappInvite: true,
  nudgeAfterHours: 24,
  groupInviteEveryDays: 21,
  maxPerStudentPerDay: 5,
};

const HOUR = 60 * 60 * 1000;

describe('OutreachSweeper (real database)', () => {
  let prisma: PrismaService;
  let sweeper: OutreachSweeper;

  const settings = {
    read: async () => ({ outreach: SETTINGS, contact: { whatsappGroup: null } }),
  } as unknown as SettingsService;

  let studentId = '';
  let adminId = '';
  let courseId = '';
  /** Video lesson with a published quiz. */
  let quizLessonId = '';
  let quizId = '';
  /** Lesson with no quiz at all. */
  let plainLessonId = '';
  let enrollmentId = '';
  let categoryId = '';

  async function bodiesFor(kind: string): Promise<string[]> {
    const rows = await prisma.outreachMessage.findMany({
      where: { userId: studentId, kind: kind as never },
      select: { message: { select: { body: true } } },
    });
    return rows.map((row) => row.message.body);
  }

  /** Wipes everything the sweeper could have written, between cases. */
  async function reset(): Promise<void> {
    await prisma.conversation.deleteMany({ where: { userId: studentId } });
    await prisma.notification.deleteMany({ where: { userId: studentId } });
  }

  /** A graded attempt with one wrong answer and one right one. */
  async function gradedAttempt(submittedAt: Date, state: 'submitted' | 'pending_review') {
    const version = await prisma.questionVersion.findFirstOrThrow({
      where: { bankEntry: { categoryId } },
      select: { id: true },
    });

    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId,
        userId: studentId,
        attemptNo: Math.floor(Math.random() * 1_000_000),
        state,
        submittedAt,
        sumMarks: 2,
        gradeOutOf: 100,
        passPercent: 50,
        scaledScore: 50,
        passed: true,
        questions: {
          create: [
            {
              slotPosition: 1,
              questionVersionId: version.id,
              optionOrder: [0, 1],
              maxMark: 1,
              minFraction: 0,
              maxFraction: 1,
              state: 'graded_wrong',
            },
            {
              slotPosition: 2,
              questionVersionId: version.id,
              optionOrder: [0, 1],
              maxMark: 1,
              minFraction: 0,
              maxFraction: 1,
              state: 'graded_right',
            },
          ],
        },
      },
      select: { id: true },
    });
    return attempt.id;
  }

  /** Marks a lesson finished `hoursAgo` hours ago. */
  async function completeLesson(lessonId: string, hoursAgo: number): Promise<void> {
    const completedAt = new Date(Date.now() - hoursAgo * HOUR);
    await prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      // `completed_via` is NOT optional beside `completed_at` — a CHECK
      // constraint ties the two, so that an earned completion stays separable
      // from a claimed one forever.
      create: {
        enrollmentId,
        lessonId,
        state: 'completed',
        completion: 1,
        completedAt,
        completedVia: 'auto',
      },
      update: { state: 'completed', completedAt, completion: 1, completedVia: 'auto' },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const outreach = new OutreachService(prisma, new NotificationsService(prisma), settings);
    sweeper = new OutreachSweeper(prisma, outreach);

    adminId = randomUUID();
    studentId = randomUUID();
    await prisma.user.createMany({
      data: [
        { id: adminId, name: 'Sweep Admin', email: `${adminId}@example.test`, role: 'admin' },
        { id: studentId, name: 'سيف الدين حسن', email: `${studentId}@example.test`, role: 'student' },
      ],
    });

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `outreach-sweep-${randomUUID()}`,
        title: 'كورس رسايل',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: adminId,
      },
    });
    courseId = course.id;
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'وحدة', position: 0, isPublished: true },
    });

    const quizLesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'الحلقات التكرارية', kind: 'quiz', position: 0, isPublished: true },
    });
    quizLessonId = quizLesson.id;
    const quiz = await prisma.quiz.create({
      data: { lessonId: quizLessonId, isPublished: true, reviewOptions: {}, gradeOutOf: 100 },
    });
    quizId = quiz.id;

    const plainLesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'تاريخ الحاسب', kind: 'text', position: 1, isPublished: true },
    });
    plainLessonId = plainLesson.id;
    await prisma.lessonText.create({ data: { lessonId: plainLessonId, bodyHtml: '<p>ن</p>' } });

    const category = await prisma.questionCategory.create({
      data: { name: 'الحلقات المتداخلة', ownerScope: 'global' },
    });
    categoryId = category.id;
    const entry = await prisma.questionBankEntry.create({
      data: { categoryId, ownerId: adminId },
    });
    await prisma.questionVersion.create({
      data: {
        bankEntryId: entry.id,
        version: 1,
        status: 'ready',
        type: 'mcq_single',
        stemHtml: '<p>سؤال</p>',
        createdBy: adminId,
      },
    });

    const enrollment = await prisma.enrollment.create({ data: { userId: studentId, courseId } });
    enrollmentId = enrollment.id;
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { userId: studentId } });
    await prisma.quizAttempt.deleteMany({ where: { userId: studentId } });
    await prisma.enrollment.deleteMany({ where: { userId: studentId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    // Entries first: `question_bank_entries.category_id` is RESTRICT, so the
    // category cannot go while one still points at it. Versions cascade with
    // the entry.
    await prisma.questionBankEntry.deleteMany({ where: { categoryId } });
    await prisma.questionCategory.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, adminId] } } });
    await prisma.$disconnect();
  });

  afterEach(reset);

  describe('quiz results', () => {
    afterEach(async () => {
      await prisma.quizAttempt.deleteMany({ where: { userId: studentId } });
    });

    it('writes about a paper that was just graded, naming the topic missed', async () => {
      await gradedAttempt(new Date(Date.now() - 60_000), 'submitted');

      expect(await sweeper.sweepResults()).toBeGreaterThanOrEqual(1);

      const [body] = await bodiesFor('quiz_result');
      expect(body).toContain('سيف');
      expect(body).toContain('الحلقات التكرارية');
      // The topic and the question NUMBER — never the stem. A question echoed
      // into a chat message is readable without passing the review window
      // `AttemptService.review` resolves.
      expect(body).toContain('الحلقات المتداخلة');
      expect(body).toContain('سؤال 1');
      expect(body).not.toContain('سؤال 2');
    });

    it('says nothing about a paper still waiting on an essay mark', async () => {
      /*
       * `pending_review` has no final score. A message quoting the auto-graded
       * half of it would tell the student a number that is about to change —
       * wrong in the one way this feature cannot afford.
       */
      await gradedAttempt(new Date(Date.now() - 60_000), 'pending_review');

      await sweeper.sweepResults();
      expect(await bodiesFor('quiz_result')).toEqual([]);
    });

    it('writes exactly once however many times it sweeps', async () => {
      await gradedAttempt(new Date(Date.now() - 60_000), 'submitted');

      await sweeper.sweepResults();
      await sweeper.sweepResults();
      await sweeper.sweepResults();

      expect(await bodiesFor('quiz_result')).toHaveLength(1);
    });

    it('the hourly pass still catches a paper the fast one missed', async () => {
      // Six hours old: outside the 20-minute window, inside the seven-day one.
      // This is the outage case, and the late-marked-essay case.
      await gradedAttempt(new Date(Date.now() - 6 * HOUR), 'submitted');

      expect(await sweeper.sweepResults()).toBe(0);
      await sweeper.sweepSlow();
      expect(await bodiesFor('quiz_result')).toHaveLength(1);
    });
  });

  describe('the quiz nobody opened', () => {
    afterEach(async () => {
      await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
      await prisma.quizAttempt.deleteMany({ where: { userId: studentId } });
    });

    it('nudges a student who watched the lesson and left the quiz', async () => {
      await completeLesson(quizLessonId, 30);

      await sweeper.sweepSlow();

      const [body] = await bodiesFor('quiz_nudge');
      expect(body).toContain('الحلقات التكرارية');
    });

    it('waits out the configured delay', async () => {
      // Two hours in, against a 24-hour setting. A student who finished the
      // video ten minutes ago is very likely still on the page.
      await completeLesson(quizLessonId, 2);

      await sweeper.sweepSlow();
      expect(await bodiesFor('quiz_nudge')).toEqual([]);
    });

    it('never nudges someone who already sat the paper', async () => {
      /*
       * The failure this prevents is the one that would embarrass him most:
       * «روح حلّ الكويز» to a student who sat it yesterday. `state: 'completed'`
       * alone does not rule it out — grading writes `passed`/`failed` to
       * lesson_progress, but an attempt still IN PROGRESS leaves the row at
       * `completed` with a real attempt behind it.
       */
      await completeLesson(quizLessonId, 30);
      await prisma.quizAttempt.create({
        data: {
          quizId,
          userId: studentId,
          attemptNo: 900_001,
          state: 'in_progress',
          sumMarks: 2,
          gradeOutOf: 100,
          passPercent: 50,
        },
      });

      await sweeper.sweepSlow();
      expect(await bodiesFor('quiz_nudge')).toEqual([]);
    });
  });

  describe('a lesson with nothing to sit', () => {
    afterEach(async () => {
      await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    });

    it('says well done, and asks for nothing', async () => {
      await completeLesson(plainLessonId, 2);

      await sweeper.sweepSlow();

      const [body] = await bodiesFor('lesson_praise');
      expect(body).toContain('تاريخ الحاسب');
    });

    it('never praises a lesson that has a quiz waiting', async () => {
      // Both rules fire on the same fact — a finished lesson — and only one is
      // right. Praising a lesson whose quiz is untouched would congratulate a
      // student for stopping halfway.
      await completeLesson(quizLessonId, 2);

      await sweeper.sweepSlow();
      expect(await bodiesFor('lesson_praise')).toEqual([]);
    });
  });

  describe('the WhatsApp group', () => {
    it('invites nobody when no group link is configured', async () => {
      /*
       * `composeOutreach` would omit the link and leave a message whose entire
       * subject is a group it cannot point at — the same failure
       * `WhatsappChannelCard` records the footer having shipped once, where
       * every student who tapped it landed on WhatsApp's own front page.
       *
       * ⚠️ This is the ONLY group case swept here, deliberately. The invite
       * pass is the one sweep whose candidate set is EVERY ENROLLED STUDENT
       * rather than the fixture's own, so running it with a link configured
       * would write a real conversation to every seeded account on whatever
       * database the suite is pointed at. What that pass would prove — that a
       * configured link reaches the message — is already held by
       * `outreach.service.spec.ts` (delivery) and `compose.spec.ts` (the link
       * line), neither of which needs a population to run against.
       */
      await sweeper.sweepSlow();
      expect(await bodiesFor('whatsapp_invite')).toEqual([]);
    });
  });
});
