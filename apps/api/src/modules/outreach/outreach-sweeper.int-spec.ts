import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { OutreachSettings } from '@ayman/contracts/admin/settings';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { NotificationsRealtimeService } from '../notifications/notifications-realtime.service';
import type { SettingsService } from '../admin/settings/settings.service';
import { OutreachService, type DeliveryContext } from './outreach.service';
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
  maxInvitesPerStudent: 4,
  maxPerStudentPerDay: 5,
};

const HOUR = 60 * 60 * 1000;

describe('OutreachSweeper (real database)', () => {
  let prisma: PrismaService;
  let sweeper: OutreachSweeper;
  let outreachService: OutreachService;

  const settings = {
    read: async () => ({ outreach: SETTINGS, contact: { whatsappChannel: null } }),
  } as unknown as SettingsService;

  let studentId = '';
  let adminId = '';
  /** Holds the backdated ledger row that sets the activation floor. */
  let sentinelId = '';
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
          /*
           * Slots 0 and 1, because that is what a real attempt holds —
           * `AttemptService` writes `slotPosition: index`. The fixture used to
           * start at 1, which made it agree with the message body only while
           * the body printed the raw index; the assertions below say «سؤال 1»
           * for the MISSED question either way, so the fix is the fixture
           * being honest rather than the expectation being moved.
           */
          create: [
            {
              slotPosition: 0,
              questionVersionId: version.id,
              optionOrder: [0, 1],
              maxMark: 1,
              minFraction: 0,
              maxFraction: 1,
              state: 'graded_wrong',
            },
            {
              slotPosition: 1,
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

    /*
      A stub realtime fan-out. This suite is about what the sweeper WRITES, and
      the live stream is a delivery optimisation on top of those rows — wiring
      a real Redis subscriber into an integration test would add a second
      service to keep alive and prove nothing the notification rows do not
      already prove.
    */
    const realtime = {
      publish: async () => undefined,
      subscribe: () => () => undefined,
    } as unknown as NotificationsRealtimeService;
    outreachService = new OutreachService(
      prisma,
      new NotificationsService(prisma, realtime),
      settings,
    );
    sweeper = new OutreachSweeper(prisma, outreachService);

    adminId = randomUUID();
    studentId = randomUUID();
    sentinelId = randomUUID();
    await prisma.user.createMany({
      data: [
        { id: adminId, name: 'Sweep Admin', email: `${adminId}@example.test`, role: 'admin' },
        { id: sentinelId, name: 'Sweep Sentinel', email: `${sentinelId}@example.test`, role: 'student' },
        {
          id: studentId,
          name: 'سيف الدين حسن',
          email: `${studentId}@example.test`,
          role: 'student',
          /*
           * BACKDATED, so the invite tests can find this student at all.
           *
           * `inviteCandidates` orders by `createdAt asc` and stops at
           * `INVITE_SCAN` — which is right in production (the pass advances
           * through the population as people are filtered out) and fatal for a
           * fixture created a moment ago on a database that already holds
           * hundreds of seeded students: it sorts last and falls off the end,
           * so every "is this student a candidate" assertion answers "no" for
           * a reason that has nothing to do with what is being tested.
           */
          createdAt: new Date('2020-01-01T00:00:00Z'),
        },
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

    /*
     * ⚠️ THE LEDGER IS EMPTIED FIRST, and it has to be.
     *
     * `activationFloor()` is derived from the OLDEST row on the WHOLE
     * platform — that is the correct rule and it is what makes the day-one
     * backfill impossible — but it also means any leftover row from another
     * run silently moves the floor and decides the outcome of every case
     * below. Only ledger rows go; the conversations they point at are left
     * alone, so nothing a person could read is destroyed.
     */
    await prisma.outreachMessage.deleteMany({});

    /*
     * THE ACTIVATION FLOOR, pinned a year back.
     *
     * `activationFloor()` derives "how far back may we write about" from the
     * OLDEST ledger row on the whole platform, so on a fresh CI database it
     * would be twenty minutes ago and every case below that backdates an
     * attempt would be filtered out for a reason that is not what it is
     * testing. One backdated row on a throwaway account pins it, and the
     * floor's own behaviour gets its own tests further down.
     *
     * On the SENTINEL and not on `studentId`: it must not count towards the
     * fixture student's own invite tally or show up in `bodiesFor`.
     */
    await outreachService.deliver(
      { userId: sentinelId, kind: 'whatsapp_invite', dedupeKey: 'floor-anchor', facts: { kind: 'whatsapp_invite' } },
      { settings: SETTINGS, whatsappUrl: 'https://whatsapp.com/channel/anchor' },
    );
    await prisma.outreachMessage.updateMany({
      where: { userId: sentinelId },
      data: { createdAt: new Date(Date.now() - 365 * 24 * HOUR) },
    });
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { userId: { in: [studentId, sentinelId] } } });
    await prisma.quizAttempt.deleteMany({ where: { userId: studentId } });
    await prisma.enrollment.deleteMany({ where: { userId: studentId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    // Entries first: `question_bank_entries.category_id` is RESTRICT, so the
    // category cannot go while one still points at it. Versions cascade with
    // the entry.
    await prisma.questionBankEntry.deleteMany({ where: { categoryId } });
    await prisma.questionCategory.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, adminId, sentinelId] } } });
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

  describe('the activation floor', () => {
    /** Puts the anchor row back where `beforeAll` left it. */
    async function pinFloor(at: Date): Promise<void> {
      await prisma.outreachMessage.updateMany({
        where: { userId: sentinelId },
        data: { createdAt: at },
      });
    }

    afterEach(async () => {
      await prisma.quizAttempt.deleteMany({ where: { userId: studentId } });
      await prisma.outreachMessage.deleteMany({ where: { userId: studentId } });
    });

    it('never writes about a paper sat before the platform could write about it', async () => {
      /*
       * THE DAY-ONE BACKFILL, which is what this whole mechanism exists to
       * stop. The slow pass looks back seven days — right on a platform that
       * has been running for months, a disaster on the first sweep after a
       * deploy: every student who sat anything that week gets «نتيجتك نزلت»
       * about a paper from six days ago, all within a couple of hours, and
       * every one of those messages is a lie about when it was written.
       *
       * The fixture's floor is pinned a year back, so this test moves it
       * forward instead: with the anchor row dated an hour ago, a paper sat
       * two hours ago predates activation and must be left alone.
       */
      await pinFloor(new Date(Date.now() - 1 * HOUR));
      await gradedAttempt(new Date(Date.now() - 2 * HOUR), 'submitted');

      await sweeper.sweepSlow();
      expect(await bodiesFor('quiz_result')).toEqual([]);

      // …and the same paper IS written about once the floor is behind it, so
      // the skip above is the floor and not something else about the fixture.
      await pinFloor(new Date(Date.now() - 365 * 24 * HOUR));
      await sweeper.sweepSlow();
      expect(await bodiesFor('quiz_result')).toHaveLength(1);
    });

    it('sits twenty minutes behind the first message ever sent', async () => {
      const anchorAt = new Date(Date.now() - 3 * HOUR);
      await pinFloor(anchorAt);

      // Twenty minutes — the cold-start window — because that first message
      // was itself only ever allowed to be about something inside it, so
      // nothing earlier was reachable then either.
      const floor = await sweeper.activationFloor();
      expect(floor.getTime()).toBe(anchorAt.getTime() - 20 * 60 * 1000);
    });

    it('lets nothing through but the last twenty minutes on a platform that has sent nothing', async () => {
      // The genuine cold start: a fresh deployment, an empty ledger. Only a
      // paper sat in the last twenty minutes may be written about.
      await prisma.outreachMessage.deleteMany({});
      expect(await prisma.outreachMessage.count()).toBe(0);

      const floor = await sweeper.activationFloor();
      expect(Date.now() - floor.getTime()).toBeGreaterThanOrEqual(20 * 60 * 1000);
      expect(Date.now() - floor.getTime()).toBeLessThan(21 * 60 * 1000);

      await gradedAttempt(new Date(Date.now() - 3 * HOUR), 'submitted');
      await sweeper.sweepSlow();
      expect(await bodiesFor('quiz_result')).toEqual([]);

      // Put the anchor back for whatever runs next — this case is the only one
      // that empties the table, and every other one depends on the floor being
      // far behind.
      await outreachService.deliver(
        { userId: sentinelId, kind: 'whatsapp_invite', dedupeKey: 'floor-anchor-2', facts: { kind: 'whatsapp_invite' } },
        { settings: SETTINGS, whatsappUrl: 'https://whatsapp.com/channel/anchor' },
      );
      await pinFloor(new Date(Date.now() - 365 * 24 * HOUR));
    });
  });

  describe('the WhatsApp channel', () => {
    /*
     * These test `inviteCandidates`, NOT `sendChannelInvites`, and the
     * difference is the whole reason they are trustworthy.
     *
     * The send path stops after twenty messages and orders by `createdAt asc`,
     * so a fixture account created a moment ago sorts last on any database with
     * real students in it — meaning "nobody was messaged" is what you get
     * whether the filters work or the student was simply never reached. Both
     * gates below were first written that way and both were FALSE GREENS.
     *
     * Asking the candidate list instead is exact, and writes nothing: no
     * conversations to twenty unrelated seeded accounts as a side effect of
     * checking a predicate.
     */
    const CHANNEL = 'https://whatsapp.com/channel/test';

    function context(overrides: Partial<OutreachSettings> = {}): DeliveryContext {
      return { settings: { ...SETTINGS, ...overrides }, whatsappUrl: CHANNEL };
    }

    async function profile(whatsappOpenedAt: Date | null): Promise<void> {
      const governorate = await prisma.governorate.findFirstOrThrow();
      await prisma.studentProfile.upsert({
        where: { userId: studentId },
        create: {
          userId: studentId,
          fullName: 'سيف الدين حسن',
          gender: 'male',
          phone: `010${String(Date.now()).slice(-8)}`,
          governorateCode: governorate.code,
          whatsappOpenedAt,
        },
        update: { whatsappOpenedAt },
      });
    }

    afterEach(async () => {
      await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
    });

    it('offers nobody anything when no channel link is configured', async () => {
      // `composeOutreach` would omit the link and leave a message whose entire
      // subject is a channel it cannot point at — the same failure the footer's
      // bare `https://wa.me/` shipped once.
      await expect(
        sweeper.inviteCandidates({ settings: SETTINGS, whatsappUrl: null }),
      ).resolves.toEqual([]);
    });

    it('includes a student who has never pressed', async () => {
      await profile(null);
      expect(await sweeper.inviteCandidates(context())).toContain(studentId);
    });

    it('includes a student who has not finished onboarding at all', async () => {
      // No profile row. `studentProfile: { whatsappOpenedAt: null }` on its own
      // renders as an EXISTS and would silently drop every one of these.
      await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
      expect(await sweeper.inviteCandidates(context())).toContain(studentId);
    });

    it('drops a student the moment they press the link', async () => {
      await profile(new Date());
      expect(await sweeper.inviteCandidates(context())).not.toContain(studentId);
    });

    it('drops a student who has hit the lifetime cap', async () => {
      await profile(null);
      expect(await sweeper.inviteCandidates(context({ maxInvitesPerStudent: 1 }))).toContain(
        studentId,
      );

      // One invitation, sent long enough ago that the every-N-days gate cannot
      // be what stops the second one.
      await outreachService.deliver(
        { userId: studentId, kind: 'whatsapp_invite', dedupeKey: 'cap-test', facts: { kind: 'whatsapp_invite' } },
        context({ maxInvitesPerStudent: 1 }),
      );
      await prisma.outreachMessage.updateMany({
        where: { userId: studentId, kind: 'whatsapp_invite' },
        data: { createdAt: new Date(Date.now() - 365 * 24 * HOUR) },
      });

      expect(await sweeper.inviteCandidates(context({ maxInvitesPerStudent: 1 }))).not.toContain(
        studentId,
      );
      // …and raising the cap lets it through again, so the gate is the COUNT
      // and not something else that happened to change.
      expect(await sweeper.inviteCandidates(context({ maxInvitesPerStudent: 2 }))).toContain(
        studentId,
      );
    });
  });
});
