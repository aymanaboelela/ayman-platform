import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  NotificationFeed,
  StudentNotification,
} from '@ayman/contracts/notifications';
import { PrismaService } from '../../prisma/prisma.service';
import { rolesWithPermission } from '../../auth/permissions';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * What the emitter is given.
 *
 * `lessonId` used to be on every kind, because every notification in the
 * original slice was about something that happened on a lesson. المساعد's
 * `conversation_reply` is the first that is not, so the field moved from "on
 * the union" to "on the kinds that have one" rather than being satisfied with
 * a placeholder lesson id — which would have put a row in the database that
 * lies about what it is about, and made the read path below resolve a title
 * for something that has no lesson.
 */
export type EmitInput =
  | { userId: string; kind: 'quiz_graded'; lessonId: string; attemptId: string; scorePercent: number; passed: boolean | null }
  | { userId: string; kind: 'extra_attempt_granted'; lessonId: string }
  | { userId: string; kind: 'conversation_reply'; conversationId: string }
  | {
      userId: string;
      kind: 'instructor_message';
      conversationId: string;
      /** One of `OUTREACH_KINDS` — the feed picks its lead-in from it. */
      outreachKind: string;
    }
  | { userId: string; kind: 'payment_approved'; courseId: string; validUntil: string | null }
  | { userId: string; kind: 'payment_rejected'; courseId: string; reason: string }
  | { userId: string; kind: 'subscription_expiring_soon'; courseId: string; validUntil: string }
  | { userId: string; kind: 'subscription_cancelled'; courseId: string; reason: string }
  /** ADMIN — a student submitted a Vodafone Cash transfer for review. */
  | { userId: string; kind: 'payment_submitted'; submissionId: string; courseId: string }
  /** ADMIN — a paid book order is waiting to be shipped. */
  | { userId: string; kind: 'book_order_placed'; orderId: string };

/** The kinds whose title is resolved from a lesson at read time. */
const LESSON_KINDS = new Set(['quiz_graded', 'extra_attempt_granted']);
/** The kinds whose title is resolved from a COURSE at read time. */
const COURSE_KINDS = new Set([
  'payment_approved',
  'payment_rejected',
  'subscription_expiring_soon',
  'subscription_cancelled',
  'payment_submitted',
]);

/**
 * In-app notifications: writing them, listing them, and marking them read.
 *
 * ## `emit` takes a transaction client
 *
 * Never the root client. Every caller is already inside the transaction that
 * causes the event — a grade being written, a sitting being granted — and the
 * notification has to live or die with it. A notification about a grade that
 * was rolled back is worse than no notification: the student goes looking for
 * a result that does not exist. This is the same discipline
 * `ViewSessionService` follows for the same reason.
 *
 * ## Titles are resolved on READ, not stored
 *
 * `payload` holds ids and numbers only. A lesson renamed after a notification
 * was written should read with its new name, and storing the title at write
 * time would freeze the old one forever — on top of putting user-facing text
 * in the database, which Global Constraint 4 forbids.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: NotificationsRealtimeService,
  ) {}

  /**
   * Writes one notification inside the caller's transaction.
   *
   * `userId` is the SUBJECT — the student being told — which for
   * `extra_attempt_granted` is deliberately not the actor. An admin granting a
   * sitting must not notify themselves.
   */
  async emit(tx: Prisma.TransactionClient, input: EmitInput): Promise<void> {
    const { userId, kind, ...rest } = input;
    await tx.notification.create({
      data: { userId, kind, payload: rest as Prisma.InputJsonValue },
    });
  }

  /**
   * Writes one notification for EVERY user who holds `permission`, inside the
   * caller's transaction, and answers with the ids so the caller can announce
   * to them once it has committed.
   *
   * ## Why a permission and not a role
   *
   * «مين المفروض يعرف إن فيه دفعة مستنية» is answered by the same authority
   * that decides who may open the review screen. Addressing `role: 'admin'`
   * directly would be a second answer to that question, free to disagree with
   * the first the day a narrower staff role exists — and the failure would be
   * silent: the new role gets the screen and never gets told to look at it.
   *
   * ## Why rows and not just a socket event
   *
   * Because most of these arrive while nobody is looking. A fire-and-forget
   * live event reaches the admin who happens to have the tab open at 2am and
   * nobody else; a row is still there in the morning, and the same feed, badge
   * and mark-as-read the student side already has come for free.
   */
  async emitToPermission<K extends EmitInput['kind']>(
    tx: Prisma.TransactionClient,
    permission: string,
    kind: K,
    payload: Omit<Extract<EmitInput, { kind: K }>, 'kind' | 'userId'>,
  ): Promise<string[]> {
    const roles = rolesWithPermission(permission);
    if (roles.length === 0) return [];

    const recipients = await tx.user.findMany({
      where: { role: { in: roles } },
      select: { id: true },
    });
    if (recipients.length === 0) return [];

    // `createMany` rather than N `create`s: this is one event, and one INSERT
    // is what it should cost however many people are told about it.
    await tx.notification.createMany({
      data: recipients.map((recipient) => ({
        userId: recipient.id,
        kind,
        payload: payload as Prisma.InputJsonValue,
      })),
    });

    return recipients.map((recipient) => recipient.id);
  }

  async feed(userId: string, limit: number, cursor?: string): Promise<NotificationFeed> {
    assertCursor(cursor);
    const take = limit + 1;

    /*
     * The cursor is a ROW ID, not a timestamp, and the ordering is composite.
     *
     * A `createdAt < cursor` window cannot advance past rows that share a
     * millisecond, and notifications routinely do: three quiz results graded
     * in one submit, or a `read-all` followed immediately by new arrivals.
     * The service's own spec caught it — five notifications paged out as six,
     * with page three repeating page two — because `CURRENT_TIMESTAMP` gave
     * several rows the identical `created_at`.
     *
     * `id` is a uuid7, so it is time-ordered AND unique: ordering by
     * `(createdAt, id)` is total, and Prisma's own `cursor` + `skip: 1`
     * resumes exactly after a known row rather than after a value other rows
     * may also hold. Ties are now impossible by construction rather than
     * unlikely.
     */
    const rows = await this.prisma.notification.findMany({
      // Ownership in the WHERE clause; the route carries no id to tamper with.
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, kind: true, payload: true, readAt: true, createdAt: true },
    });

    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;

    // One lookup for every lesson on the page rather than one per row. The
    // title is resolved here, at read time, so a renamed lesson reads with its
    // new name.
    //
    // Filtered to the kinds that HAVE a lesson: a page made entirely of
    // `conversation_reply` rows must not issue a `findMany` with an empty
    // `in` list, and a row of that kind carrying a stray `lessonId` from a
    // hand-edit must not drag a lookup along with it.
    const lessonIds = [
      ...new Set(
        page
          .filter((row) => LESSON_KINDS.has(row.kind))
          .map((row) => payloadString(row.payload, 'lessonId'))
          .filter(Boolean),
      ),
    ] as string[];

    const lessons = await this.prisma.lesson.findMany({
      where: { id: { in: lessonIds } },
      select: { id: true, title: true },
    });
    const titles = new Map(lessons.map((lesson) => [lesson.id, lesson.title]));

    // Same shape as the lesson lookup above, for the two kinds a course rather
    // than a lesson is the subject of.
    const courseIds = [
      ...new Set(
        page
          .filter((row) => COURSE_KINDS.has(row.kind))
          .map((row) => payloadString(row.payload, 'courseId'))
          .filter(Boolean),
      ),
    ] as string[];

    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, title: true, slug: true },
    });
    const courseTitles = new Map(courses.map((course) => [course.id, course.title]));
    const courseSlugs = new Map(courses.map((course) => [course.id, course.slug]));

    /*
      WHO the admin-facing rows are about.

      One map, keyed by the row's own subject id — a submission id or an order
      id — because the two admin kinds resolve a person from two different
      tables and neither has a `userId` worth trusting on the payload: a book
      order can be placed by someone with no account at all, and its
      `fullName` is the name the parcel is addressed to, which is the name an
      admin needs to read.

      Resolved at read time like every other title on this feed, so a student
      who corrects their name sees it corrected everywhere.
    */
    const submissionIds = page
      .filter((row) => row.kind === 'payment_submitted')
      .map((row) => payloadString(row.payload, 'submissionId'))
      .filter((id): id is string => id !== null);
    const orderIds = page
      .filter((row) => row.kind === 'book_order_placed')
      .map((row) => payloadString(row.payload, 'orderId'))
      .filter((id): id is string => id !== null);

    const names = new Map<string, string>();
    if (submissionIds.length > 0) {
      const submissions = await this.prisma.paymentSubmission.findMany({
        where: { id: { in: submissionIds } },
        select: { id: true, user: { select: { name: true } } },
      });
      for (const submission of submissions) names.set(submission.id, submission.user.name);
    }
    if (orderIds.length > 0) {
      const orders = await this.prisma.bookOrder.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, fullName: true },
      });
      for (const order of orders) names.set(order.id, order.fullName);
    }

    const entries = page
      .map((row) => toEntry(row, titles, courseTitles, courseSlugs, names))
      // A notification whose lesson has since been deleted has nothing left to
      // point at. Dropping it beats rendering a row that navigates to a 404 —
      // and beats crashing the feed on a title that is not there.
      .filter((entry): entry is StudentNotification => entry !== null);

    // The LAST ROW OF THE PAGE, not of `entries` — a row dropped by
    // `toEntry` (an incomplete payload, an unknown kind) still has to advance
    // the cursor, or the next request asks for the same window again and the
    // feed stops dead at the first unrenderable row.
    return {
      entries,
      nextCursor: hasMore && page.length > 0 ? page[page.length - 1]!.id : null,
    };
  }

  /**
   * Pushes whatever this user's newest notification is down their open
   * streams, with the current unread count beside it.
   *
   * ## Why this is separate from `emit`, and called AFTER the transaction
   *
   * `emit` writes inside the caller's transaction, on purpose — a notification
   * about a grade that was rolled back is worse than none. Publishing from in
   * there would announce events that never happened: the row disappears with
   * the rollback and the browser is left showing a notification whose id
   * 404s, and a badge count that is wrong until the next poll.
   *
   * So the announcement is a separate, explicit step the caller takes once the
   * write is durable. It re-reads rather than being handed the row, which
   * costs one small query and buys the guarantee that what is streamed is
   * byte-identical to what a `GET /api/me/notifications` would return —
   * including the read-time title resolution, which `emit` never performs.
   *
   * Never throws: see `NotificationsRealtimeService`. A failed announcement
   * degrades to "arrives on the next poll", and must not fail the request that
   * caused it.
   */
  async announce(userId: string): Promise<void> {
    try {
      const [feed, unread] = await Promise.all([
        this.feed(userId, 1),
        this.unreadCount(userId),
      ]);
      const notification = feed.entries[0];
      // Nothing renderable at the head of the feed — an unknown kind, or a
      // payload the reader dropped. The badge is still worth correcting, but
      // there is no event to describe, so this stays quiet rather than
      // inventing one.
      if (!notification) return;
      await this.realtime.publish(userId, { type: 'notification', notification, unread });
    } catch {
      // Deliberately swallowed. The caller has already committed.
    }
  }

  /** `announce` for several recipients at once — the admin fan-out, where one
   *  event is told to everybody holding a permission. */
  async announceAll(userIds: readonly string[]): Promise<void> {
    await Promise.all(userIds.map((userId) => this.announce(userId)));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /**
   * `updateMany` with the user id in the WHERE, not `update` by id.
   *
   * A guessed id belonging to someone else updates ZERO rows and returns
   * quietly, rather than either mutating their row or throwing a 404 that
   * confirms the id exists. `readAt: null` in the filter also makes this
   * idempotent — marking an already-read notification does not move its
   * timestamp, so "when did I read this" stays true.
   */
  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

interface NotificationRow {
  id: string;
  kind: string;
  payload: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}

function payloadString(payload: Prisma.JsonValue, key: string): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function payloadNumber(payload: Prisma.JsonValue, key: string): number | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function payloadBoolean(payload: Prisma.JsonValue, key: string): boolean | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

/**
 * `payload` is `jsonb`, so nothing about its shape is guaranteed by the type
 * system — a row written by an older version of the emitter, or by hand, can
 * be missing a field. Every read is therefore checked, and a row that cannot
 * be completed returns `null` and is dropped from the feed rather than
 * producing an entry that fails the contract's parse and takes the whole page
 * down with it.
 */
function toEntry(
  row: NotificationRow,
  titles: Map<string, string>,
  courseTitles: Map<string, string>,
  courseSlugs: Map<string, string>,
  /** Subject id (a submission or an order) → the person's name. */
  names: Map<string, string>,
): StudentNotification | null {
  const base = {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };

  /*
   * The kinds with no lesson are handled BEFORE the lesson is resolved.
   *
   * `conversation_reply` used to be impossible to express here: the function
   * opened by demanding a `lessonId` and dropping the row without one, so a
   * reply notification would have been silently filtered out of every feed —
   * the exact failure mode this function's own header warns about, arriving
   * from the opposite direction.
   */
  if (row.kind === 'conversation_reply') {
    const conversationId = payloadString(row.payload, 'conversationId');
    if (!conversationId) return null;
    return { ...base, kind: 'conversation_reply', conversationId };
  }

  // «رسايل م. أيمن» — also lessonless, and for a stronger reason than the
  // reply above: the message may be about a lesson, a quiz, or nothing at all
  // (a group invitation), so there is no one id it could carry.
  if (row.kind === 'instructor_message') {
    const conversationId = payloadString(row.payload, 'conversationId');
    if (!conversationId) return null;
    return {
      ...base,
      kind: 'instructor_message',
      conversationId,
      // A row written before the field existed, or by a newer build with a
      // kind this one has not heard of, still renders — the feed falls back to
      // generic copy rather than dropping a message from the instructor.
      outreachKind: payloadString(row.payload, 'outreachKind') ?? '',
    };
  }

  if (row.kind === 'payment_approved') {
    const courseId = payloadString(row.payload, 'courseId');
    // `null` for an approved TERM purchase — see `PaymentApprovedNotificationSchema`'s
    // own note. Not required below, unlike `courseId`: a term grant genuinely
    // has no date, and dropping the notification for that reason would hide
    // a real event from the feed.
    const validUntil = payloadString(row.payload, 'validUntil');
    if (!courseId) return null;
    const courseTitle = courseTitles.get(courseId);
    const courseSlug = courseSlugs.get(courseId);
    if (!courseTitle || !courseSlug) return null;
    return { ...base, kind: 'payment_approved', courseId, courseTitle, courseSlug, validUntil };
  }

  if (row.kind === 'payment_rejected') {
    const courseId = payloadString(row.payload, 'courseId');
    const reason = payloadString(row.payload, 'reason');
    if (!courseId || !reason) return null;
    const courseTitle = courseTitles.get(courseId);
    const courseSlug = courseSlugs.get(courseId);
    if (!courseTitle || !courseSlug) return null;
    return { ...base, kind: 'payment_rejected', courseId, courseTitle, courseSlug, reason };
  }

  if (row.kind === 'payment_submitted') {
    const submissionId = payloadString(row.payload, 'submissionId');
    const courseId = payloadString(row.payload, 'courseId');
    if (!submissionId || !courseId) return null;
    const courseTitle = courseTitles.get(courseId);
    const courseSlug = courseSlugs.get(courseId);
    if (!courseTitle || !courseSlug) return null;
    return {
      ...base,
      kind: 'payment_submitted',
      submissionId,
      courseId,
      courseTitle,
      courseSlug,
      // Resolved at read time like every title on this feed — see
      // `names`. Falls back to the empty string rather than dropping the
      // row: an admin still needs to know a payment is waiting even if the
      // account behind it has since been deleted.
      studentName: names.get(submissionId) ?? '',
    };
  }

  if (row.kind === 'book_order_placed') {
    const orderId = payloadString(row.payload, 'orderId');
    if (!orderId) return null;
    return { ...base, kind: 'book_order_placed', orderId, studentName: names.get(orderId) ?? '' };
  }

  if (row.kind === 'subscription_expiring_soon') {
    const courseId = payloadString(row.payload, 'courseId');
    const validUntil = payloadString(row.payload, 'validUntil');
    if (!courseId || !validUntil) return null;
    const courseTitle = courseTitles.get(courseId);
    const courseSlug = courseSlugs.get(courseId);
    if (!courseTitle || !courseSlug) return null;
    return { ...base, kind: 'subscription_expiring_soon', courseId, courseTitle, courseSlug, validUntil };
  }

  if (row.kind === 'subscription_cancelled') {
    const courseId = payloadString(row.payload, 'courseId');
    const reason = payloadString(row.payload, 'reason');
    if (!courseId || !reason) return null;
    const courseTitle = courseTitles.get(courseId);
    const courseSlug = courseSlugs.get(courseId);
    if (!courseTitle || !courseSlug) return null;
    return { ...base, kind: 'subscription_cancelled', courseId, courseTitle, courseSlug, reason };
  }

  const lessonId = payloadString(row.payload, 'lessonId');
  if (!lessonId) return null;

  const lessonTitle = titles.get(lessonId);
  if (!lessonTitle) return null;

  const shared = { ...base, lessonId, lessonTitle };

  switch (row.kind) {
    case 'quiz_graded': {
      const attemptId = payloadString(row.payload, 'attemptId');
      const scorePercent = payloadNumber(row.payload, 'scorePercent');
      if (!attemptId || scorePercent === null) return null;
      return {
        ...shared,
        kind: 'quiz_graded',
        attemptId,
        scorePercent: Math.round(Math.min(Math.max(scorePercent, 0), 100)),
        passed: payloadBoolean(row.payload, 'passed'),
      };
    }
    case 'extra_attempt_granted':
      return { ...shared, kind: 'extra_attempt_granted' };
    default:
      // A kind this build does not know about — a row written by a newer
      // deployment during a rolling release. Dropped, not crashed.
      return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cursors come from a URL and are attacker-controlled.
 *
 * The column is `uuid`, so a non-UUID string reaching Prisma's `cursor` is a
 * driver-level cast error — a 500 for what is really a malformed request.
 * Rejecting it here makes it the 400 it always was.
 */
function assertCursor(cursor?: string): void {
  if (cursor !== undefined && !UUID.test(cursor)) {
    throw new BadRequestException('cursor is not a valid notification id');
  }
}
