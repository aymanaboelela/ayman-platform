// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap
// (main.ts), so DATABASE_URL must be loaded explicitly before anything reads it.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { NotificationFeedSchema } from '@ayman/contracts/notifications';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const service = new NotificationsService(prisma);

  let userId = '';
  let strangerId = '';
  let courseId = '';
  let lessonId = '';

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = Date.now();

    userId = (
      await prisma.user.create({
        data: { id: `ntf-${stamp}`, name: 'طالب', email: `ntf-${stamp}@t.test` },
      })
    ).id;
    strangerId = (
      await prisma.user.create({
        data: { id: `ntfs-${stamp}`, name: 'غريب', email: `ntfs-${stamp}@t.test` },
      })
    ).id;

    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const subject = await prisma.subject.findFirstOrThrow();

    const course = await prisma.course.create({
      data: {
        slug: `ntf-course-${stamp}`,
        title: 'كورس الإشعارات',
        status: 'published',
        publishedAt: new Date(),
        systemId: system.id,
        subjectId: subject.id,
        year: 2,
        instructorId: userId,
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
          title: 'درس الإشعارات',
          kind: 'video',
          position: 1,
          isPublished: true,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, strangerId] } } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, strangerId] } } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    await prisma.$disconnect();
  });

  /** `emit` takes a transaction client, so every test opens one. */
  function emitQuizGraded(owner: string, scorePercent = 80) {
    return prisma.$transaction((tx) =>
      service.emit(tx, {
        userId: owner,
        kind: 'quiz_graded',
        lessonId,
        attemptId: '01990000-0000-7000-8000-0000000000aa',
        scorePercent,
        passed: scorePercent >= 50,
      }),
    );
  }

  it('returns an empty, contract-valid feed for a student with nothing', async () => {
    const feed = await service.feed(userId, 20);
    expect(() => NotificationFeedSchema.parse(feed)).not.toThrow();
    expect(feed.entries).toEqual([]);
    expect(feed.nextCursor).toBeNull();
  });

  it('writes and reads a notification, resolving the lesson title at READ time', async () => {
    await emitQuizGraded(userId, 90);

    const feed = await service.feed(userId, 20);
    expect(feed.entries).toHaveLength(1);
    const entry = feed.entries[0]!;
    expect(entry.kind).toBe('quiz_graded');
    // Not stored on the row — resolved from the lesson, so a rename is
    // reflected rather than frozen.
    expect(entry.lessonTitle).toBe('درس الإشعارات');
    expect(entry.readAt).toBeNull();
  });

  it('writes and reads a subscription_expiring_soon notification, resolving the course at READ time', async () => {
    const validUntil = new Date('2027-01-01T00:00:00.000Z').toISOString();
    await prisma.$transaction((tx) =>
      service.emit(tx, { userId, kind: 'subscription_expiring_soon', courseId, validUntil }),
    );

    const feed = await service.feed(userId, 20);
    expect(feed.entries).toHaveLength(1);
    const entry = feed.entries[0]!;
    expect(entry.kind).toBe('subscription_expiring_soon');
    if (entry.kind !== 'subscription_expiring_soon') throw new Error('unreachable');
    // Not stored on the row — resolved from the course, same as
    // `payment_approved`/`payment_rejected`.
    expect(entry.courseTitle).toBe('كورس الإشعارات');
    expect(entry.validUntil).toBe(validUntil);
  });

  it('reflects a lesson rename, because the title is not stored', async () => {
    await emitQuizGraded(userId);
    await prisma.lesson.update({ where: { id: lessonId }, data: { title: 'الاسم الجديد' } });

    const feed = await service.feed(userId, 20);
    expect(feed.entries[0]?.lessonTitle).toBe('الاسم الجديد');

    await prisma.lesson.update({ where: { id: lessonId }, data: { title: 'درس الإشعارات' } });
  });

  it('rolls back with the transaction that emitted it', async () => {
    // The reason `emit` takes a tx client at all: a notification about a grade
    // that was rolled back sends a student looking for a result that does not
    // exist.
    await expect(
      prisma.$transaction(async (tx) => {
        await service.emit(tx, {
          userId,
          kind: 'extra_attempt_granted',
          lessonId,
        });
        throw new Error('the surrounding work failed');
      }),
    ).rejects.toThrow('the surrounding work failed');

    expect(await prisma.notification.count({ where: { userId } })).toBe(0);
  });

  it('never returns another student’s notifications', async () => {
    await emitQuizGraded(strangerId);

    expect((await service.feed(userId, 20)).entries).toEqual([]);
    expect(await service.unreadCount(userId)).toBe(0);
  });

  it('counts only unread', async () => {
    await emitQuizGraded(userId, 70);
    await emitQuizGraded(userId, 60);
    expect(await service.unreadCount(userId)).toBe(2);

    const feed = await service.feed(userId, 20);
    await service.markRead(userId, feed.entries[0]!.id);

    expect(await service.unreadCount(userId)).toBe(1);
  });

  it('cannot mark another student’s notification read', async () => {
    await emitQuizGraded(strangerId);
    const strangerFeed = await service.feed(strangerId, 20);
    const theirId = strangerFeed.entries[0]!.id;

    // Scoped by `{ id, userId }` in `updateMany`, so this updates ZERO rows —
    // it neither mutates their row nor throws a 404 that confirms the id is
    // real.
    await service.markRead(userId, theirId);

    expect(await service.unreadCount(strangerId)).toBe(1);
  });

  it('marking read is idempotent — the timestamp does not move', async () => {
    await emitQuizGraded(userId);
    const id = (await service.feed(userId, 20)).entries[0]!.id;

    await service.markRead(userId, id);
    const first = (await service.feed(userId, 20)).entries[0]!.readAt;

    await service.markRead(userId, id);
    const second = (await service.feed(userId, 20)).entries[0]!.readAt;

    // "When did I read this" has to stay true across a double-click.
    expect(second).toBe(first);
  });

  it('marks every unread one at once, and stays correct when run twice', async () => {
    await emitQuizGraded(userId, 55);
    await emitQuizGraded(userId, 65);

    await service.markAllRead(userId);
    expect(await service.unreadCount(userId)).toBe(0);

    await service.markAllRead(userId);
    expect(await service.unreadCount(userId)).toBe(0);
  });

  it('pages by cursor with no repeats and no gaps, even when every row shares a timestamp', async () => {
    /*
     * The collision is CONSTRUCTED, not hoped for.
     *
     * The first version of this test emitted five rows in a tight loop and
     * relied on `CURRENT_TIMESTAMP` giving some of them the same millisecond.
     * That is true on a fast machine and false on a slow one — it caught the
     * bug locally and then failed in CI for the opposite reason, where all
     * five landed in their own millisecond. A test that depends on how fast
     * the runner is tests the runner.
     *
     * Writing one explicit `createdAt` for all five makes the tie the
     * PREMISE. It is the worst case rather than a likely one, it exercises the
     * exact condition that broke the timestamp cursor on every machine, and
     * against the old implementation it fails outright: a `createdAt <` window
     * cannot step past a group that all share the value, so page two repeats
     * page one forever.
     */
    const sharedAt = new Date('2026-03-01T12:00:00.000Z');
    for (let i = 0; i < 5; i += 1) {
      await prisma.notification.create({
        data: {
          userId,
          kind: 'quiz_graded',
          payload: { lessonId, attemptId: `attempt-${i}`, scorePercent: 50 + i, passed: true },
          createdAt: sharedAt,
        },
      });
    }

    const rows = await prisma.notification.findMany({
      where: { userId },
      select: { createdAt: true },
    });
    // The premise itself, asserted — so this cannot quietly stop testing ties.
    expect(new Set(rows.map((row) => row.createdAt.getTime()))).toHaveProperty('size', 1);

    const first = await service.feed(userId, 2);
    const second = await service.feed(userId, 2, first.nextCursor!);
    const third = await service.feed(userId, 2, second.nextCursor!);

    const ids = [...first.entries, ...second.entries, ...third.entries].map((e) => e.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(third.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor rather than rendering an empty history', async () => {
    // A non-UUID reaching Prisma's `cursor` is a driver cast error — a 500 for
    // what is really a malformed request.
    await expect(service.feed(userId, 20, 'nonsense')).rejects.toMatchObject({ status: 400 });
  });

  it('drops a row whose payload cannot be completed, instead of failing the page', async () => {
    // `payload` is jsonb: an older emitter, or a hand-written row, can be
    // missing a field. One bad row must not take the whole feed down.
    await prisma.notification.create({
      data: { userId, kind: 'quiz_graded', payload: { lessonId } },
    });
    await emitQuizGraded(userId, 88);

    const feed = await service.feed(userId, 20);

    expect(() => NotificationFeedSchema.parse(feed)).not.toThrow();
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]?.kind).toBe('quiz_graded');
  });
});
