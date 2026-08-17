// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { DWELL_COMPLETE_MS } from '@ayman/contracts/progress';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonGateService } from './lesson-gate.service';
import { LessonProgressService } from './lesson-progress.service';

describe('LessonProgressService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new LessonProgressService(
    prisma,
    new LessonAccessService(prisma, new LessonGateService(prisma)),
    new CourseProgressService(),
  );

  let userId = '';
  let courseId = '';
  let enrollmentId = '';
  let textLessonId = '';
  let videoLessonId = '';
  let quizLessonId = '';
  let quizCourseId = '';
  let quizEnrollmentId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    const user = await prisma.user.create({
      data: { id: `lp-${stamp}`, name: 'طالب', email: `lp-${stamp}@t.test` },
    });
    userId = user.id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `lp-course-${stamp}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: userId,
        progressionMode: 'open',
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });

    const text = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'ملخص مكتوب',
        kind: 'text',
        position: 1,
        isPublished: true,
        text: { create: { bodyHtml: '<p>محتوى</p>' } },
      },
    });
    textLessonId = text.id;

    const video = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'فيديو',
        kind: 'video',
        position: 2,
        isPublished: true,
        video: {
          create: { provider: 'youtube', externalId: 'dQw4w9WgXcQ', durationSeconds: 600 },
        },
      },
    });
    videoLessonId = video.id;

    const enrollment = await prisma.enrollment.create({
      data: { userId, courseId, source: 'free', status: 'active' },
    });
    enrollmentId = enrollment.id;

    /*
     * The quiz lesson gets its OWN course and enrolment.
     *
     * Adding a third lesson to the course above would have been one line, and
     * it silently rewrites two unrelated tests: `courseProgressPercent` is
     * completed ÷ total, so a lesson nobody in those tests touches turns their
     * 50/100 into 33.33/66.67. Fixture arithmetic other assertions depend on is
     * not shared state worth saving three lines over.
     *
     * No `quiz` relation is created: every assertion is about the lesson KIND,
     * and the guard under test runs before anything reads a quiz.
     */
    const quizCourse = await prisma.course.create({
      data: {
        slug: `lp-quiz-course-${stamp}`,
        title: 'كورس الكويز',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: userId,
        progressionMode: 'open',
      },
    });
    quizCourseId = quizCourse.id;

    const quizSection = await prisma.courseSection.create({
      data: { courseId: quizCourseId, title: 'الوحدة', position: 1, isPublished: true },
    });

    const quiz = await prisma.lesson.create({
      data: {
        courseId: quizCourseId,
        sectionId: quizSection.id,
        title: 'كويز',
        kind: 'quiz',
        position: 1,
        isPublished: true,
      },
    });
    quizLessonId = quiz.id;

    const quizEnrollment = await prisma.enrollment.create({
      data: { userId, courseId: quizCourseId, source: 'free', status: 'active' },
    });
    quizEnrollmentId = quizEnrollment.id;
  });

  afterEach(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { progressPercent: 0, lastLessonId: null, completedAt: null },
    });
  });

  afterAll(async () => {
    // Both courses, innermost rows first — the quiz course is torn down the
    // same way and before the user both enrolments hang off.
    for (const id of [courseId, quizCourseId]) {
      await prisma.lessonProgress.deleteMany({ where: { enrollment: { courseId: id } } });
      await prisma.enrollment.deleteMany({ where: { courseId: id } });
      await prisma.lesson.deleteMany({ where: { courseId: id } });
      await prisma.courseSection.deleteMany({ where: { courseId: id } });
      await prisma.course.delete({ where: { id } });
    }
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  describe('open', () => {
    it('creates the row, counts the open, and records the resume point', async () => {
      const progress = await service.open(userId, textLessonId);

      expect(progress.state).toBe('in_progress');
      expect(progress.openCount).toBe(1);

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
      });
      expect(enrollment.lastLessonId).toBe(textLessonId);
    });

    it('increments openCount without resetting firstOpenedAt', async () => {
      const first = await service.open(userId, textLessonId);
      const row = await prisma.lessonProgress.findUniqueOrThrow({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: textLessonId } },
      });
      const originalOpenedAt = row.firstOpenedAt;

      const second = await service.open(userId, textLessonId);

      expect(first.openCount).toBe(1);
      expect(second.openCount).toBe(2);
      const after = await prisma.lessonProgress.findUniqueOrThrow({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: textLessonId } },
      });
      // Otherwise a student could re-open a text lesson to reset the dwell
      // clock, which is harmless — but it would also erase the real first-open
      // timestamp, which is the only anchor the dwell rule has.
      expect(after.firstOpenedAt?.getTime()).toBe(originalOpenedAt?.getTime());
    });

    it('does not demote a completed lesson back to in_progress', async () => {
      await service.open(userId, textLessonId);
      await service.completeManually(userId, textLessonId);

      const reopened = await service.open(userId, textLessonId);

      expect(reopened.state).toBe('completed');
      expect(reopened.completedVia).toBe('manual');
    });
  });

  describe('completeByDwell', () => {
    it('refuses before 5000ms have actually elapsed', async () => {
      await service.open(userId, textLessonId);

      const response = await service.completeByDwell(userId, textLessonId);

      expect(response.justCompleted).toBe(false);
      expect(response.progress.state).toBe('in_progress');
      expect(response.progress.completedAt).toBeNull();
    });

    it('completes once the SERVER has measured 5000ms since the open', async () => {
      await service.open(userId, textLessonId);
      // Move first_opened_at into the past. The service reads its own clock —
      // there is no client-reported dwell duration to fake instead.
      //
      // `first_opened_at` is Prisma's default `timestamp(3)` WITHOUT time
      // zone, storing a naive UTC wall-clock value; `now() AT TIME ZONE
      // 'UTC'` keeps this fixture write on that same convention rather than
      // drifting by the session's Africa/Cairo offset (see heartbeat.service's
      // read of the equivalent column for the full reasoning).
      await prisma.$executeRaw`
        UPDATE app.lesson_progress
           SET first_opened_at = (now() AT TIME ZONE 'UTC') - make_interval(secs => ${DWELL_COMPLETE_MS / 1000 + 1}::double precision)
         WHERE enrollment_id = ${enrollmentId} AND lesson_id = ${textLessonId}
      `;

      const response = await service.completeByDwell(userId, textLessonId);

      expect(response.justCompleted).toBe(true);
      expect(response.progress.state).toBe('completed');
      expect(response.progress.completion).toBe(1);
      expect(response.progress.completedVia).toBe('dwell');
      expect(response.courseProgressPercent).toBe(50); // one of two lessons
    });

    it('rejects a dwell claim on a video lesson', async () => {
      await service.open(userId, videoLessonId);

      // A video is finished by watching it, not by sitting on the page.
      await expect(service.completeByDwell(userId, videoLessonId)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('404s for a lesson the caller is not enrolled in', async () => {
      const stranger = await prisma.user.create({
        data: { id: `str-${Date.now()}`, name: 'غريب', email: `str-${Date.now()}@t.test` },
      });

      await expect(service.completeByDwell(stranger.id, textLessonId)).rejects.toMatchObject({
        status: 404,
      });

      await prisma.user.delete({ where: { id: stranger.id } });
    });
  });

  describe('completeManually', () => {
    /*
     * ⚠️ The assertion that matters here is the ROW, not the throw.
     *
     * A test that only caught the rejection would still pass if the guard were
     * moved below the write, or if a later refactor threw after upserting —
     * and the whole point of the guard is that no completion is recorded. So
     * this checks the two things a student could actually gain by pressing the
     * button: a `lesson_progress` row claiming the quiz is done, and the course
     * percentage that would move with it.
     */
    it('refuses a quiz lesson, and writes nothing when it does', async () => {
      await expect(service.completeManually(userId, quizLessonId)).rejects.toThrow(
        /quiz lesson is completed by passing/i,
      );

      const row = await prisma.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: { enrollmentId: quizEnrollmentId, lessonId: quizLessonId },
        },
      });
      expect(row).toBeNull();

      // The quiz course holds exactly this one lesson, so a completion that
      // leaked through would take its percentage straight to 100.
      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: quizEnrollmentId },
      });
      expect(Number(enrollment.progressPercent)).toBe(0);
    });

    it('completes a non-quiz lesson and records it as manual', async () => {
      await service.open(userId, videoLessonId);

      const response = await service.completeManually(userId, videoLessonId);

      expect(response.justCompleted).toBe(true);
      expect(response.progress.completion).toBe(1);
      expect(response.progress.completedVia).toBe('manual');
      // Watch counters are untouched: the student claimed the lesson, they did
      // not watch it, and blending the two would destroy the only signal we
      // have about whether content is actually being consumed.
      expect(response.progress.watchedSeconds).toBe(0);
    });

    it('is idempotent and does not rewrite completedAt', async () => {
      await service.open(userId, videoLessonId);
      const first = await service.completeManually(userId, videoLessonId);
      const second = await service.completeManually(userId, videoLessonId);

      expect(second.justCompleted).toBe(false);
      expect(second.progress.completedAt).toBe(first.progress.completedAt);
    });

    it('does not downgrade a lesson already earned automatically', async () => {
      await prisma.lessonProgress.create({
        data: {
          enrollmentId,
          lessonId: videoLessonId,
          completion: 1,
          state: 'completed',
          watchedSeconds: 600,
          maxPositionSeconds: 600,
          openCount: 1,
          completedAt: new Date(),
          completedVia: 'auto',
        },
      });

      const response = await service.completeManually(userId, videoLessonId);

      expect(response.progress.completedVia).toBe('auto');
    });

    it('moves the course percentage as lessons complete', async () => {
      await service.open(userId, textLessonId);
      const half = await service.completeManually(userId, textLessonId);
      expect(half.courseProgressPercent).toBe(50);

      await service.open(userId, videoLessonId);
      const full = await service.completeManually(userId, videoLessonId);
      expect(full.courseProgressPercent).toBe(100);

      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
      });
      expect(enrollment.completedAt).not.toBeNull();
      // Finishing a course must never revoke access to it.
      expect(enrollment.status).toBe('active');
    });
  });
});

// Isolated in its own course/enrollment fixture rather than reusing the
// suite above: `CourseProgressService.recalculate` counts every published
// lesson in the course, and the outer suite's percentage assertions (50%,
// 100%) already assume an exact count of two lessons. Adding a quiz lesson
// there would silently change those denominators.
describe('LessonProgressService.recordQuizResult', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new LessonProgressService(
    prisma,
    new LessonAccessService(prisma, new LessonGateService(prisma)),
    new CourseProgressService(),
  );

  let userId = '';
  let courseId = '';
  let enrollmentId = '';
  let quizLessonId = '';
  let otherQuizLessonId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    const user = await prisma.user.create({
      data: { id: `qz-${stamp}`, name: 'طالب', email: `qz-${stamp}@t.test` },
    });
    userId = user.id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `qz-course-${stamp}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: userId,
        progressionMode: 'open',
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1, isPublished: true },
    });

    const quiz = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'اختبار',
        kind: 'quiz',
        position: 1,
        isPublished: true,
      },
    });
    quizLessonId = quiz.id;

    const otherQuiz = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'اختبار تاني',
        kind: 'quiz',
        position: 2,
        isPublished: true,
      },
    });
    otherQuizLessonId = otherQuiz.id;

    const enrollment = await prisma.enrollment.create({
      data: { userId, courseId, source: 'free', status: 'active' },
    });
    enrollmentId = enrollment.id;
  });

  afterEach(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { progressPercent: 0, lastLessonId: null, completedAt: null },
    });
  });

  afterAll(async () => {
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('records a pass as a completion, with completion holding the scaled score, not 1', async () => {
    await service.recordQuizResult({
      userId,
      lessonId: quizLessonId,
      passed: true,
      scaledScore: 0.8,
      gradeOutOf: 20,
    });

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId: quizLessonId } },
    });
    expect(row.state).toBe('passed');
    expect(Number(row.completion)).toBe(0.8);
    expect(row.completedVia).toBe('auto');
    expect(row.completedAt).not.toBeNull();

    const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    // The ROW is written and the lesson is `passed` — but the course
    // percentage does not move, because quizzes are not in the denominator:
    // `CourseProgressService.recalculate` counts LECTURES. This fixture's
    // course is nothing but quizzes, so it has no denominator at all.
    expect(Number(enrollment.progressPercent)).toBe(0);
  });

  it('records a fail as neither completed nor a source, and does not move course progress', async () => {
    await service.recordQuizResult({
      userId,
      lessonId: quizLessonId,
      passed: false,
      scaledScore: 0.3,
      gradeOutOf: 20,
    });

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId: quizLessonId } },
    });
    expect(row.state).toBe('failed');
    expect(Number(row.completion)).toBe(0.3);
    expect(row.completedVia).toBeNull();
    expect(row.completedAt).toBeNull();

    const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(Number(enrollment.progressPercent)).toBe(0);
  });

  it('is idempotent — re-recording the identical outcome changes nothing', async () => {
    await service.recordQuizResult({
      userId,
      lessonId: quizLessonId,
      passed: true,
      scaledScore: 0.9,
      gradeOutOf: 20,
    });
    const first = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId: quizLessonId } },
    });

    await service.recordQuizResult({
      userId,
      lessonId: quizLessonId,
      passed: true,
      scaledScore: 0.9,
      gradeOutOf: 20,
    });
    const second = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId: quizLessonId } },
    });

    expect(second.completedAt?.getTime()).toBe(first.completedAt?.getTime());
    expect(second.updatedAt.getTime()).toBe(first.updatedAt.getTime());
  });

  it('lets a retake that later passes set completedAt, after an earlier fail left it null', async () => {
    await service.recordQuizResult({
      userId,
      lessonId: quizLessonId,
      passed: false,
      scaledScore: 0.4,
      gradeOutOf: 20,
    });
    await service.recordQuizResult({
      userId,
      lessonId: quizLessonId,
      passed: true,
      scaledScore: 0.75,
      gradeOutOf: 20,
    });

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId: quizLessonId } },
    });
    expect(row.state).toBe('passed');
    expect(row.completedAt).not.toBeNull();
    expect(row.completedVia).toBe('auto');
  });

  it('404s for a user who is not enrolled, rather than 403', async () => {
    const stranger = await prisma.user.create({
      data: { id: `qzs-${Date.now()}`, name: 'غريب', email: `qzs-${Date.now()}@t.test` },
    });

    await expect(
      service.recordQuizResult({
        userId: stranger.id,
        lessonId: quizLessonId,
        passed: true,
        scaledScore: 1,
        gradeOutOf: 20,
      }),
    ).rejects.toMatchObject({ status: 404 });

    await prisma.user.delete({ where: { id: stranger.id } });
  });

  it('does not move course progress for quiz lessons — the denominator is lectures', async () => {
    await service.recordQuizResult({
      userId,
      lessonId: quizLessonId,
      passed: true,
      scaledScore: 1,
      gradeOutOf: 20,
    });
    await service.recordQuizResult({
      userId,
      lessonId: otherQuizLessonId,
      passed: true,
      scaledScore: 1,
      gradeOutOf: 20,
    });

    const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    // Both quizzes passed, and still 0% — a course made only of quizzes has no
    // lectures to count, so it can neither progress nor finish. Progress is
    // moved by the lectures the quizzes hang off, which is what makes «٢ / ٣»
    // and «66.67%» describe the same set.
    expect(Number(enrollment.progressPercent)).toBe(0);
    expect(enrollment.completedAt).toBeNull();
  });
});

/**
 * A retake must never take a pass away.
 *
 * `recordQuizResultTx` used to let the LAST attempt win outright, so sitting
 * the improvement paper and scoring worse turned `passed` into `failed`,
 * nulled `completedAt`, and — via `courseProgress.recalculate` — un-completed
 * the whole course. The feature that exists to let a student do better was the
 * one that destroyed the result they already had.
 */
describe('LessonProgressService.recordQuizResultTx — improvement never regresses', () => {
  function makeTx(existing: Record<string, unknown> | null) {
    return {
      lessonProgress: {
        findUnique: jest.fn(async () => existing),
        upsert: jest.fn(async () => ({ lessonId: 'l1' })),
      },
      lesson: { count: jest.fn(async () => 1) },
      enrollment: { update: jest.fn(async () => ({})) },
    };
  }

  function makeService() {
    const courseProgress = { recalculate: jest.fn(async () => 100) };
    return new LessonProgressService(
      {} as never,
      {} as never,
      courseProgress as never,
    );
  }

  const ARGS = {
    enrollmentId: 'e1',
    lessonId: 'l1',
    courseId: 'c1',
    passed: false,
    scaledScore: 0.4,
    gradeOutOf: 100,
  };

  it('keeps `passed` when a later attempt fails', async () => {
    const passedAt = new Date('2026-08-01T10:00:00Z');
    const tx = makeTx({ state: 'passed', completion: 0.85, completedAt: passedAt, completedVia: 'auto' });

    await makeService().recordQuizResultTx(tx as never, ARGS);

    expect(tx.lessonProgress.upsert.mock.calls[0][0].update).toMatchObject({
      state: 'passed',
      completion: 0.85,
      completedAt: passedAt,
      completedVia: 'auto',
    });
  });

  it('keeps the HIGHER score when a later attempt passes lower', async () => {
    const passedAt = new Date('2026-08-01T10:00:00Z');
    const tx = makeTx({ state: 'passed', completion: 0.9, completedAt: passedAt, completedVia: 'auto' });

    await makeService().recordQuizResultTx(tx as never, { ...ARGS, passed: true, scaledScore: 0.6 });

    expect(tx.lessonProgress.upsert.mock.calls[0][0].update).toMatchObject({
      state: 'passed',
      completion: 0.9,
    });
  });

  it('does not move completedAt when an already-passed lesson passes again', async () => {
    // The original pass is when they earned it. Re-stamping it would reorder
    // «آخر حاجة خلصتها» every time a student retakes an old quiz.
    const passedAt = new Date('2026-08-01T10:00:00Z');
    const tx = makeTx({ state: 'passed', completion: 0.5, completedAt: passedAt, completedVia: 'auto' });

    await makeService().recordQuizResultTx(tx as never, { ...ARGS, passed: true, scaledScore: 0.95 });

    expect(tx.lessonProgress.upsert.mock.calls[0][0].update).toMatchObject({
      completion: 0.95,
      completedAt: passedAt,
    });
  });

  it('still records a FIRST failure as failed, with no completion stamps', async () => {
    // The retry prompt depends on this — a first fail must not look like a pass.
    const tx = makeTx({ state: 'in_progress', completion: 0, completedAt: null, completedVia: null });

    await makeService().recordQuizResultTx(tx as never, ARGS);

    expect(tx.lessonProgress.upsert.mock.calls[0][0].update).toMatchObject({
      state: 'failed',
      completedAt: null,
      completedVia: null,
    });
  });

  it('upgrades a failed lesson to passed on a successful retake', async () => {
    const tx = makeTx({ state: 'failed', completion: 0.3, completedAt: null, completedVia: null });

    await makeService().recordQuizResultTx(tx as never, { ...ARGS, passed: true, scaledScore: 0.8 });

    expect(tx.lessonProgress.upsert.mock.calls[0][0].update).toMatchObject({
      state: 'passed',
      completion: 0.8,
      completedVia: 'auto',
    });
  });

  it('does not let a quiz failure undo a MANUAL completion', async () => {
    const completedAt = new Date('2026-08-01T10:00:00Z');
    const tx = makeTx({ state: 'completed', completion: 1, completedAt, completedVia: 'manual' });

    await makeService().recordQuizResultTx(tx as never, ARGS);

    expect(tx.lessonProgress.upsert.mock.calls[0][0].update).toMatchObject({
      state: 'completed',
      completion: 1,
      completedAt,
      completedVia: 'manual',
    });
  });
});
