// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { CourseProgressService } from './course-progress.service';
import { HeartbeatService } from './heartbeat.service';
import { LessonAccessService } from './lesson-access.service';
import { LessonGateService } from './lesson-gate.service';
import { ViewSessionService } from './view-session.service';

const DURATION = 600; // 10:00

describe('HeartbeatService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new HeartbeatService(
    prisma,
    new LessonAccessService(prisma, new LessonGateService(prisma), new EntitlementService(prisma)),
    new CourseProgressService(),
    new ViewSessionService(),
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

  beforeEach(async () => {
    await resetProgress();
    // Sessionisation keys off `last_seen_at`, so a row left behind by the
    // previous test would be extended by this one instead of starting a new
    // sitting — and every assertion about row COUNTS would be off by however
    // many tests ran before it.
    await prisma.lessonViewSession.deleteMany({ where: { enrollmentId } });
  });

  afterAll(async () => {
    await prisma.lessonViewSession.deleteMany({ where: { enrollmentId } });
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

  it('never regresses completion below 1 on a heartbeat after a manual/dwell completion', async () => {
    // A manually- or dwell-completed lesson can have watched/position values
    // nowhere near the auto-complete thresholds — that is the whole point of
    // those two completion sources. Re-opening and playing such a lesson
    // fires ordinary heartbeats again; this used to 500 (a real bug caught in
    // Task 12 verification), because re-deriving `videoCompletionFraction`
    // from THIS heartbeat's tiny snapshot produced a value below 1 while
    // `completed_at` was still set, violating
    // `lesson_progress_completed_is_full`.
    await prisma.lessonProgress.update({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      data: {
        completion: 1,
        state: 'completed',
        watchedSeconds: 2,
        maxPositionSeconds: 19,
        completedAt: new Date(),
        completedVia: 'manual',
      },
    });

    await rewindClock(1);
    const response = await service.record(userId, lessonId, { position: 20, delta: 1 });

    expect(response.progress.state).toBe('completed');
    expect(response.progress.completion).toBe(1);
    expect(response.progress.completedVia).toBe('manual');
    expect(response.justCompleted).toBe(false);

    const row = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    expect(Number(row.completion)).toBe(1);
    expect(row.completedVia).toBe('manual');
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

  // ── Sessionisation into `lesson_view_sessions` ────────────────────────
  //
  // Driven through `service.record` rather than by calling
  // `ViewSessionService` directly: the thing worth protecting is that a real
  // heartbeat produces a truthful row, and the two most valuable assertions
  // here (that the row credits the SERVER-granted delta, and that it rolls
  // back with the rest of the transaction) are only true of the integrated
  // path.

  /** Pushes an existing sitting into the past so the gap rule sees it as closed. */
  async function ageViewSession(seconds: number): Promise<void> {
    await prisma.$executeRaw`
      UPDATE app.lesson_view_sessions
         SET last_seen_at = last_seen_at - make_interval(secs => ${seconds}::double precision),
             started_at   = started_at   - make_interval(secs => ${seconds}::double precision)
       WHERE enrollment_id = ${enrollmentId}::uuid AND lesson_id = ${lessonId}::uuid
    `;
  }

  const sessions = () =>
    prisma.lessonViewSession.findMany({
      where: { enrollmentId, lessonId },
      orderBy: { startedAt: 'asc' },
    });

  it('opens one sitting on the first heartbeat', async () => {
    await service.record(userId, lessonId, { position: 10, delta: 10 });

    const rows = await sessions();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.watchedSeconds).toBeGreaterThan(0);
    expect(rows[0]?.lastSeenAt.getTime()).toBeGreaterThanOrEqual(rows[0]!.startedAt.getTime());
  });

  it('extends the same sitting across consecutive heartbeats', async () => {
    for (let i = 0; i < 3; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: (i + 1) * 10, delta: 10 });
    }

    const rows = await sessions();
    // Three heartbeats, one sitting — the whole point of the table. One row
    // per heartbeat would be a quarter of a million rows for one long lesson.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.watchedSeconds).toBe(30);
  });

  it('starts a new sitting after a gap longer than the rule allows', async () => {
    await rewindClock(10);
    await service.record(userId, lessonId, { position: 10, delta: 10 });
    const [before] = await sessions();

    // Well past VIEW_SESSION_GAP_SECONDS (30 min): a different evening.
    await ageViewSession(60 * 60 * 5);

    await rewindClock(10);
    await service.record(userId, lessonId, { position: 20, delta: 10 });

    const rows = await sessions();
    expect(rows).toHaveLength(2);
    // The closed sitting is untouched — asserted against what it actually
    // held rather than against a hardcoded figure, because the FIRST
    // heartbeat on a freshly reset row earns only the 2s clock grace and the
    // number is not the point. A sitting that ended never gets rewritten by a
    // later one; that is what makes "when" answerable at all.
    expect(rows[0]?.watchedSeconds).toBe(before?.watchedSeconds);
    expect(rows[0]?.id).toBe(before?.id);
  });

  it('stays one sitting across a pause SHORTER than the gap', async () => {
    await service.record(userId, lessonId, { position: 10, delta: 10 });
    await ageViewSession(10 * 60); // ten minutes: a tea break, not a new session

    await rewindClock(10);
    await service.record(userId, lessonId, { position: 20, delta: 10 });

    expect(await sessions()).toHaveLength(1);
  });

  it('credits the SERVER-granted delta, never the client’s claim', async () => {
    // The forgery this whole table would otherwise be soft on: the client
    // claims a minute of playback one second after its last heartbeat.
    await rewindClock(1);
    await service.record(userId, lessonId, { position: 60, delta: 60 });

    const rows = await sessions();
    // `allowedHeartbeatSeconds` grants at most elapsed + 2s of grace, so a
    // 1-second gap can never buy 60 seconds of timeline.
    expect(rows[0]?.watchedSeconds).toBeLessThanOrEqual(3);
  });

  it('records nothing at all when the heartbeat is rejected', async () => {
    await expect(
      service.record(otherUserId, lessonId, { position: 10, delta: 10 }),
    ).rejects.toMatchObject({ status: 404 });

    // A rejected heartbeat must not leave a sitting behind: the timeline would
    // then claim a student watched a lesson they have no access to.
    expect(await prisma.lessonViewSession.count({ where: { lessonId } })).toBe(0);
  });

  it('keeps the sitting’s total in step with the lesson total', async () => {
    for (let i = 0; i < 4; i += 1) {
      await rewindClock(10);
      await service.record(userId, lessonId, { position: (i + 1) * 10, delta: 10 });
    }

    const progress = await prisma.lessonProgress.findUniqueOrThrow({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      select: { watchedSeconds: true },
    });
    const rows = await sessions();
    const timelineTotal = rows.reduce((sum, row) => sum + row.watchedSeconds, 0);

    // They are written from the same `granted` value inside one transaction,
    // so they cannot drift. If this ever fails, one of the two is lying and
    // the timeline is the one a student would notice.
    expect(timelineTotal).toBe(progress.watchedSeconds);
  });
});
