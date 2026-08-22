// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { DashboardSchema } from '@ayman/contracts/progress';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { DashboardService } from './dashboard.service';
import { EmptyScoreFeed } from './score-feed';

describe('DashboardService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new DashboardService(prisma, new LessonGateService(prisma), new EmptyScoreFeed());

  let userId = '';
  let strangerId = '';
  let instructorId = '';
  let courseId = '';
  let courseSlug = '';
  let enrollmentId = '';
  let videoLessonId = '';
  let secondLessonId = '';
  let examLessonId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();
    courseSlug = `db-course-${stamp}`;

    userId = (
      await prisma.user.create({
        data: { id: `db-${stamp}`, name: 'طالب', email: `db-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `dbs-${stamp}`, name: 'غريب', email: `dbs-${stamp}@t.test` },
      })
    ).id;
    instructorId = (
      await prisma.user.create({
        data: { id: `dbi-${stamp}`, name: 'مُحاضر', email: `dbi-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    courseId = (
      await prisma.course.create({
        data: {
          slug: courseSlug,
          title: 'كورس البرمجة',
          status: 'published',
          publishedAt: new Date(),
          systemId: system.id,
          year: 2,
          subjectId: subject.id,
          instructorId,
        },
      })
    ).id;
    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });

    videoLessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'الدرس الأول',
          kind: 'video',
          position: 1,
          isPublished: true,
          video: {
            create: { provider: 'youtube', externalId: 'dQw4w9WgXcQ', durationSeconds: 600 },
          },
        },
      })
    ).id;
    secondLessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'الدرس الثاني',
          kind: 'text',
          position: 2,
          isPublished: true,
        },
      })
    ).id;

    examLessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'امتحان الكورس',
          kind: 'quiz',
          position: 3,
          isPublished: true,
        },
      })
    ).id;
    await prisma.course.update({ where: { id: courseId }, data: { examLessonId } });

    enrollmentId = (
      await prisma.enrollment.create({
        data: { userId, courseId, source: 'free', status: 'active' },
      })
    ).id;
  });

  afterEach(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: null, progressPercent: 0 },
    });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId, instructorId] } } });
    await prisma.$disconnect();
  });

  it('matches the shared contract exactly', async () => {
    const dashboard = await service.forUser(userId);
    expect(() => DashboardSchema.parse(dashboard)).not.toThrow();
  });

  it('returns an empty dashboard for a student with no enrollments', async () => {
    const dashboard = await service.forUser(strangerId);
    expect(dashboard.enrolledCourses).toEqual([]);
    expect(dashboard.continueWatching).toBeNull();
    expect(dashboard.recentScores).toEqual([]);
  });

  it('has nothing to continue before any lesson is opened', async () => {
    const dashboard = await service.forUser(userId);
    expect(dashboard.enrolledCourses).toHaveLength(1);
    expect(dashboard.continueWatching).toBeNull();
  });

  it('resumes at last_lesson_id with the remaining video time', async () => {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: videoLessonId, progressPercent: 25 },
    });
    await prisma.lessonProgress.create({
      data: {
        enrollmentId,
        lessonId: videoLessonId,
        state: 'in_progress',
        watchedSeconds: 120,
        maxPositionSeconds: 150,
        openCount: 1,
      },
    });

    const dashboard = await service.forUser(userId);

    expect(dashboard.continueWatching?.lessonId).toBe(videoLessonId);
    expect(dashboard.continueWatching?.courseSlug).toBe(courseSlug);
    expect(dashboard.continueWatching?.progressPercent).toBe(25);
    expect(dashboard.continueWatching?.remainingSeconds).toBe(450); // 600 - 150
  });

  it('reports zero remaining for a non-video resume point', async () => {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: secondLessonId },
    });

    const dashboard = await service.forUser(userId);
    expect(dashboard.continueWatching?.lessonKind).toBe('text');
    expect(dashboard.continueWatching?.remainingSeconds).toBe(0);
  });

  it('counts completed lessons per course', async () => {
    await prisma.lessonProgress.createMany({
      data: [
        {
          enrollmentId,
          lessonId: videoLessonId,
          completion: 1,
          state: 'completed',
          completedAt: new Date(),
          completedVia: 'auto',
        },
        { enrollmentId, lessonId: secondLessonId, state: 'in_progress' },
      ],
    });

    const dashboard = await service.forUser(userId);
    const course = dashboard.enrolledCourses[0];

    expect(course?.completedLessons).toBe(1);
    expect(course?.totalLessons).toBe(2);
  });

  it('drops a stale last_lesson_id that now points at an unpublished lesson', async () => {
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { lastLessonId: videoLessonId },
    });
    await prisma.lesson.update({ where: { id: videoLessonId }, data: { isPublished: false } });

    const dashboard = await service.forUser(userId);
    // Unpublishing a lesson must not strand a student on a dead resume link.
    expect(dashboard.continueWatching).toBeNull();

    await prisma.lesson.update({ where: { id: videoLessonId }, data: { isPublished: true } });
  });

  describe('pendingExams', () => {
    it('reports nothing while a lecture is still outstanding', async () => {
      const dashboard = await service.forUser(userId);
      expect(dashboard.pendingExams).toEqual([]);
    });

    it('surfaces the exam once every lecture is cleared and it has not been opened', async () => {
      await prisma.lessonProgress.createMany({
        data: [
          { enrollmentId, lessonId: videoLessonId, state: 'completed', completion: 1 },
          { enrollmentId, lessonId: secondLessonId, state: 'completed', completion: 1 },
        ],
      });

      const dashboard = await service.forUser(userId);

      expect(dashboard.pendingExams).toEqual([
        expect.objectContaining({ courseId, courseSlug, lessonId: examLessonId }),
      ]);
    });

    /**
     * A failed sitting with its improvement attempt still unspent resolves
     * to the exact same `available` gate as an exam nobody has opened —
     * `resolveGate` only distinguishes `cleared` from everything else. This
     * is the case `pendingExams` must NOT show: it belongs to «امتحاناتك»
     * and its «ادخل امتحان التحسين» chip, not to this list twice over.
     */
    it('drops off once the exam itself has been attempted, even on a fail', async () => {
      await prisma.lessonProgress.createMany({
        data: [
          { enrollmentId, lessonId: videoLessonId, state: 'completed', completion: 1 },
          { enrollmentId, lessonId: secondLessonId, state: 'completed', completion: 1 },
          { enrollmentId, lessonId: examLessonId, state: 'failed', completion: 1 },
        ],
      });

      const dashboard = await service.forUser(userId);
      expect(dashboard.pendingExams).toEqual([]);
    });

    it('drops off once the exam is passed', async () => {
      await prisma.lessonProgress.createMany({
        data: [
          { enrollmentId, lessonId: videoLessonId, state: 'completed', completion: 1 },
          { enrollmentId, lessonId: secondLessonId, state: 'completed', completion: 1 },
          { enrollmentId, lessonId: examLessonId, state: 'passed', completion: 1 },
        ],
      });

      const dashboard = await service.forUser(userId);
      expect(dashboard.pendingExams).toEqual([]);
    });
  });

  /**
   * A course the instructor has taken down while the student is enrolled.
   *
   * The `where` used to carry `course: { status: 'published' }`, so the course
   * disappeared off «كورساتي» and out of the rail with no word — while `/path`,
   * which had no filter at all, went on drawing it as a run of links that every
   * one 404'd. Two screens, two different wrong answers about one course.
   *
   * These assert the CONSEQUENCES rather than the field: the course is still
   * reported, and nothing anywhere offers a way into it.
   */
  describe('a course unpublished under an enrolled student', () => {
    afterEach(async () => {
      await prisma.course.update({ where: { id: courseId }, data: { status: 'published' } });
    });

    it('keeps reporting the course rather than dropping it from the payload', async () => {
      await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });

      const dashboard = await service.forUser(userId);
      const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);

      expect(course).toBeDefined();
      expect(course?.published).toBe(false);
    });

    it('offers no resume target on the card, so «نكمّل» cannot point into a refusal', async () => {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { lastLessonId: videoLessonId },
      });
      await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });

      const dashboard = await service.forUser(userId);

      expect(
        dashboard.enrolledCourses.find((entry) => entry.id === courseId)?.lastLessonId,
      ).toBeNull();
    });

    /**
     * «نكمّل من مكانك» is the biggest card on the dashboard and the one the
     * page is organised around. Resolving it into a closed course would put a
     * link to a 404 at the top of the screen.
     */
    it('does not resume into a closed course', async () => {
      await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { lastLessonId: videoLessonId },
      });
      await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });

      expect((await service.forUser(userId)).continueWatching).toBeNull();
    });

    it('treats an archived course as closed too, not only a draft', async () => {
      await prisma.course.update({ where: { id: courseId }, data: { status: 'archived' } });

      const course = (await service.forUser(userId)).enrolledCourses.find(
        (entry) => entry.id === courseId,
      );

      expect(course?.published).toBe(false);
      expect(course?.lastLessonId).toBeNull();
    });

    it('still matches the shared contract with the course closed', async () => {
      await prisma.course.update({ where: { id: courseId }, data: { status: 'draft' } });

      const dashboard = await service.forUser(userId);

      expect(() => DashboardSchema.parse(dashboard)).not.toThrow();
    });
  });
});
