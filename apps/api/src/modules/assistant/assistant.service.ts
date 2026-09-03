import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AdminConversationDetail,
  AdminConversationRow,
  ConversationMessageEntry,
  ConversationThread,
  InboxFilter,
  MessageAttachment,
  MessageAttachmentInput,
} from '@ayman/contracts/assistant/conversation';
import { mimeForStorageKey } from '@ayman/contracts/admin/media';
import {
  SUMMARY_PREVIEW_MAX,
  type MyConversationSummary,
} from '@ayman/contracts/assistant/summary';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { hashGuestToken, mintGuestToken } from './guest-token';
import type {
  ConversationOrigin,
  ConversationStatus,
  MessageAuthor,
  Prisma,
} from '../../generated/prisma/client';

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

/**
 * How many of a caller's threads `myThread` ranks before picking one.
 *
 * Three of their own (`MAX_OPEN_PER_IDENTITY`) plus the outreach thread, plus
 * head-room for closed ones and for outreach threads that accumulate when the
 * instructor closes them. This read is on every page load, so it is bounded
 * rather than unbounded — a caller with more threads than this has old ones
 * that are read, and read threads never win the ranking anyway.
 */
const THREAD_CANDIDATES = 8;

/**
 * How many messages of one thread the visitor-facing shape carries.
 *
 * See `threadById`: an outreach thread is reused for every message the platform
 * ever sends a student, so "all of them" stopped being a bound the day
 * «رسايل م. أيمن» shipped — and this shape is resolved on every page load of
 * every route by the launcher's probe.
 */
const THREAD_MESSAGE_WINDOW = 100;

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
   *
   * ## UNREAD FIRST, oldest unread before newer — not simply "newest"
   *
   * This used to be `orderBy: lastMessageAt desc, take 1`, which was exactly
   * right while a student could only ever have threads they had opened
   * themselves. «رسايل م. أيمن» broke it: a student now has an outreach thread
   * as well, and there is one screen — the widget — that shows one thread.
   *
   * The failure that produced:
   *
   *   10:00  he answers the question she asked        (thread A, unread)
   *   10:30  the sweeper sends her a result message   (thread B, unread)
   *   11:00  she opens the widget → thread B
   *
   * Thread A is now unreachable. `lastMessageAt` never moves again on its own,
   * both her notifications deep-link to `?assistant=1` — which lands here —
   * and the answer to the question she actually asked is lost. Silently.
   *
   * So an unread thread outranks a merely-newer one, and among unread ones the
   * OLDEST unread message wins: that drains the queue in the order it arrived
   * and guarantees nothing can be skipped past. With nothing unread it falls
   * back to newest, which is the old behaviour and the common case.
   *
   * Bounded at `THREAD_CANDIDATES`: a student may hold three open threads of
   * their own (`MAX_OPEN_PER_IDENTITY`) plus outreach ones, and this runs on
   * every page load — the ranking is done here rather than in SQL because it
   * compares two columns across two tables, which Prisma cannot express.
   */
  async myThread(userId: string | null, guestToken: string | null): Promise<ConversationThread | null> {
    const where = this.ownerWhere(userId, guestToken);
    if (!where) return null;

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: THREAD_CANDIDATES,
      select: {
        id: true,
        visitorReadAt: true,
        /*
         * The LATEST admin message, not the oldest.
         *
         * "Is anything unread here" is `latest > visitorReadAt` — asking it of
         * the OLDEST message gets it wrong the moment a thread has two: she
         * reads his first reply, he writes again, and a rule anchored on the
         * first message calls the thread read. Ranking then uses the same
         * value ascending, which still drains every unread thread (each one
         * drops out as it is read) without needing a second column.
         */
        messages: {
          where: { author: 'admin' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    if (rows.length === 0) return null;

    const unread = rows
      .map((row) => ({ id: row.id, at: latestUnreadAdminMessage(row) }))
      .filter((row): row is { id: string; at: Date } => row.at !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    // `rows[0]` is the newest — the list is already ordered that way.
    return this.threadById(unread[0]?.id ?? rows[0]!.id);
  }

  /**
   * The same answer as `myThread`, narrowed to what the LAUNCHER can act on
   * before anyone opens the panel.
   *
   * ## Derived, never re-queried
   *
   * "Unread" means "an admin message the visitor has not seen", and that rule
   * is written once, in `threadById`. A `count` here that re-expressed it in
   * Prisma's terms would be a second copy free to drift from the first, and
   * the drift would surface as a dot that lies — the exact thing this endpoint
   * exists to get right. So this asks the same question the full handler asks
   * and throws away the part the launcher cannot draw.
   *
   * What that saves is the PAYLOAD, not the query. The widget was pulling
   * every message of a conversation onto every page load of every route to
   * decide whether to render a ten-pixel circle; the row lookup it costs was
   * always cheap and indexed, and still is.
   *
   * `isSignedIn` is deliberately not here: the service is handed an id, not a
   * session, and answering it from `userId !== null` would put two files in
   * charge of one fact. The controller owns it, exactly as it does for
   * `mine`.
   */
  async myThreadSummary(
    userId: string | null,
    guestToken: string | null,
  ): Promise<Omit<MyConversationSummary, 'isSignedIn'>> {
    const thread = await this.myThread(userId, guestToken);
    return {
      unread: thread?.unreadForVisitor ?? 0,
      hasThread: thread !== null,
      // `answered` counts as open — the same sense `assertUnderOpenLimit`
      // uses. Only the instructor closing the thread makes this false.
      hasOpenThread: thread !== null && thread.status !== 'closed',
      /*
       * Derived from the thread the line above already loaded, and derived
       * from `unreadForVisitor` being non-zero rather than re-deriving "what
       * counts as unread" — the rule is written once, in `threadById`, and a
       * second copy here would be free to disagree with the dot it sits beside.
       *
       * Truncated: a 2000-character message must not ride on the probe every
       * page load of every route to fill a card that shows four lines.
       */
      latestFromAyman:
        thread && thread.unreadForVisitor > 0
          ? summaryPreview(latestAdminTeaser(thread.messages))
          : null,
    };
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

  async list(
    filter: InboxFilter,
    take: number,
    skip: number,
  ): Promise<{ rows: AdminConversationRow[]; rowCount: number }> {
    /*
     * `AND`, not spread.
     *
     * Both halves are `OR`-shaped — `INBOX_WHERE` is one, and the `unread`
     * filter is another — and two `OR` keys in one object literal is the
     * second one silently winning. That would put every automated message the
     * sweeper ever sent back on this screen, which is the exact thing
     * `INBOX_WHERE` exists to prevent.
     */
    const where: Prisma.ConversationWhereInput = {
      AND: [INBOX_WHERE, this.filterWhere(filter)],
    };

    const [rows, rowCount] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          status: true,
          origin: true,
          userId: true,
          guestName: true,
          guestPhone: true,
          entryPath: true,
          lastMessageAt: true,
          adminReadAt: true,
          user: { select: { name: true } },
          // ONE message for the preview — not the whole thread. The inbox lists
          // twenty rows; pulling every message of every one of them to show one
          // line each is the classic N+1 in list form, and an outreach thread
          // accumulates a message a week for a whole term.
          //
          // `desc`: see `AdminConversationRowSchema.preview`.
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { body: true, author: true, attachmentName: true },
          },
          // Filtered relation count, so "has the student written here" costs no
          // extra round trip and drags no message bodies along with it.
          _count: { select: { messages: { where: { author: 'visitor' } } } },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return { rows: rows.map((row) => toAdminRow(row)), rowCount };
  }

  /**
   * The WHERE for one filter tab.
   *
   * Two of the five members are not `ConversationStatus` values, so the cast on
   * the last line is only safe because both are handled above it. Adding a
   * sixth member to `INBOX_FILTERS` without a branch here is a runtime Prisma
   * error on a screen that looks fine in every type check.
   */
  private filterWhere(filter: InboxFilter): Prisma.ConversationWhereInput {
    if (filter === 'all') return {};
    if (filter === 'unread') return this.unreadWhere();
    return { status: filter as ConversationStatus };
  }

  /**
   * «غير مقروءة» — something has happened here since he last OPENED it.
   *
   * ## This used to be `status: 'open'`, and that was the bug
   *
   * Reading a thread already wrote `adminReadAt` (see `detail`), and the row's
   * accent border already cleared. The BADGE did not, because it counted
   * threads nobody had typed an answer into — so a question he had read and
   * decided needed no reply sat in the sidebar count forever, and the only way
   * to clear it was to write something. Reported as «مش عايز إنها لازم أرد
   * عشان تبقى اسمها مقروءة».
   *
   * The old comment argued that a badge which clears on a glance would hide
   * threads he meant to come back to. That concern is real and it is now
   * answered by a different control: «محتاجة رد» is still a tab, and a thread
   * he read without answering is still `open` and still on it. What changed is
   * that the count on the sidebar means «جديد» rather than «مدين»، which is
   * what a badge on an inbox means everywhere else.
   *
   * ## `status: { not: 'closed' }`
   *
   * Closing is an explicit «خلصت». A closed thread cannot receive a visitor
   * message (`postMessage` refuses), so this only excludes one case — closing
   * a thread without opening it first — and in that case the close IS the act
   * of reading it.
   *
   * The comparison is a Prisma FIELD REFERENCE, not `$queryRaw`: raw SQL would
   * register as a new delegate and fail the allowlist in
   * `assistant.service.spec.ts`, and it is not needed for a same-row compare.
   */
  private unreadWhere(): Prisma.ConversationWhereInput {
    return {
      status: { not: 'closed' },
      OR: [
        // Never opened. Unread by definition, and the reason this is not
        // simply the `gt` below: NULL compares as neither greater nor less.
        { adminReadAt: null },
        { lastMessageAt: { gt: this.prisma.conversation.fields.adminReadAt } },
      ],
    };
  }

  async unreadCount(): Promise<number> {
    /*
     * ⚠️ `INBOX_WHERE` is load-bearing here, not tidiness.
     *
     * The old count was `status: 'open'`, which excluded outreach threads for
     * an accidental reason: they are born `answered`. An `adminReadAt`-based
     * count without this term counts every automated message the sweeper has
     * ever sent — `adminReadAt` is null on all of them — so the badge would
     * read in the hundreds and point at a screen showing none of them.
     */
    return this.prisma.conversation.count({
      where: { AND: [INBOX_WHERE, this.unreadWhere()] },
    });
  }

  async detail(id: string): Promise<AdminConversationDetail> {
    const row = await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        origin: true,
        guestName: true,
        guestPhone: true,
        entryPath: true,
        lastMessageAt: true,
        adminReadAt: true,
        createdAt: true,
        /*
         * `phoneNumber` alongside the name — the ONE field this select gained
         * over the list's.
         *
         * It is not a copy of the student record; it is the record, joined at
         * read time in the query that was already fetching the row's name. See
         * `AdminConversationDetailSchema.contactPhone` for why the thread gets
         * it and the list deliberately does not.
         */
        user: { select: { name: true, phoneNumber: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            author: true,
            body: true,
            createdAt: true,
            adminReaction: true,
            attachmentKey: true,
            attachmentName: true,
            attachmentBytes: true,
            attachmentDurationSeconds: true,
            editedAt: true,
          },
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

    // A boolean existence check, not the finance table — see the contract's
    // own note on `hasActiveSubscription`. `null` for a guest: there is no
    // account to check, and running the query on `userId: null` would be a
    // wasted round trip for an answer this schema has no shape for.
    const hasActiveSubscription = row.userId
      ? (await this.prisma.accessGrant.findFirst({
          where: {
            userId: row.userId,
            source: 'purchase',
            revokedAt: null,
            validUntil: { gt: new Date() },
          },
          select: { id: true },
        })) !== null
      : null;

    return {
      // `slice(-1)`, not `slice(0, 1)`: the list's preview is the NEWEST
      // message and this shape reuses its serializer, so handing it the oldest
      // one would make the detail page's own header disagree with the row the
      // instructor just clicked.
      ...toAdminRow({
        ...row,
        messages: row.messages.slice(-1),
        _count: { messages: row.messages.filter((m) => m.author === 'visitor').length },
      }),
      // `toAdminRow` computed unread from the value BEFORE the update above;
      // by the time this response renders he has just read it.
      unreadForAdmin: false,
      createdAt: row.createdAt.toISOString(),
      // A guest typed theirs into المساعد's form; a student's is the one they
      // sign in with. Never both — a row has a `userId` or a `guestPhone`.
      contactPhone: row.user?.phoneNumber ?? row.guestPhone,
      hasActiveSubscription,
      messages: row.messages.map((message) => ({
        id: message.id,
        author: message.author,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        adminReaction: message.adminReaction,
        editedAt: message.editedAt?.toISOString() ?? null,
        attachment: toAttachment(message, `/api/admin/conversations/${row.id}`),
      })),
    };
  }

  async reply(id: string, body: string, attachment?: MessageAttachmentInput | null): Promise<void> {
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
        data: {
          conversationId: id,
          author: 'admin',
          body,
          /*
           * All three or none — the DB says so too
           * (`conversation_messages_attachment_complete`). Written from one
           * spread so a future edit cannot set two of them.
           */
          ...(attachment
            ? {
                attachmentKey: attachment.storageKey,
                attachmentName: attachment.filename,
                attachmentBytes: attachment.sizeBytes,
                // Voice notes only, and `null` for the other two kinds — the
                // CHECK refuses a duration on a message with no file at all.
                attachmentDurationSeconds: attachment.durationSeconds ?? null,
              }
            : {}),
        },
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

  /**
   * «ردّ بإيموجي» — sets or clears the instructor's reaction on one message.
   *
   * ## `updateMany` with the CONVERSATION in the WHERE, not `update` by id
   *
   * The message id and the thread id both come from the URL, and only the
   * pair is meaningful: a message id from another student's conversation must
   * match zero rows rather than be reacted to. That is the same
   * ownership-in-the-where discipline every other method here follows, and it
   * is why this cannot be `update({ where: { id: messageId } })` however much
   * shorter that is.
   *
   * ## Nothing else moves
   *
   * Not `lastMessageAt`, not `status`, not `adminReadAt`. A reaction is not a
   * reply: bumping the thread would reorder his inbox and, worse, flip an
   * `open` thread to look answered when he has said nothing. It is also
   * deliberately NOT notified — a student does not need a bell for «👍».
   */
  /**
   * «أعدل عليها» — rewriting the words of a message the INSTRUCTOR sent.
   *
   * ## Both ids are in the WHERE, and `author` is too
   *
   * A message id from another student's thread matches nothing rather than
   * being edited, which is the same compiled-in ownership every other method
   * here uses. `author: 'admin'` is the third clause and it is the one that
   * matters: a student's words are not the instructor's to rewrite, and making
   * that a WHERE rather than an `if` means there is no path where a future edit
   * forgets to check it.
   *
   * ## The thread is NOT bumped
   *
   * `lastMessageAt` stays where it was, and the conversation does not go back
   * to `answered`. An edit is a correction to something already said, not a new
   * message — bumping it would jump the thread to the top of the inbox and mark
   * a closed conversation as needing attention because a typo was fixed.
   */
  async editMessage(conversationId: string, messageId: string, body: string): Promise<void> {
    const result = await this.prisma.conversationMessage.updateMany({
      where: { id: messageId, conversationId, author: 'admin' },
      data: { body, editedAt: new Date() },
    });
    // `updateMany` reports how many rows matched, which is how "not yours" and
    // "does not exist" collapse into one honest 404 — the same shape
    // `setReaction` uses, and it never tells a caller which of the two it was.
    if (result.count === 0) throw new NotFoundException();
  }

  /**
   * «أمسحها» — removing a message the INSTRUCTOR sent.
   *
   * A real DELETE and no tombstone. «تم حذف هذه الرسالة» is what a group chat
   * needs, because the others have to be told the thread changed shape; this
   * conversation has two participants and «أنا أقدر أمسحها» is a correction,
   * not an announcement — a marker would broadcast the mistake it was meant to
   * remove.
   *
   * Same three WHERE clauses as `editMessage`, for the same reasons.
   *
   * ⚠️ The attachment's BYTES are deliberately left in storage. They become
   * unreachable the moment the row goes — both serve routes resolve a key
   * THROUGH its message and re-check the asker against the thread — so an
   * orphan is inert, and deleting the blob here would put a storage call that
   * can fail inside a path that must not half-succeed.
   */
  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    const result = await this.prisma.conversationMessage.deleteMany({
      where: { id: messageId, conversationId, author: 'admin' },
    });
    if (result.count === 0) throw new NotFoundException();
  }

  async setReaction(
    conversationId: string,
    messageId: string,
    reaction: string | null,
  ): Promise<void> {
    await this.prisma.conversationMessage.updateMany({
      where: { id: messageId, conversationId },
      data: { adminReaction: reaction },
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
    /*
     * ⚠️ `origin: 'visitor'` is load-bearing, not tidiness.
     *
     * This caps how many threads a PERSON may open. «رسايل م. أيمن» opens one
     * of its own on the student's behalf, and without this clause that thread
     * would spend one of their three — so a student who had asked three
     * questions before could no longer ask a fourth, and a student the platform
     * had written to could only ask two. Being messaged is not the same as
     * having asked.
     */
    const where: Prisma.ConversationWhereInput | null = userId
      ? { userId, origin: 'visitor', status: { not: 'closed' } }
      : guestPhone
        ? { guestPhone, origin: 'visitor', status: { not: 'closed' } }
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
        /*
         * THE LAST `THREAD_MESSAGE_WINDOW`, newest-first, reversed below.
         *
         * Unbounded until «رسايل م. أيمن». A visitor thread is naturally short
         * — a question and an answer — so "every message" was a real bound. An
         * OUTREACH thread is not: it is reused for every message the platform
         * ever sends a student, so it grows by one a week for a whole term and
         * never shrinks.
         *
         * That matters here more than anywhere else, because `myThreadSummary`
         * resolves through this method and the launcher asks for it ON EVERY
         * PAGE LOAD OF EVERY ROUTE. Left unbounded, a student a year in would
         * have forty messages read off disk to compute one integer and one
         * preview line, every single navigation.
         *
         * A window rather than pagination: this is a chat panel, the newest
         * messages are the ones anyone reads, and a «شوف أقدم» control on a
         * conversation with a teacher would be a feature nobody asked for. The
         * window is far above any real thread, so `unreadForVisitor` below is
         * exact in practice — it could only under-count for someone with a
         * hundred unread messages, who has a different problem.
         */
        messages: {
          orderBy: { createdAt: 'desc' },
          take: THREAD_MESSAGE_WINDOW,
          select: {
            id: true,
            author: true,
            body: true,
            createdAt: true,
            adminReaction: true,
            attachmentKey: true,
            attachmentName: true,
            attachmentBytes: true,
            attachmentDurationSeconds: true,
            editedAt: true,
          },
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
    /*
     * Back into reading order. The query takes the LAST N, which means it has
     * to order descending — every renderer of this shape draws newest-last,
     * and `AssistantThread` scrolls to `messages[length - 1]`.
     */
    const messages = [...row.messages].reverse();
    return {
      id: row.id,
      status: row.status,
      entryPath: row.entryPath,
      messages: messages.map((message) => ({
        id: message.id,
        author: message.author,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        adminReaction: message.adminReaction,
        editedAt: message.editedAt?.toISOString() ?? null,
        // The VISITOR's route, not the admin's. Same bytes, a different door
        // — and the student would get a 403 at the other one.
        attachment: toAttachment(message, `/api/assistant/conversations/${row.id}`),
      })),
      unreadForVisitor: messages.filter(
        (message) =>
          message.author === 'admin' && (!visitorRead || message.createdAt > visitorRead),
      ).length,
    };
  }
}

/**
 * What the inbox IS: every thread a human wrote in.
 *
 * NOT `origin: 'visitor'`. It includes an outreach thread a student answered,
 * and those are the most important rows on the screen — the platform reached
 * out and it worked. Written as an EXISTS over the messages rather than as a
 * flag on the conversation, because a flag would be a second copy of a fact
 * the messages already state and would be wrong the first time a write path
 * forgot to maintain it.
 *
 * ## It used to be one of two «scopes», and the other one is gone
 *
 * There was a second half — «اللي بعتّه», `origin: 'outreach'` — as a tab on
 * this screen. Asked for its removal in as many words: «مسيجات اللي بيبعتها
 * النظام… مش عايز في صندوق الوارد خالص. إلا بقى لو الشخص كلمني أنا». The
 * exception is exactly the `messages.some` clause below, and the section it
 * moved to already existed: `/admin/outreach` — «رسايلي للطلبة» — which shows
 * every automated message with the facts it was composed from, which is more
 * than the tab ever did.
 *
 * So this is a constant, not a function of a query parameter, and the
 * parameter is gone with it: a `?scope=` nothing sends is a second answer to
 * «what is the inbox» waiting to drift from this one.
 */
const INBOX_WHERE: Prisma.ConversationWhereInput = {
  OR: [{ origin: 'visitor' }, { messages: { some: { author: 'visitor' } } }],
};

/**
 * The thread shape as the wire wants it, from the three columns as the table
 * holds them.
 *
 * `basePath` is the caller's audience — `/api/admin/conversations/:id` or
 * `/api/assistant/conversations/:id`. Passing it in rather than deriving it
 * here is what stops a serializer from handing a student a path only the admin
 * may follow.
 *
 * A key whose extension is not in `MIME_FOR_EXT` serializes as `null` rather
 * than throwing: the row would have to have been hand-edited to get there, and
 * a thread that 500s is worse than a bubble missing a file.
 */
function toAttachment(
  message: {
    id: string;
    attachmentKey: string | null;
    attachmentName: string | null;
    attachmentBytes: number | null;
    attachmentDurationSeconds: number | null;
  },
  basePath: string,
): MessageAttachment | null {
  if (!message.attachmentKey || !message.attachmentName || !message.attachmentBytes) return null;
  const mime = mimeForStorageKey(message.attachmentKey);
  if (!mime) return null;

  /* Three kinds from one fact — the mime the KEY implies. Nothing is stored to
     say "this one is a voice note": the extension was chosen by us from the
     sniffed container, so it is the only statement about the bytes that could
     not have been forged, and a `kind` column beside it could only drift. */
  const kind = mime.startsWith('audio/') ? 'voice' : mime.startsWith('image/') ? 'image' : 'document';

  const path = `${basePath}/messages/${message.id}/attachment`;
  return {
    kind,
    filename: message.attachmentName,
    sizeBytes: message.attachmentBytes,
    // Only a voice note has one, and only a voice note's player reads it.
    durationSeconds: kind === 'voice' ? message.attachmentDurationSeconds : null,
    path,
    downloadPath: `${path}?download=1`,
  };
}

interface AdminRowSource {
  id: string;
  status: ConversationStatus;
  origin: ConversationOrigin;
  userId: string | null;
  guestName: string | null;
  guestPhone: string | null;
  entryPath: string[];
  lastMessageAt: Date;
  adminReadAt: Date | null;
  user: { name: string } | null;
  messages: { body: string; author: MessageAuthor; attachmentName: string | null }[];
  _count: { messages: number };
}

function toAdminRow(row: AdminRowSource): AdminConversationRow {
  const isGuest = row.user === null;
  return {
    id: row.id,
    status: row.status,
    origin: row.origin,
    hasVisitorReply: row._count.messages > 0,
    /*
     * The account name wins when there is one. `guestName` is only ever set on
     * a guest row, so this is not a fallback that could silently show the
     * wrong person — but ordering it this way also means a thread orphaned by
     * an account deletion (`onDelete: SetNull`) still renders something rather
     * than an empty cell.
     */
    who: row.user?.name ?? row.guestName ?? '',
    // The account, for the link the name carries into `/admin/students/:id`.
    // Null for a guest, who has no record to open.
    userId: row.userId,
    isGuest,
    // Never for a signed-in student: their number is on their profile, and the
    // LIST should not become a second, staler copy of it. The thread does
    // carry one — see `AdminConversationDetailSchema.contactPhone` — because
    // it is one row, joined live, rather than twenty copies.
    guestPhone: isGuest ? row.guestPhone : null,
    entryPath: row.entryPath,
    preview: preview(row.messages[0]),
    // An empty thread cannot exist (`open` writes both rows in one
    // transaction), so the fallback is only ever reached by a hand-edited row.
    previewAuthor: row.messages[0]?.author ?? 'visitor',
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
/**
 * When the instructor last said something the visitor has not seen, or `null`
 * when there is nothing waiting in this thread.
 *
 * The same rule `threadById` counts `unreadForVisitor` by — an admin message
 * newer than `visitorReadAt`, and a never-opened thread is unread by
 * definition. Written once, here, so the thread the widget LANDS on and the
 * dot that sent them there cannot disagree.
 */
function latestUnreadAdminMessage(row: {
  visitorReadAt: Date | null;
  messages: { createdAt: Date }[];
}): Date | null {
  const latest = row.messages[0]?.createdAt;
  if (!latest) return null;
  if (!row.visitorReadAt) return latest;
  return latest > row.visitorReadAt ? latest : null;
}

function preview(message?: { body: string; attachmentName: string | null }): string {
  const oneLine = (message?.body ?? '').replace(/\s+/gu, ' ').trim();
  /*
   * A caption-less attachment has an EMPTY body — the widened CHECK allows it
   * — and an empty preview line reads as a broken row rather than as a file.
   * The filename is what the row should say in that case, and it is prefixed
   * with a paperclip rather than an Arabic string because this is a serializer:
   * copy belongs in `copy.assistant.inbox`, and the client cannot tell a blank
   * preview from a blank message.
   */
  if (oneLine) return oneLine.length <= PREVIEW_MAX ? oneLine : `${oneLine.slice(0, PREVIEW_MAX)}…`;
  return message?.attachmentName ? `📎 ${message.attachmentName}` : '';
}

/**
 * The dashboard card's teaser.
 *
 * Longer than the inbox's, and NOT flattened to one line: an outreach message
 * is written in paragraphs with a bulleted list of topics in the middle, and
 * collapsing the newlines turns that list into a wall of text — the card
 * renders it `whitespace-pre-wrap` for exactly that reason. Runs of blank
 * lines are still squeezed, so the truncation budget is not spent on gaps.
 */
/**
 * What the dashboard card teases from the newest thing the instructor said.
 *
 * The `||` rather than `??` is the whole point: a message that is only a file
 * has an EMPTY body, not a null one, so `??` would hand the card a blank
 * string and it would render an empty quote under his name. The filename is
 * what that message actually is.
 */
function latestAdminTeaser(messages: ConversationMessageEntry[]): string {
  const latest = [...messages].reverse().find((message) => message.author === 'admin');
  if (!latest) return '';
  return latest.body || (latest.attachment ? `📎 ${latest.attachment.filename}` : '');
}

/**
 * Exported for `AssistantController`, which uses the exact same truncation
 * to build the `preview` it hands `NotificationsService.notifyPermission` for
 * `assistant_question_received` — one function deciding what "a short
 * snapshot of what was said" means, rather than two call sites agreeing on a
 * cut length by coincidence.
 */
export function summaryPreview(body: string): string {
  const tidied = body.replace(/[^\S\n]+/gu, ' ').replace(/\n{2,}/gu, '\n').trim();
  return tidied.length <= SUMMARY_PREVIEW_MAX
    ? tidied
    : `${tidied.slice(0, SUMMARY_PREVIEW_MAX)}…`;
}
