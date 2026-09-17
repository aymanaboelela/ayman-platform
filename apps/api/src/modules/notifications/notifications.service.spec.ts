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
  let adminId = '';
  let courseId = '';
  let courseSlug = '';
  let lessonId = '';
  let governorateCode = '';
  /** Every book order this suite writes, torn down in `afterAll`. Lines go
   *  with them — `BookOrderItem.orderId` cascades. */
  const bookOrderIds: string[] = [];

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
    // For `notifyPermission` — the ADMIN kinds fan out to every user holding
    // the matching permission, and `userId`/`strangerId` above are both
    // plain students (the default role).
    adminId = (
      await prisma.user.create({
        data: { id: `ntfa-${stamp}`, name: 'مهندس', email: `ntfa-${stamp}@t.test`, role: 'admin' },
      })
    ).id;

    governorateCode = (await prisma.governorate.findFirstOrThrow()).code;

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
    courseSlug = course.slug;

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
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, strangerId, adminId] } } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, strangerId, adminId] } } });
    await prisma.bookOrder.deleteMany({ where: { id: { in: bookOrderIds } } });
    await prisma.lesson.deleteMany({ where: { courseId } });
    await prisma.courseSection.deleteMany({ where: { courseId } });
    await prisma.course.delete({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId, adminId] } } });
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

  /** One line's price, so the fixture's total below is a sum and not a guess. */
  const LINE_PRICE_CENTS = 12000;

  /**
   * A book order with the given lines, in the order given — which is
   * deliberately NOT the order they come back in.
   *
   * `bookId: null` throughout: an admin-typed «كتاب خاص» line is a legitimate
   * order line (see the `@@unique([orderId, bookId])` note on the model), and
   * it keeps this suite from having to own a catalogue row it never reads.
   */
  async function createBookOrder(titles: readonly string[]) {
    // `book_orders_amount_is_the_sum` is a CHECK constraint, not a convention:
    // the stored total has to be the arithmetic the student was shown, so the
    // fixture does the sum rather than hard-coding a number that happens to
    // pass for one line and fails for two.
    const itemsCents = LINE_PRICE_CENTS * titles.length;
    const order = await prisma.bookOrder.create({
      data: {
        userId,
        amountCents: itemsCents,
        itemsCents,
        fullName: 'طالب',
        phone: '01000000000',
        altPhone: '01100000000',
        governorateCode,
        city: 'المنصورة',
        addressStreet: 'شارع الجيش',
        status: 'paid',
        paidAt: new Date(),
        items: {
          create: titles.map((titleAr) => ({
            titleAr,
            unitPriceCents: LINE_PRICE_CENTS,
            quantity: 1,
          })),
        },
      },
      select: { id: true },
    });
    bookOrderIds.push(order.id);
    return order.id;
  }

  /* ── الكتاب الورقي — الطالب ────────────────────────────────────────────
     The three kinds that close «طلبت الكتاب وبعدين إيه؟». What is being
     asserted throughout is that `bookTitle` is NOT on the row: the payload
     carries an order id and nothing else, and the name is read back from the
     order's lines at display time, same as every lesson and course title
     above. */

  it('resolves a shipped book order’s title from its FIRST line', async () => {
    /*
     * Two lines, inserted in the WRONG order on purpose, so this cannot pass
     * by accidentally reading whatever came back first.
     *
     * The numeric prefixes are not decoration. «أول سطر» means first by
     * `titleAr` ascending — the same `orderBy` `bookOrderSelect` and both
     * admin list queries use — and asserting that on two Arabic words would
     * be asserting the DATABASE'S ARABIC COLLATION, which is not what this
     * test is about and is not the same on every deployment. Digits sort the
     * same way everywhere.
     */
    const orderId = await createBookOrder(['2 — كتاب الفيزياء', '1 — كتاب الأحياء']);
    await prisma.$transaction((tx) =>
      service.emit(tx, { userId, kind: 'book_order_shipped', orderId }),
    );

    const feed = await service.feed(userId, 20);
    expect(() => NotificationFeedSchema.parse(feed)).not.toThrow();
    expect(feed.entries).toHaveLength(1);
    const entry = feed.entries[0]!;
    if (entry.kind !== 'book_order_shipped') throw new Error('unreachable');
    expect(entry.orderId).toBe(orderId);
    expect(entry.bookTitle).toBe('1 — كتاب الأحياء');
  });

  it('reflects a renamed book line, because the title is not stored', async () => {
    const orderId = await createBookOrder(['كتاب الكيمياء']);
    await prisma.$transaction((tx) =>
      service.emit(tx, { userId, kind: 'book_order_delivered', orderId }),
    );

    // The same point `reflects a lesson rename` makes, from the other end of
    // the catalogue: an admin fixing a title on an order already delivered
    // should not leave the student's notification quoting the old one.
    await prisma.bookOrderItem.updateMany({
      where: { orderId },
      data: { titleAr: 'كتاب الكيمياء — الطبعة الجديدة' },
    });

    const entry = (await service.feed(userId, 20)).entries[0]!;
    expect(entry.kind).toBe('book_order_delivered');
    if (entry.kind !== 'book_order_delivered') throw new Error('unreachable');
    expect(entry.bookTitle).toBe('كتاب الكيمياء — الطبعة الجديدة');
  });

  it('carries the admin’s rejection reason verbatim', async () => {
    const orderId = await createBookOrder(['كتاب الجيولوجيا']);
    // Free text, not a fixed vocabulary — same slot `payment_rejected`'s own
    // `reason` occupies, and shown to the student exactly as typed.
    const reason = 'العنوان ناقص رقم العمارة، كلّمنا على الرقم اللي في الطلب';
    await prisma.$transaction((tx) =>
      service.emit(tx, { userId, kind: 'book_order_rejected', orderId, reason }),
    );

    const feed = await service.feed(userId, 20);
    expect(() => NotificationFeedSchema.parse(feed)).not.toThrow();
    const entry = feed.entries[0]!;
    if (entry.kind !== 'book_order_rejected') throw new Error('unreachable');
    expect(entry.reason).toBe(reason);
    expect(entry.bookTitle).toBe('كتاب الجيولوجيا');
  });

  it('still renders an order whose lines are all gone, with an empty title', async () => {
    const orderId = await createBookOrder(['كتاب هيتشال']);
    await prisma.$transaction((tx) =>
      service.emit(tx, { userId, kind: 'book_order_delivered', orderId }),
    );
    // An admin rewrote the basket and removed the last line. The ORDER is
    // still there, still has a status, and is still where the student is
    // being sent — so this must not take the row down the way a deleted
    // lesson does. The copy carries `{book}` at the end of the sentence
    // precisely so «الكتاب وصلك — » still reads.
    await prisma.bookOrderItem.deleteMany({ where: { orderId } });

    const feed = await service.feed(userId, 20);
    expect(() => NotificationFeedSchema.parse(feed)).not.toThrow();
    expect(feed.entries).toHaveLength(1);
    const entry = feed.entries[0]!;
    if (entry.kind !== 'book_order_delivered') throw new Error('unreachable');
    expect(entry.bookTitle).toBe('');
  });

  it('resolves a whole page of book-order titles in ONE lookup, not one per row', async () => {
    /*
     * The N+1 this is here to prevent is worse than it looks: the bell loads
     * twenty rows at a time, and a student with a term's worth of orders
     * would have turned one feed request into twenty round trips — each of
     * them a `book_order_items` scan.
     *
     * Counted through a proxy rather than a `jest.spyOn` on the delegate:
     * nothing in the Prisma client guarantees `prisma.bookOrderItem` is the
     * same object on two reads, and a spy installed on a delegate the service
     * never sees would silently count zero and pass.
     */
    let lookups = 0;
    const counting = new Proxy(prisma as object, {
      get(target, property, receiver) {
        if (property !== 'bookOrderItem') return Reflect.get(target, property, receiver);
        const delegate = Reflect.get(target, property, receiver) as Record<string, unknown>;
        return new Proxy(delegate, {
          get(inner, innerProperty) {
            if (innerProperty !== 'findMany') return Reflect.get(inner, innerProperty, inner);
            return (...args: unknown[]) => {
              lookups += 1;
              return (inner['findMany'] as (...a: unknown[]) => unknown).apply(inner, args);
            };
          },
        });
      },
    }) as PrismaService;
    const counted = new NotificationsService(counting);

    const shipped = await createBookOrder(['كتاب أول']);
    const delivered = await createBookOrder(['كتاب تاني']);
    const rejected = await createBookOrder(['كتاب تالت']);
    await prisma.$transaction(async (tx) => {
      await service.emit(tx, { userId, kind: 'book_order_shipped', orderId: shipped });
      await service.emit(tx, { userId, kind: 'book_order_delivered', orderId: delivered });
      await service.emit(tx, {
        userId,
        kind: 'book_order_rejected',
        orderId: rejected,
        reason: 'الكمية خلصت من المخزن',
      });
    });

    const feed = await counted.feed(userId, 20);

    expect(feed.entries).toHaveLength(3);
    // Every one of them resolved — one query, three answers.
    expect(new Set(feed.entries.map((entry) => 'bookTitle' in entry && entry.bookTitle))).toEqual(
      new Set(['كتاب أول', 'كتاب تاني', 'كتاب تالت']),
    );
    expect(lookups).toBe(1);
  });

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

  it('writes and reads a course_completed notification, resolving title AND slug at READ time', async () => {
    await prisma.$transaction((tx) => service.emit(tx, { userId, kind: 'course_completed', courseId }));

    const feed = await service.feed(userId, 20);
    expect(() => NotificationFeedSchema.parse(feed)).not.toThrow();
    expect(feed.entries).toHaveLength(1);
    const entry = feed.entries[0]!;
    expect(entry.kind).toBe('course_completed');
    if (entry.kind !== 'course_completed') throw new Error('unreachable');
    // Neither is on the row. The title so a course renamed after a student
    // finished it congratulates them by its new name; the SLUG because the
    // course route is slug-based and a stored one would 404 the moment an
    // admin changed it.
    expect(entry.courseTitle).toBe('كورس الإشعارات');
    expect(entry.courseSlug).toBe(courseSlug);
  });

  it('resolves a page of mixed course kinds in ONE courses query, not one per row', async () => {
    /*
      `course_completed` joined `COURSE_KINDS`, and the failure mode a new
      arm invites is an N+1: a lookup per row rather than a lookup per page.
      Counting the query is the only way to assert that from out here — a
      correct-looking feed is exactly what an N+1 produces.
    */
    await prisma.$transaction(async (tx) => {
      await service.emit(tx, { userId, kind: 'course_completed', courseId });
      await service.emit(tx, { userId, kind: 'payment_approved', courseId, validUntil: null });
      await service.emit(tx, { userId, kind: 'payment_rejected', courseId, reason: 'التحويل ناقص' });
    });

    const findMany = jest.spyOn(prisma.course, 'findMany');
    try {
      const feed = await service.feed(userId, 20);
      expect(feed.entries).toHaveLength(3);
      expect(findMany).toHaveBeenCalledTimes(1);
      // …and it asked for all three ids at once, deduped to the one course.
      expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { id: { in: [courseId] } } });
    } finally {
      findMany.mockRestore();
    }
  });

  it('notifyPermission fans out to every admin and resolves the student name + preview at READ time', async () => {
    // `conversation:read` — the permission `/admin/inbox` itself requires.
    // Not going through `AssistantService`: this is testing what
    // `NotificationsService` does with a conversation id, not the assistant.
    const conversation = await prisma.conversation.create({
      data: { userId, entryPath: [], status: 'open' },
      select: { id: true },
    });

    try {
      await service.notifyPermission('conversation:read', 'assistant_question_received', {
        conversationId: conversation.id,
        preview: 'الدرس ده هيتشرح إمتى؟',
      });

      // Addressed to the ADMIN, never to the student who asked — an admin
      // granting themselves an alert about their own question would be the
      // same mistake `extra_attempt_granted`'s own comment warns against.
      const studentFeed = await service.feed(userId, 20);
      expect(studentFeed.entries).toEqual([]);

      const adminFeed = await service.feed(adminId, 20);
      expect(adminFeed.entries).toHaveLength(1);
      const entry = adminFeed.entries[0]!;
      expect(entry.kind).toBe('assistant_question_received');
      if (entry.kind !== 'assistant_question_received') throw new Error('unreachable');
      expect(entry.conversationId).toBe(conversation.id);
      // Snapshotted at write time, not resolved fresh — see `EmitInput`.
      expect(entry.preview).toBe('الدرس ده هيتشرح إمتى؟');
      // Resolved at READ time from the conversation's owner — same
      // discipline `payment_submitted`/`book_order_placed` follow.
      expect(entry.studentName).toBe('طالب');
    } finally {
      await prisma.conversation.delete({ where: { id: conversation.id } });
    }
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
