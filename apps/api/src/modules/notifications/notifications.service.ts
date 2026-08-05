import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  NotificationFeed,
  StudentNotification,
} from '@ayman/contracts/notifications';
import { PrismaService } from '../../prisma/prisma.service';
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
  | { userId: string; kind: 'appeal_resolved'; lessonId: string; attemptId: string; accepted: boolean }
  | { userId: string; kind: 'extra_attempt_granted'; lessonId: string }
  | { userId: string; kind: 'conversation_reply'; conversationId: string };

/** The kinds whose title is resolved from a lesson at read time. */
const LESSON_KINDS = new Set(['quiz_graded', 'appeal_resolved', 'extra_attempt_granted']);

/**
 * In-app notifications: writing them, listing them, and marking them read.
 *
 * ## `emit` takes a transaction client
 *
 * Never the root client. Every caller is already inside the transaction that
 * causes the event — a grade being written, an appeal being resolved — and the
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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Writes one notification inside the caller's transaction.
   *
   * `userId` is the SUBJECT — the student being told — which for
   * `appeal_resolved` and `extra_attempt_granted` is deliberately not the
   * actor. An admin resolving an appeal must not notify themselves.
   */
  async emit(tx: Prisma.TransactionClient, input: EmitInput): Promise<void> {
    const { userId, kind, ...rest } = input;
    await tx.notification.create({
      data: { userId, kind, payload: rest as Prisma.InputJsonValue },
    });
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

    const entries = page
      .map((row) => toEntry(row, titles))
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
function toEntry(row: NotificationRow, titles: Map<string, string>): StudentNotification | null {
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
    case 'appeal_resolved': {
      const attemptId = payloadString(row.payload, 'attemptId');
      const accepted = payloadBoolean(row.payload, 'accepted');
      if (!attemptId || accepted === null) return null;
      return { ...shared, kind: 'appeal_resolved', attemptId, accepted };
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
