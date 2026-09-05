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
  const service = new DashboardService(prisma, new EmptyScoreFeed(), new LessonGateService(prisma));

  let userId = '';
  let strangerId = '';
  let instructorId = '';
  let courseId = '';
  let courseSlug = '';
  let enrollmentId = '';
  let videoLessonId = '';
  let secondLessonId = '';

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
    await prisma.accessGrant.deleteMany({ where: { userId, courseId } });
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

  it('leaves subscriptionValidUntil null with no purchase grant', async () => {
    const dashboard = await service.forUser(userId);
    const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);
    expect(course?.subscriptionValidUntil).toBeNull();
  });

  // `EnrolledCourseCard`'s own «اطلب الكتاب» CTA (dashboard-side, for a
  // student already enrolled) gates on this same pair — see
  // `EnrolledCourseSchema`'s note in `progress.ts`.
  describe('book', () => {
    afterEach(async () => {
      await prisma.course.update({
        where: { id: courseId },
        data: { bookTitle: null, bookPriceCents: null },
      });
    });

    it('leaves bookTitle/bookPriceCents null for a course with no book configured', async () => {
      const dashboard = await service.forUser(userId);
      const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);
      expect(course?.bookTitle).toBeNull();
      expect(course?.bookPriceCents).toBeNull();
    });

    it('carries the course book pair once one is configured', async () => {
      await prisma.course.update({
        where: { id: courseId },
        data: { bookTitle: 'كتاب البرمجة', bookPriceCents: 25000 },
      });

      const dashboard = await service.forUser(userId);
      const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);
      expect(course?.bookTitle).toBe('كتاب البرمجة');
      expect(course?.bookPriceCents).toBe(25000);
      expect(() => DashboardSchema.parse(dashboard)).not.toThrow();
    });
  });

  /*
   * «مواعيد المحاضرات» — the line `DashboardHero` prints in the band. Nothing
   * derives it and nothing parses it, so the only thing that can go wrong is
   * it not being SELECTED, which is invisible in every unit test that mocks
   * prisma and shows up as a silently empty band on the student's screen.
   */
  describe('scheduleNote', () => {
    afterEach(async () => {
      await prisma.course.update({ where: { id: courseId }, data: { scheduleNote: null } });
    });

    it('is null for a course whose instructor has not announced a time', async () => {
      const dashboard = await service.forUser(userId);
      const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);
      expect(course?.scheduleNote).toBeNull();
    });

    it('carries the instructor\'s own sentence through verbatim', async () => {
      await prisma.course.update({
        where: { id: courseId },
        data: { scheduleNote: 'السبت الساعة ٨ مساءً' },
      });

      const dashboard = await service.forUser(userId);
      const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);
      expect(course?.scheduleNote).toBe('السبت الساعة ٨ مساءً');
      expect(() => DashboardSchema.parse(dashboard)).not.toThrow();
    });
  });

  it('carries the live purchase grant expiry as subscriptionValidUntil', async () => {
    const validUntil = new Date('2027-01-01T00:00:00.000Z');
    await prisma.accessGrant.create({
      data: {
        userId,
        courseId,
        scope: 'course',
        source: 'purchase',
        validFrom: new Date(),
        validUntil,
      },
    });

    const dashboard = await service.forUser(userId);
    const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);
    expect(course?.subscriptionValidUntil).toBe(validUntil.toISOString());
  });

  it('never carries a REVOKED purchase grant expiry', async () => {
    await prisma.accessGrant.create({
      data: {
        userId,
        courseId,
        scope: 'course',
        source: 'purchase',
        validFrom: new Date(),
        validUntil: new Date('2027-01-01T00:00:00.000Z'),
        revokedAt: new Date(),
      },
    });

    const dashboard = await service.forUser(userId);
    const course = dashboard.enrolledCourses.find((entry) => entry.id === courseId);
    expect(course?.subscriptionValidUntil).toBeNull();
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

  it('excludes a lesson sitting in an unpublished section from both counts', async () => {
    // The exact drift `CourseProgressService.recalculate`'s own `reachable`
    // set was written to avoid: a lesson can be `isPublished: true` while its
    // SECTION is not, which makes it invisible to the student (the outline
    // never shows it, `player.service.ts` never serves it) but it must not
    // sneak into either half of the fraction this test reads.
    const hiddenSection = await prisma.courseSection.create({
      data: { courseId, title: 'قسم مسودة', position: 2, isPublished: false },
    });
    const hiddenLesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: hiddenSection.id,
        title: 'درس في قسم مخفي',
        kind: 'text',
        position: 1,
        isPublished: true,
      },
    });

    try {
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
          // Completed too, but must not count — its section is a draft.
          {
            enrollmentId,
            lessonId: hiddenLesson.id,
            completion: 1,
            state: 'completed',
            completedAt: new Date(),
            completedVia: 'auto',
          },
        ],
      });

      const dashboard = await service.forUser(userId);
      const course = dashboard.enrolledCourses[0];

      // Still 1 of 2 — the hidden section's lesson inflates neither side.
      expect(course?.completedLessons).toBe(1);
      expect(course?.totalLessons).toBe(2);
    } finally {
      await prisma.lessonProgress.deleteMany({ where: { lessonId: hiddenLesson.id } });
      await prisma.lesson.delete({ where: { id: hiddenLesson.id } });
      await prisma.courseSection.delete({ where: { id: hiddenSection.id } });
    }
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

  /**
   * «امتحانات في انتظارك» — the freshly-reimplemented card. Its own exam
   * lesson, shared by every case below and cleared out of `course.examLessonId`
   * afterwards so it does not leak into the unrelated tests above (none of
   * which expect the fixture course to have an exam at all).
   */
  describe('pendingExams', () => {
    let examLessonId = '';

    beforeAll(async () => {
      // Same fixture shape `lesson-access.service.spec.ts` uses for its own
      // exam-gate case: `kind: 'quiz'`, published, pointed at by
      // `Course.examLessonId`.
      examLessonId = (
        await prisma.lesson.create({
          data: {
            courseId,
            sectionId: (await prisma.courseSection.findFirstOrThrow({ where: { courseId } })).id,
            title: 'الامتحان النهائي',
            kind: 'quiz',
            position: 3,
            isPublished: true,
          },
        })
      ).id;
      await prisma.course.update({ where: { id: courseId }, data: { examLessonId } });
    });

    // No `afterEach` of its own: the top-level one already clears every
    // `lessonProgress` row for `enrollmentId` after each case, which covers
    // the exam's own row along with the two lectures'.

    afterAll(async () => {
      await prisma.course.update({ where: { id: courseId }, data: { examLessonId: null } });
      await prisma.lesson.delete({ where: { id: examLessonId } });
    });

    /** Both lectures cleared, exam untouched — the qualifying case. */
    async function clearBothLectures() {
      await prisma.lessonProgress.createMany({
        data: [
          {
            enrollmentId,
            lessonId: videoLessonId,
            state: 'completed',
            completion: 1,
            completedAt: new Date(),
            completedVia: 'auto',
          },
          {
            enrollmentId,
            lessonId: secondLessonId,
            state: 'completed',
            completion: 1,
            completedAt: new Date(),
            completedVia: 'auto',
          },
        ],
      });
    }

    it('lists a course whose lectures are all done and the exam is untouched', async () => {
      await clearBothLectures();

      const dashboard = await service.forUser(userId);

      expect(dashboard.pendingExams).toHaveLength(1);
      expect(dashboard.pendingExams[0]).toMatchObject({
        courseId,
        courseSlug,
        lessonId: examLessonId,
        lessonTitle: 'الامتحان النهائي',
      });
    });

    it('does not list a course with a lecture still outstanding', async () => {
      // Only one of the two lectures cleared — the exam's own gate is still
      // `locked`, per `resolveGate`.
      await prisma.lessonProgress.create({
        data: {
          enrollmentId,
          lessonId: videoLessonId,
          state: 'completed',
          completion: 1,
          completedAt: new Date(),
          completedVia: 'auto',
        },
      });

      const dashboard = await service.forUser(userId);
      expect(dashboard.pendingExams).toEqual([]);
    });

    it('does not list a course whose exam already carries a FAILED attempt', async () => {
      // A `failed` sitting means an improvement attempt is owed — that is
      // `ExamsSection`'s row (`examsImproveHint`), not this card's. Showing it
      // in both places would send the same student to the same exam from two
      // cards with two different verbs.
      await clearBothLectures();
      await prisma.lessonProgress.create({
        data: { enrollmentId, lessonId: examLessonId, state: 'failed', completion: 0 },
      });

      const dashboard = await service.forUser(userId);
      expect(dashboard.pendingExams).toEqual([]);
    });

    it('does not list a course whose exam is already cleared', async () => {
      await clearBothLectures();
      await prisma.lessonProgress.create({
        data: {
          enrollmentId,
          lessonId: examLessonId,
          state: 'passed',
          completion: 1,
          completedAt: new Date(),
          completedVia: 'manual',
        },
      });

      const dashboard = await service.forUser(userId);
      expect(dashboard.pendingExams).toEqual([]);
    });

    it('still matches the shared contract with a pending exam present', async () => {
      await clearBothLectures();

      const dashboard = await service.forUser(userId);
      expect(() => DashboardSchema.parse(dashboard)).not.toThrow();
    });
  });

  describe('totalWatchedSeconds', () => {
    it('is zero with no lessonProgress rows at all', async () => {
      const dashboard = await service.forUser(userId);
      expect(dashboard.totalWatchedSeconds).toBe(0);
    });

    it('sums watchedSeconds across every enrolled course', async () => {
      await prisma.lessonProgress.createMany({
        data: [
          { enrollmentId, lessonId: videoLessonId, state: 'in_progress', watchedSeconds: 120 },
          { enrollmentId, lessonId: secondLessonId, state: 'in_progress', watchedSeconds: 30 },
        ],
      });

      const dashboard = await service.forUser(userId);
      expect(dashboard.totalWatchedSeconds).toBe(150);
    });
  });
});
