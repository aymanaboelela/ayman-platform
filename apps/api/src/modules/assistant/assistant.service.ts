import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminConversationDetail,
  AdminConversationRow,
  ConversationThread,
  InboxFilter,
} from '@ayman/contracts/assistant/conversation';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hashGuestToken, mintGuestToken } from './guest-token';
import type { ConversationStatus, Prisma } from '../../generated/prisma/client';

/**
 * المساعد's conversations: opening them, adding to them, answering them.
 *
 * ## This service touches TWO tables and no others
 *
 * `conversation` and `conversationMessage`. Not courses, not lessons, not
 * profiles, not attempts. The assistant answers content questions from a
 * hand-written script and from the ALREADY-PUBLIC catalog read the web app
 * fetches separately — no query against content tables is written here at all,
 * so there is no code path along which an unpublished course or another
 * student's data could reach a stranger, whatever the request said.
 *
 * `assistant.service.spec.ts` asserts this by recording every Prisma delegate
 * the service reaches for. It is a rule enforced by CI, not a promise made in
 * a comment.
 *
 * ## Ownership is always in the WHERE clause
 *
 * Never "fetch by id, then compare". Every read and every write resolves
 * through `{ id, userId }` or `{ id, guestTokenHash }`, so a guessed id
 * belonging to someone else matches zero rows — the same discipline
 * `NotificationsService.markRead` documents, and for the same reason: a
 * fetch-then-compare that throws 404 on mismatch still confirms the id exists.
 */

/** First line of the opening message, for the inbox list. */
const PREVIEW_MAX = 140;

/** How many threads one identity may have open at once. */
const MAX_OPEN_PER_IDENTITY = 3;

export interface GuestIdentity {
  name: string;
  phone: string;
}

export interface OpenInput {
  entryPath: string[];
  message: string;
  /** Signed-in student, or `null` for a guest. */
  userId: string | null;
  /** Present only for a guest; ignored entirely when `userId` is set. */
  guest: GuestIdentity | null;
}

export interface OpenResult {
  thread: ConversationThread;
  /**
   * The RAW token, returned exactly once so the controller can set the cookie.
   * `null` for a signed-in student, who needs no cookie. Never persisted and
   * never returned again — a guest who loses the cookie has lost the thread,
   * which is the correct outcome for a bearer credential.
   */
  guestToken: string | null;
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── visitor side ──────────────────────────────────────────────────────

  async open(input: OpenInput): Promise<OpenResult> {
    /*
     * The identity is taken from the SESSION, never from the body.
     *
     * A signed-in caller who posts `name`/`phone` is not renaming themselves
     * in the inbox: their columns stay null and the row resolves to their
     * account. That is what stops the inbox showing "Ayman Abo El Ela" beside
     * a message some other student wrote.
     */
    const isGuest = input.userId === null;
    if (isGuest && (!input.guest?.name || !input.guest.phone)) {
      throw new BadRequestException('guest conversations require a name and a phone');
    }

    await this.assertUnderOpenLimit(input.userId, input.guest?.phone ?? null);

    const guestToken = isGuest ? mintGuestToken() : null;

    /*
     * One transaction. The thread and its first message live or die together —
     * a conversation row with no message is an empty entry in the inbox that
     * the instructor opens, finds nothing in, and cannot answer. Same
     * discipline `NotificationsService.emit` documents for grades.
     */
    const created = await this.prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          userId: input.userId,
          guestName: isGuest ? input.guest!.name : null,
          guestPhone: isGuest ? input.guest!.phone : null,
          guestTokenHash: guestToken ? hashGuestToken(guestToken) : null,
          entryPath: input.entryPath,
          status: 'open',
          // `visitorReadAt` stays NULL. "Has read nothing yet" is exactly
          // right at this moment, and `unreadForVisitor` only ever counts
          // ADMIN messages — of which there are none — so a timestamp here
          // would buy nothing and would mean writing an application clock into
          // a row the database just stamped with its own.
        },
        select: { id: true, status: true, entryPath: true },
      });

      await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          author: 'visitor',
          body: input.message,
        },
      });

      return conversation;
    });

    return {
      thread: await this.threadById(created.id),
      guestToken,
    };
  }

  /**
   * The caller's own thread, or `null`.
   *
   * `null` with a 200, not a 404: "you have never written to us" and "that id
   * does not exist" are different facts, and the widget asks this on every
   * page load. Making the normal case an error status would mean treating a
   * failure as routine, which is how real failures stop being noticed.
   */
  async myThread(userId: string | null, guestToken: string | null): Promise<ConversationThread | null> {
    const where = this.ownerWhere(userId, guestToken);
    if (!where) return null;

    const row = await this.prisma.conversation.findFirst({
      where,
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });
    if (!row) return null;

    return this.threadById(row.id);
  }

  async postMessage(
    conversationId: string,
    userId: string | null,
    guestToken: string | null,
    body: string,
  ): Promise<ConversationThread> {
    const where = this.ownerWhere(userId, guestToken);
    if (!where) throw new ForbiddenException();

    const conversation = await this.prisma.conversation.findFirst({
      // Ownership AND id in one WHERE. A guessed id belonging to another
      // visitor matches nothing, and the 404 below is then honestly "no such
      // conversation *for you*" rather than a confirmation that it exists.
      where: { ...where, id: conversationId },
      select: { id: true, status: true },
    });
    if (!conversation) throw new NotFoundException();

    /*
     * A closed thread is closed. Re-opening it from the visitor side would let
     * anyone with an old cookie keep a resolved conversation alive forever,
     * and the instructor's "done" would mean nothing. Starting a new thread is
     * the supported move.
     */
    if (conversation.status === 'closed') {
      throw new ForbiddenException('conversation is closed');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.conversationMessage.create({
        data: { conversationId: conversation.id, author: 'visitor', body },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          // Back to `open`: the instructor answered, and now there is a new
          // question. The inbox's default filter has to surface it again.
          status: 'open',
          lastMessageAt: new Date(),
          visitorReadAt: new Date(),
          // Explicitly NOT clearing `adminReadAt` — it records when he last
          // looked, which stays true. Unread is derived by comparing it to
          // `lastMessageAt`, so a new message makes the row unread without
          // rewriting history.
        },
      });
    });

    return this.threadById(conversation.id);
  }

  /** Marks the visitor's side read, so the dot on the launcher clears. */
  async markVisitorRead(conversationId: string, userId: string | null, guestToken: string | null): Promise<void> {
    const where = this.ownerWhere(userId, guestToken);
    if (!where) return;
    await this.prisma.conversation.updateMany({
      where: { ...where, id: conversationId },
      data: { visitorReadAt: new Date() },
    });
  }

  // ── admin side ────────────────────────────────────────────────────────

  async list(filter: InboxFilter, take: number, skip: number): Promise<{ rows: AdminConversationRow[]; rowCount: number }> {
    const where: Prisma.ConversationWhereInput =
      filter === 'all' ? {} : { status: filter as ConversationStatus };

    const [rows, rowCount] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          status: true,
          guestName: true,
          guestPhone: true,
          entryPath: true,
          lastMessageAt: true,
          adminReadAt: true,
          user: { select: { name: true } },
          // Just the opening message for the preview — not the whole thread.
          // The inbox lists twenty rows; pulling every message of every one of
          // them to show one line each is the classic N+1 in list form.
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { body: true },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return { rows: rows.map((row) => toAdminRow(row)), rowCount };
  }

  async unreadCount(): Promise<number> {
    /*
     * "Needs an answer" is `status: 'open'`, not `adminReadAt IS NULL`.
     *
     * Reading a message is not answering it. A badge that clears when he
     * glances at the inbox would hide exactly the threads he meant to come
     * back to.
     */
    return this.prisma.conversation.count({ where: { status: 'open' } });
  }

  async detail(id: string): Promise<AdminConversationDetail> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        guestName: true,
        guestPhone: true,
        entryPath: true,
        lastMessageAt: true,
        adminReadAt: true,
        createdAt: true,
        user: { select: { name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, author: true, body: true, createdAt: true },
        },
      },
    });
    if (!row) throw new NotFoundException();

    // Opening the thread IS reading it. Written here rather than in a separate
    // endpoint the client has to remember to call.
    await this.prisma.conversation.update({
      where: { id },
      data: { adminReadAt: new Date() },
    });

    return {
      ...toAdminRow({ ...row, messages: row.messages.slice(0, 1) }),
      // `toAdminRow` computed unread from the value BEFORE the update above;
      // by the time this response renders he has just read it.
      unreadForAdmin: false,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
      messages: row.messages.map((message) => ({
        id: message.id,
        author: message.author,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  async reply(id: string, body: string): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!conversation) throw new NotFoundException();
    if (conversation.status === 'closed') {
      throw new ForbiddenException('conversation is closed');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationMessage.create({
        data: { conversationId: id, author: 'admin', body },
      });
      await tx.conversation.update({
        where: { id },
        data: { status: 'answered', lastMessageAt: now, adminReadAt: now },
      });

      /*
       * Notify inside the transaction, for the reason NotificationsService's
       * header sets out: a notification about a reply that was rolled back
       * sends the student looking for an answer that does not exist.
       *
       * Only for a signed-in student — a guest has no account to notify. They
       * see the unread dot on the launcher next time they load a page, which
       * is why `visitorReadAt` is deliberately NOT touched here.
       */
      if (conversation.userId) {
        await this.notifications.emit(tx, {
          userId: conversation.userId,
          kind: 'conversation_reply',
          conversationId: id,
        });
      }
    });
  }

  async setStatus(id: string, status: 'open' | 'closed'): Promise<void> {
    // `updateMany`, so closing an already-deleted thread is a no-op rather
    // than a 500 from Prisma's "record not found".
    await this.prisma.conversation.updateMany({
      where: { id },
      data: { status },
    });
  }

  // ── internals ─────────────────────────────────────────────────────────

  /**
   * The ownership filter for a visitor-side request, or `null` when the caller
   * presented no identity at all.
   *
   * A SIGNED-IN caller resolves by `userId` even if they also happen to carry
   * a guest cookie from before they registered. Preferring the account is
   * deliberate: it is the stronger claim, and it means signing in cannot be
   * used to reach a thread the account does not own.
   */
  private ownerWhere(
    userId: string | null,
    guestToken: string | null,
  ): Prisma.ConversationWhereInput | null {
    if (userId) return { userId };
    if (guestToken) return { guestTokenHash: hashGuestToken(guestToken) };
    return null;
  }

  /**
   * Caps how many threads one person can have open.
   *
   * The throttler already limits requests per minute; this limits STATE. They
   * catch different abuse: a script that posts once an hour, forever, stays
   * under every rate limit and still fills the inbox. Keyed on the phone
   * number for a guest, because that is the only identity a guest has that
   * survives clearing cookies.
   */
  private async assertUnderOpenLimit(userId: string | null, guestPhone: string | null): Promise<void> {
    const where: Prisma.ConversationWhereInput | null = userId
      ? { userId, status: { not: 'closed' } }
      : guestPhone
        ? { guestPhone, status: { not: 'closed' } }
        : null;
    if (!where) return;

    const open = await this.prisma.conversation.count({ where });
    if (open >= MAX_OPEN_PER_IDENTITY) {
      throw new ForbiddenException('too many open conversations');
    }
  }

  private async threadById(id: string): Promise<ConversationThread> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        entryPath: true,
        visitorReadAt: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, author: true, body: true, createdAt: true },
        },
      },
    });
    if (!row) throw new NotFoundException();

    /*
     * ⚠️ `guestName` and `guestPhone` are deliberately absent from this
     * select, and adding them is a regression.
     *
     * This shape is what a guest cookie reads back. Echoing the phone number
     * here would turn a stolen cookie from "reads a support thread" into
     * "reads a support thread AND harvests the phone number", for no benefit —
     * the visitor typed it and does not need to be told it.
     */
    const visitorRead = row.visitorReadAt;
    return {
      id: row.id,
      status: row.status,
      entryPath: row.entryPath,
      messages: row.messages.map((message) => ({
        id: message.id,
        author: message.author,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })),
      unreadForVisitor: row.messages.filter(
        (message) =>
          message.author === 'admin' && (!visitorRead || message.createdAt > visitorRead),
      ).length,
    };
  }
}

interface AdminRowSource {
  id: string;
  status: ConversationStatus;
  guestName: string | null;
  guestPhone: string | null;
  entryPath: string[];
  lastMessageAt: Date;
  adminReadAt: Date | null;
  user: { name: string } | null;
  messages: { body: string }[];
}

function toAdminRow(row: AdminRowSource): AdminConversationRow {
  const isGuest = row.user === null;
  return {
    id: row.id,
    status: row.status,
    /*
     * The account name wins when there is one. `guestName` is only ever set on
     * a guest row, so this is not a fallback that could silently show the
     * wrong person — but ordering it this way also means a thread orphaned by
     * an account deletion (`onDelete: SetNull`) still renders something rather
     * than an empty cell.
     */
    who: row.user?.name ?? row.guestName ?? '',
    isGuest,
    // Never for a signed-in student: their number is on their profile, and the
    // inbox should not become a second, staler copy of it.
    guestPhone: isGuest ? row.guestPhone : null,
    entryPath: row.entryPath,
    preview: preview(row.messages[0]?.body ?? ''),
    lastMessageAt: row.lastMessageAt.toISOString(),
    // "Something happened since he last looked." A never-opened thread
    // (`adminReadAt` null) is unread by definition.
    unreadForAdmin: !row.adminReadAt || row.lastMessageAt > row.adminReadAt,
  };
}

/**
 * Truncated SERVER-side, not by CSS.
 *
 * A 2000-character message shipped to the inbox list for every one of twenty
 * rows is 40KB of text to render one line each. Cutting it here also means the
 * rest of the message is not sitting in the page source of a screen that only
 * meant to show a summary.
 */
function preview(body: string): string {
  const oneLine = body.replace(/\s+/gu, ' ').trim();
  return oneLine.length <= PREVIEW_MAX ? oneLine : `${oneLine.slice(0, PREVIEW_MAX)}…`;
}
