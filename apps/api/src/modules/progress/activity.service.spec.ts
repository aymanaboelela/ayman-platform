// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { ActivityFeedSchema } from '@ayman/contracts/activity';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new ActivityService(prisma);

  let userId = '';
  let strangerId = '';
  let courseId = '';
  let lessonId = '';
  let enrollmentId = '';
  let strangerEnrollmentId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    userId = (
      await prisma.user.create({
        data: { id: `act-${stamp}`, name: 'طالب', email: `act-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `acts-${stamp}`, name: 'غريب', email: `acts-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `act-course-${stamp}`,
        title: 'كورس النشاط',
        status: 'published',
        // `courses_published_has_timestamp` — the database refuses a published
        // course with no publish time, independently of the service layer.
        publishedAt: new Date(),
        systemId: system.id,
        subjectId: subject.id,
        year: 2,
        instructorId: userId,
        progressionMode: 'open',
      },
    });
    courseId = course.id;

    const section = await prisma.courseSection.create({
      data: { courseId, title: 'الوحدة', position: 1 },
    });

    lessonId = (
      await prisma.lesson.create({
        data: {
          courseId,
          sectionId: section.id,
          title: 'درس النشاط',
          kind: 'video',
          position: 1,
          isPublished: true,
        },
      })
    ).id;

    enrollmentId = (
      await prisma.enrollment.create({
        data: { userId, courseId, source: 'free', status: 'active' },
      })
    ).id;
    strangerEnrollmentId = (
      await prisma.enrollment.create({
        data: { userId: strangerId, courseId, source: 'free', status: 'active' },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.lessonViewSession.deleteMany({ where: { lessonId } });
    await prisma.lessonProgress.deleteMany({ where: { lessonId } });
  });

  afterAll(async () => {
    await prisma.lessonViewSession.deleteMany({ where: { lessonId } });
    await prisma.lessonProgress.deleteMany({ where: { lessonId } });
    await prisma.enrollment.deleteMany({ where: { courseId } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await prisma.$disconnect();
  });

  function sitting(enrollment: string, startedAt: Date, seconds = 60) {
    return prisma.lessonViewSession.create({
      data: {
        enrollmentId: enrollment,
        lessonId,
        startedAt,
        lastSeenAt: new Date(startedAt.getTime() + seconds * 1000),
        watchedSeconds: seconds,
      },
    });
  }

  it('returns an empty, contract-valid feed for a student who has done nothing', async () => {
    const feed = await service.forUser(userId, 20);

    expect(() => ActivityFeedSchema.parse(feed)).not.toThrow();
    expect(feed.entries).toEqual([]);
    expect(feed.nextCursor).toBeNull();
  });

  it('reports a sitting with when and for how long', async () => {
    await sitting(enrollmentId, new Date('2026-03-01T09:30:00.000Z'), 720);

    const feed = await service.forUser(userId, 20);

    expect(feed.entries).toHaveLength(1);
    const entry = feed.entries[0]!;
    expect(entry.kind).toBe('watched');
    expect(entry.occurredAt).toBe('2026-03-01T09:30:00.000Z');
    // The question `lesson_progress` cannot answer: how long THAT time.
    if (entry.kind === 'watched') expect(entry.secondsWatched).toBe(720);
  });

  it('never returns another student’s activity', async () => {
    await sitting(strangerEnrollmentId, new Date('2026-03-01T09:00:00.000Z'));

    const feed = await service.forUser(userId, 20);

    expect(feed.entries).toEqual([]);
  });

  it('merges the three kinds into one list, newest first', async () => {
    await sitting(enrollmentId, new Date('2026-03-01T08:00:00.000Z'));
    await prisma.lessonProgress.create({
      data: {
        enrollmentId,
        lessonId,
        state: 'completed',
        completion: 1,
        completedAt: new Date('2026-03-01T10:00:00.000Z'),
        completedVia: 'auto',
      },
    });
    await sitting(enrollmentId, new Date('2026-03-01T09:00:00.000Z'));

    const feed = await service.forUser(userId, 20);

    expect(feed.entries.map((e) => e.occurredAt)).toEqual([
      '2026-03-01T10:00:00.000Z',
      '2026-03-01T09:00:00.000Z',
      '2026-03-01T08:00:00.000Z',
    ]);
    expect(feed.entries[0]?.kind).toBe('completed');
  });

  it('excludes a lesson that was opened but never completed', async () => {
    await prisma.lessonProgress.create({
      data: { enrollmentId, lessonId, state: 'in_progress', completion: 0.4, completedAt: null },
    });

    const feed = await service.forUser(userId, 20);

    // A `completed` entry with no completion time would be a claim the row
    // does not support.
    expect(feed.entries).toEqual([]);
  });

  it('pages by cursor with no repeats and no gaps', async () => {
    for (let i = 0; i < 5; i += 1) {
      await sitting(enrollmentId, new Date(Date.UTC(2026, 2, 1, 8 + i)));
    }

    const first = await service.forUser(userId, 2);
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await service.forUser(userId, 2, first.nextCursor!);
    const third = await service.forUser(userId, 2, second.nextCursor!);

    const seen = [...first.entries, ...second.entries, ...third.entries].map((e) => e.id);
    expect(seen).toHaveLength(5);
    // The failure this guards is the classic offset paginator's: a row
    // returned on two pages, or one skipped at a boundary.
    expect(new Set(seen).size).toBe(5);
    expect(third.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor rather than rendering an empty history', async () => {
    // `new Date('nonsense')` is `Invalid Date`; every `lt` against it is
    // false, so without this guard the feed would come back empty and a
    // student would be told they have never done anything.
    await expect(service.forUser(userId, 20, 'nonsense')).rejects.toMatchObject({ status: 400 });
  });

  it('orders ties deterministically so a page boundary cannot lose a row', async () => {
    // A lesson completed by the very heartbeat that closed its sitting shares
    // a timestamp with it — the common case, not a rare one.
    const at = new Date('2026-03-02T12:00:00.000Z');
    await sitting(enrollmentId, at);
    await prisma.lessonProgress.create({
      data: {
        enrollmentId,
        lessonId,
        state: 'completed',
        completion: 1,
        completedAt: at,
        completedVia: 'auto',
      },
    });

    const a = await service.forUser(userId, 20);
    const b = await service.forUser(userId, 20);

    expect(a.entries.map((e) => `${e.kind}:${e.id}`)).toEqual(
      b.entries.map((e) => `${e.kind}:${e.id}`),
    );
    expect(a.entries).toHaveLength(2);
  });
});
