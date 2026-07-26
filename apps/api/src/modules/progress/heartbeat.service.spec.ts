// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseProgressService } from './course-progress.service';
import { HeartbeatService } from './heartbeat.service';
import { LessonAccessService } from './lesson-access.service';

const DURATION = 600; // 10:00

describe('HeartbeatService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new HeartbeatService(
    prisma,
    new LessonAccessService(prisma),
    new CourseProgressService(),
  );

  let userId = '';
  let courseId = '';
  let lessonId = '';
  let enrollmentId = '';
  let otherUserId = '';

  /**
   * Pretends `seconds` of wall-clock time passed since the last heartbeat.
   *
   * `last_heartbeat_at` is Prisma's default `timestamp(3)` WITHOUT time zone,
   * and every write through Prisma lands a naive UTC wall-clock value in it.
   * Assigning a bare `now()` (a `timestamptz`) here would implicitly cast
   * through the session's timezone (Africa/Cairo, UTC+3 in summer) and store
   * a value three hours removed from what the service's own read of
   * `last_heartbeat_at` expects — `AT TIME ZONE 'UTC'` keeps this fixture on
   * the same naive-UTC convention as the column it is writing to.
   */
  async function rewindClock(seconds: number): Promise<void> {
    await prisma.$executeRaw`
      UPDATE app.lesson_progress
         SET last_heartbeat_at = (now() AT TIME ZONE 'UTC') - make_interval(secs => ${seconds}::double precision)
       WHERE enrollment_id = ${enrollmentId} AND lesson_id = ${lessonId}
    `;
  }

  async function resetProgress(): Promise<void> {
    await prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      create: {
        enrollmentId,
        lessonId,
        state: 'in_progress',
        openCount: 1,
        firstOpenedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
      update: {
        completion: 0,
        state: 'in_progress',
        watchedSeconds: 0,
        maxPositionSeconds: 0,
        completedAt: null,
        completedVia: null,
        lastHeartbeatAt: new Date(),
      },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    const user = await prisma.user.create({
      data: { id: `hb-${stamp}`, name: 'طالب', email: `hb-${stamp}@t.test` },
    });
    userId = user.id;

    const other = await prisma.user.create({
      data: { id: `hb-other-${stamp}`, name: 'طالب تاني', email: `hbo-${stamp}@t.test` },
    });
    otherUserId = other.id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `hb-course-${stamp}`,
        title: 'كورس',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        year: 2,
        subjectId: subject.id,
        instructorId: userId,
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة الأولى', position: 1, isPublished: true },
    });

    const lesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'الدرس الأول',
        kind: 'video',
        position: 1,
        isPublished: true,
        video: {
          create: { provider: 'youtube', externalId: 'dQw4w9WgXcQ', durationSeconds: DURATION },
        },
      },
    });
    lessonId = lesson.id;

    const enrollment = await prisma.enrollment.create({
      data: { userId, courseId, source: 'free', status: 'active' },
    });
    enrollmentId = enrollment.id;
  });

  beforeEach(resetProgress);

  afterAll(async () => {
    await prisma.lessonProgress.deleteMany({ where: { enrollmentId } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  // ── THE test ──────────────────────────────────────────────────────────
  it('does not complete a lesson that was scrubbed to the end', async () => {
    // Exactly what dragging the scrubber looks like on the wire: the position
    // jumps to the end, but no playback time is ever reported.
    for (let i = 0; i < 6; i += 1) {
      await rewindClock(10);
      const response = await service.record(userId, lessonId, { position: DURATION, delta: 0 });
      expect(response.justCompleted).toBe(false);
      expect(response.progress.state).toBe('in_progress');
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.maxPositionSeconds).toBe(DURATION); // position gate satisfied
    expect(row.watchedSeconds).toBe(0); // watch gate not
    expect(row.completedAt).toBeNull();
    expect(Number(row.completion)).toBe(0);
  });

  it('does not complete a lesson left playing in a background tab to 80%', async () => {
    for (let i = 0; i < 48; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: 10 * (i + 1), delta: 10 });
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.watchedSeconds).toBe(480); // 80% watched — over the 70% gate
    expect(row.maxPositionSeconds).toBe(480); // 80% position — under the 95% gate
    expect(row.completedAt).toBeNull();
  });

  it('completes a lesson that was genuinely watched to the end', async () => {
    // 56 iterations leave position/watched at 560/560 — position is still
    // one tick under the 570 (95% of 600) gate, so the lesson is NOT yet
    // complete. The 57th, final heartbeat is what pushes maxPosition to 600
    // and watchedSeconds to 570, crossing both gates on that exact call —
    // which is the transition this test exists to observe.
    for (let i = 0; i < 56; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: 10 * (i + 1), delta: 10 });
    }
    await rewindClock(10);
    const final = await service.record(userId, lessonId, { position: DURATION, delta: 10 });

    expect(final.justCompleted).toBe(true);
    expect(final.progress.state).toBe('completed');
    expect(final.progress.completion).toBe(1);
    expect(final.progress.completedVia).toBe('auto');
    expect(final.courseProgressPercent).toBe(100);
  });

  it('reports justCompleted exactly once', async () => {
    for (let i = 0; i < 58; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: 10 * (i + 1), delta: 10 });
    }
    await rewindClock(10);
    const again = await service.record(userId, lessonId, { position: DURATION, delta: 10 });

    expect(again.justCompleted).toBe(false);
    expect(again.progress.state).toBe('completed');
  });

  // ── the accumulator ───────────────────────────────────────────────────
  it('credits no more than the wall clock allows, however fast the client posts', async () => {
    // Thirty heartbeats back to back, each claiming the maximum, with no time
    // passing between them. The grace window is all they can buy.
    for (let i = 0; i < 30; i += 1) {
      await service.record(userId, lessonId, { position: 100, delta: 15 });
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    // 30 × 2s grace, and the real elapsed time of the loop itself — nowhere
    // near the 450s the client claimed.
    expect(row.watchedSeconds).toBeLessThanOrEqual(70);
    expect(row.watchedSeconds).toBeLessThan(30 * 15);
  });

  it('never lets watched time exceed the duration', async () => {
    for (let i = 0; i < 80; i += 1) {
      await rewindClock(15);
      await service.record(userId, lessonId, { position: DURATION, delta: 15 });
    }

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.watchedSeconds).toBe(DURATION);
    expect(row.maxPositionSeconds).toBe(DURATION);
  });

  it('clamps a position beyond the end of the video', async () => {
    await rewindClock(10);
    await service.record(userId, lessonId, { position: 999_999, delta: 10 });

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.maxPositionSeconds).toBe(DURATION);
  });

  it('never moves max position backwards when the student rewinds', async () => {
    await rewindClock(10);
    await service.record(userId, lessonId, { position: 400, delta: 10 });
    await rewindClock(10);
    await service.record(userId, lessonId, { position: 10, delta: 10 });

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.maxPositionSeconds).toBe(400);
    expect(row.watchedSeconds).toBe(20); // rewatching still counts as watching
  });

  // ── the forged-percentage attack ──────────────────────────────────────
  it('cannot complete a lesson by claiming an absurd watchedSeconds total directly', async () => {
    // The wire format never carries a total at all — only {position, delta} —
    // so this proves the shape itself, not just the clamp: a client cannot
    // even express "watchedSeconds: 99999" over this endpoint.
    await rewindClock(10);
    const response = await service.record(
      userId,
      lessonId,
      // @ts-expect-error — deliberately probing a field the type does not
      // allow, exactly the shape a forged client would attempt.
      { position: 50, delta: 10, watchedSeconds: 99_999 },
    );

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(row.watchedSeconds).toBeLessThanOrEqual(12);
    expect(response.progress.watchedSeconds).toBeLessThanOrEqual(12);
    expect(response.justCompleted).toBe(false);
  });

  // ── authorization ─────────────────────────────────────────────────────
  it('404s for a user who is not enrolled, rather than 403', async () => {
    await expect(
      service.record(otherUserId, lessonId, { position: 10, delta: 10 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('404s for a lesson that does not exist', async () => {
    await expect(
      service.record(userId, '00000000-0000-7000-8000-000000000000', { position: 1, delta: 1 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects heartbeats against a non-video lesson', async () => {
    const section = await prisma.courseSection.findFirstOrThrow({ where: { courseId } });
    const textLesson = await prisma.lesson.create({
      data: {
        courseId,
        sectionId: section.id,
        title: 'درس مقروء',
        kind: 'text',
        position: 2,
        isPublished: true,
      },
    });

    await expect(
      service.record(userId, textLesson.id, { position: 1, delta: 1 }),
    ).rejects.toMatchObject({ status: 400 });

    await prisma.lesson.delete({ where: { id: textLesson.id } });
  });
});
