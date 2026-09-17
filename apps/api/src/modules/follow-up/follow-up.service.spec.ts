// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { FOLLOW_UP_WINDOW_DEFAULT } from '@ayman/contracts/outreach/follow-up';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SettingsService } from '../admin/settings/settings.service';
import { OutreachService } from '../outreach/outreach.service';
import { FollowUpService } from './follow-up.service';

/**
 * The SELECTION is what this file tests, not the wording.
 *
 * `compose.spec.ts` already proves the two new kinds read like a person wrote
 * them. What nothing else can prove is that the right people are in the list —
 * and every assertion below is a way the query was wrong at some point while it
 * was being written:
 *
 *   · a student who watched one of the two lectures was listed (the rule is
 *     ALL of the window, not "at least one");
 *   · a course with a single published quiz could never produce a quiz row,
 *     because the window asked for two and only one existed;
 *   · a lapsed enrollment still counted, because nothing writes `expired` and
 *     the row stays `status: 'active'` forever with only `expiresAt` moving;
 *   · a student with no year on file read as «مشترك في الحتة الغلط», which is
 *     a sentence about somebody the platform never asked.
 */

const SETTINGS = {
  quizResult: true,
  quizNudge: true,
  lessonPraise: true,
  whatsappInvite: true,
  nudgeAfterHours: 24,
  groupInviteEveryDays: 21,
  maxInvitesPerStudent: 4,
  maxPerStudentPerDay: 2,
};

describe('FollowUpService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  const settings = {
    read: async () => ({ outreach: SETTINGS, contact: { whatsappChannel: null } }),
  } as unknown as SettingsService;

  const outreach = new OutreachService(prisma, new NotificationsService(prisma), settings);
  const service = new FollowUpService(prisma, outreach);

  const stamp = Date.now();
  /** Watched nothing at all. The one this screen exists for. */
  let behind = '';
  /** Watched ONE of the two recent lectures — deliberately not listed. */
  let partly = '';
  /** Watched both and sat the quiz. */
  let caughtUp = '';
  /** Enrolled, but the seat lapsed. */
  let lapsed = '';

  let courseId = '';
  let lessonOne = '';
  let lessonTwo = '';
  let quizLessonId = '';
  const enrollments = new Map<string, string>();

  /** Bumped per account: `users.phone_number` is UNIQUE across the whole
   *  table, and the first version of this derived the suffix from the key's
   *  LENGTH — which is 1 for every key, so the second student collided. */
  let phoneSeq = 0;

  async function student(key: string, name: string, year: number | null): Promise<string> {
    const id = `fu-${key}-${stamp}`;
    phoneSeq += 1;
    await prisma.user.create({
      data: {
        id,
        name,
        email: `${id}@t.test`,
        phoneNumber: `+2010${String(stamp).slice(-6)}${String(phoneSeq).padStart(2, '0')}`,
      },
    });
    const governorate = await prisma.governorate.findFirstOrThrow();
    await prisma.studentProfile.create({
      data: {
        userId: id,
        fullName: name,
        gender: 'male',
        phone: `${id}-p`,
        governorateCode: governorate.code,
        year,
      },
    });
    return id;
  }

  beforeAll(async () => {
    await prisma.$connect();

    behind = await student('a', 'طالب واقف', 2);
    partly = await student('b', 'طالب نص نص', 2);
    caughtUp = await student('c', 'طالب لاحق', 2);
    lapsed = await student('d', 'اشتراك خلص', 2);

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `fu-course-${stamp}`,
        title: 'كورس المتابعة',
        status: 'published',
        // `courses_published_has_timestamp` — the database refuses a published
        // course with no publish time, independently of the service layer.
        publishedAt: new Date(),
        systemId: system.id,
        subjectId: subject.id,
        year: 2,
        instructorId: behind,
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1 },
    });

    // Positions 1..3, so the window of two takes lessons 2 and 3 — which is
    // also why `lessonOne` exists: a student who never opened the FIRST
    // lecture must not be listed for it once it has fallen out of the window.
    const [first, second, third] = await Promise.all([
      prisma.lesson.create({
        data: { courseId, sectionId: section.id, title: 'المحاضرة الأولى', kind: 'video', position: 1, isPublished: true },
      }),
      prisma.lesson.create({
        data: { courseId, sectionId: section.id, title: 'المحاضرة التانية', kind: 'video', position: 2, isPublished: true },
      }),
      prisma.lesson.create({
        data: { courseId, sectionId: section.id, title: 'المحاضرة التالتة', kind: 'video', position: 3, isPublished: true },
      }),
    ]);
    lessonOne = first.id;
    lessonTwo = second.id;

    const quizLesson = await prisma.lesson.create({
      data: { courseId, sectionId: section.id, title: 'كويز الوحدة', kind: 'quiz', position: 4, isPublished: true },
    });
    quizLessonId = quizLesson.id;
    await prisma.quiz.create({ data: { lessonId: quizLessonId, reviewOptions: {} } });

    for (const [userId, expiresAt] of [
      [behind, null],
      [partly, null],
      [caughtUp, null],
      [lapsed, new Date(Date.now() - 24 * 60 * 60 * 1000)],
    ] as const) {
      const row = await prisma.enrollment.create({
        data: { userId, courseId, source: 'free', status: 'active', expiresAt },
      });
      enrollments.set(userId, row.id);
    }

    // `partly` finished the LAST lecture only, `caughtUp` finished both.
    await prisma.lessonProgress.createMany({
      data: [
        /*
         * `completedVia` and `completion: 1` are both required by CHECK
         * constraints, not by the client: `lesson_progress_completed_has_source`
         * keeps earned completions separable from claimed ones (see
         * `CompletionSource`), and `lesson_progress_completed_is_full` refuses a
         * completed row that is not actually finished. Worth writing out here
         * rather than hiding in a helper — a fixture that disagrees with the
         * database about what «خلصت» means would test the wrong thing.
         */
        { enrollmentId: enrollments.get(partly)!, lessonId: third.id, state: 'completed', completion: 1, completedAt: new Date(), completedVia: 'auto' },
        { enrollmentId: enrollments.get(caughtUp)!, lessonId: third.id, state: 'completed', completion: 1, completedAt: new Date(), completedVia: 'auto' },
        { enrollmentId: enrollments.get(caughtUp)!, lessonId: lessonTwo, state: 'passed', completion: 1, completedAt: new Date(), completedVia: 'auto' },
      ],
    });
  });

  afterAll(async () => {
    const ids = [behind, partly, caughtUp, lapsed];
    await prisma.conversation.deleteMany({ where: { userId: { in: ids } } });
    await prisma.quizAttempt.deleteMany({ where: { userId: { in: ids } } });
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId: { in: [...enrollments.values()] } } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.quiz.deleteMany({ where: { lessonId: quizLessonId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.studentProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    const ids = [behind, partly, caughtUp, lapsed];
    await prisma.conversation.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  });

  const listed = async () =>
    (await service.atRisk({ courseId, window: FOLLOW_UP_WINDOW_DEFAULT }, 50, 0)).rows;

  /** A submitted sitting — the only state that counts as «حلّ الكويز». */
  async function sitQuiz(userId: string): Promise<void> {
    const quiz = await prisma.quiz.findFirstOrThrow({ where: { lessonId: quizLessonId } });
    await prisma.quizAttempt.create({
      data: {
        quizId: quiz.id,
        userId,
        attemptNo: 1,
        state: 'submitted',
        submittedAt: new Date(),
        sumMarks: 10,
        gradeOutOf: 10,
        passPercent: 70,
      },
    });
  }

  describe('atRisk', () => {
    it('lists the student who touched neither of the last two lectures', async () => {
      const row = (await listed()).find((candidate) => candidate.userId === behind);
      expect(row).toBeDefined();
      expect(row!.missedLessons.map((item) => item.title).sort()).toEqual(
        ['المحاضرة التالتة', 'المحاضرة التانية'].sort(),
      );
    });

    it('never names a lecture that has fallen out of the window', async () => {
      // Nobody opened «المحاضرة الأولى» either, and it is not this screen's
      // business — «آخر محاضرتين» is a rule about the tail of the outline.
      for (const row of await listed()) {
        expect(row.missedLessons.map((item) => item.id)).not.toContain(lessonOne);
      }
    });

    it('leaves out a student who watched one of the two and sat the paper', async () => {
      /*
       * The rule that keeps this screen openable. «فاته واحدة من اتنين» is most
       * of a cohort most weeks; «فاتته الاتنين» is a much smaller, much truer
       * list, and it is what the instructor actually asked for.
       *
       * `partly` has to sit the quiz for this assertion to be about lectures at
       * all — otherwise the unsat paper alone puts them in the list, which is
       * correct and is the next test's subject.
       */
      await sitQuiz(partly);
      const rows = await listed();
      expect(rows.map((row) => row.userId)).not.toContain(partly);
      await prisma.quizAttempt.deleteMany({ where: { userId: partly } });
    });

    it('still names a single missed lecture once something else has listed the student', async () => {
      /*
       * ⚠️ The «كل المحاضرات» rule decides WHO is listed, not WHAT the message
       * names. `partly` is here because of the unsat paper; once they are here,
       * the lecture they genuinely skipped is named too. Hiding it would mean
       * writing «الكويز لسه فاضي» to somebody who also missed a lecture and
       * saying nothing about it — an incomplete message rather than a shorter
       * one.
       */
      const row = (await listed()).find((candidate) => candidate.userId === partly);
      expect(row).toBeDefined();
      expect(row!.missedLessons.map((item) => item.title)).toEqual(['المحاضرة التانية']);
      expect(row!.missedQuizzes.map((item) => item.title)).toEqual(['كويز الوحدة']);
    });

    it('lists an unsat quiz even though only one exists and the window asks for two', async () => {
      const row = (await listed()).find((candidate) => candidate.userId === caughtUp);
      expect(row).toBeDefined();
      expect(row!.missedQuizzes.map((item) => item.title)).toEqual(['كويز الوحدة']);
      expect(row!.missedLessons).toEqual([]);
    });

    it('leaves out a seat that has expired, however the status column reads', async () => {
      /*
       * Nothing in this platform writes `expired` — a lapsed subscription
       * leaves `status: 'active'` and moves `expiresAt` only. A selection that
       * trusted the status alone would chase people who no longer have access
       * to the lectures it is naming.
       */
      const rows = await listed();
      expect(rows.map((row) => row.userId)).not.toContain(lapsed);
    });
  });

  describe('sendFollowUp', () => {
    it('writes one message naming exactly what the screen showed', async () => {
      const outcome = await service.sendFollowUp(behind, courseId, FOLLOW_UP_WINDOW_DEFAULT);
      expect(outcome).toBe('sent');

      const message = await prisma.conversationMessage.findFirstOrThrow({
        where: { conversation: { userId: behind } },
      });
      expect(message.body).toContain('المحاضرة التانية');
      expect(message.body).toContain('المحاضرة التالتة');
      // Not in the window, so not in the message — the same assertion as the
      // selection test, made where the student can actually read it.
      expect(message.body).not.toContain('المحاضرة الأولى');
    });

    it('does not write twice about the same set', async () => {
      await service.sendFollowUp(behind, courseId, FOLLOW_UP_WINDOW_DEFAULT);
      const second = await service.sendFollowUp(behind, courseId, FOLLOW_UP_WINDOW_DEFAULT);
      expect(second).toBe('duplicate');
    });

    it('reports a student who is no longer in the selection rather than inventing one', async () => {
      const outcome = await service.sendFollowUp(lapsed, courseId, FOLLOW_UP_WINDOW_DEFAULT);
      expect(outcome).toBe('not-listed');
      expect(await prisma.conversation.count({ where: { userId: lapsed } })).toBe(0);
    });
  });

  describe('idle', () => {
    it('never calls a student with no year on file «مشترك في الحتة الغلط»', async () => {
      /*
       * `behind` has a year and a seat in a course of that year, so they are
       * out either way. The row that matters is a student WITH a seat and
       * WITHOUT a year: the platform never asked, so it may not conclude the
       * course is wrong for them. Asserted through `reason`, which is the
       * field that would carry the accusation.
       */
      const noYear = await student('e', 'من غير سنة', null);
      await prisma.enrollment.create({
        data: { userId: noYear, courseId, source: 'free', status: 'active' },
      });

      const { rows } = await service.idle({}, 500, 0);
      expect(rows.find((row) => row.userId === noYear)).toBeUndefined();

      await prisma.enrollment.deleteMany({ where: { userId: noYear } });
      await prisma.studentProfile.deleteMany({ where: { userId: noYear } });
      await prisma.user.delete({ where: { id: noYear } });
    });
  });
});
