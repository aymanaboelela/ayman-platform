import { z } from '@ayman/contracts/zod';
import { egyptianPhone } from '@ayman/contracts/phone';
import { isAssistantNodeId } from '@ayman/contracts/assistant/script';
import { MAX_DOCUMENT_BYTES, isValidStorageKey } from '@ayman/contracts/admin/media';

/**
 * The conversation المساعد escalates into, on the wire.
 *
 * ## Text, never HTML
 *
 * `body` is a plain string and every renderer puts it in a text node. There is
 * no rich-text path here at all, which is the actual control — `sanitizeRichText`
 * guards the places that DO have an HTML sink (lesson text, course
 * descriptions), and adding one here would be the regression, not removing the
 * sanitiser.
 *
 * ## No `guestPhone` on any visitor-facing shape
 *
 * The number a guest leaves is for the instructor to reach them. It appears on
 * `AdminConversationDetail` and nowhere else — a thread read back through the
 * guest cookie must not echo it, or a stolen cookie becomes a phone-number
 * disclosure on top of a thread disclosure.
 */

export const CONVERSATION_STATUSES = ['open', 'answered', 'closed'] as const;
export const ConversationStatusSchema = z.enum(CONVERSATION_STATUSES);

/**
 * Who spoke first.
 *
 * `visitor` is every thread المساعد escalated. `outreach` is a thread the
 * platform opened in the instructor's name — a result message, a nudge, a group
 * invite. The column exists because the inbox has to be able to answer two
 * different questions ("who is waiting on me" and "what went out under my
 * name") and a status filter cannot separate them: an outreach thread a student
 * replied to is `open`, exactly like a question they asked cold.
 */
export const CONVERSATION_ORIGINS = ['visitor', 'outreach'] as const;
export const ConversationOriginSchema = z.enum(CONVERSATION_ORIGINS);

export const MESSAGE_AUTHORS = ['visitor', 'admin'] as const;
export const MessageAuthorSchema = z.enum(MESSAGE_AUTHORS);

/** Caps the free-text a stranger can post in one go. Enforced before the
 *  service runs, so an oversized body never reaches Postgres. */
export const MESSAGE_MAX = 2000;
const MESSAGE_MIN = 2;

const messageBody = z
  .string()
  .trim()
  .min(MESSAGE_MIN, 'السؤال الأول لسه فاضي')
  .max(MESSAGE_MAX, `الرسالة طويلة أوي — الحد ${MESSAGE_MAX} حرف`);

/**
 * The trail of node ids the visitor walked before asking for a human.
 *
 * Validated element-by-element against the real node table rather than as
 * `string[]`: it arrives from a browser, and the admin inbox renders each
 * element by looking its Arabic up in `copy.assistant.script`. An unknown id
 * there is either a blank crumb or a crash, depending on how carefully the
 * renderer was written — so it never gets stored in the first place.
 *
 * Capped at 24 because the deepest real path is four, and an unbounded array
 * on a public endpoint is a free write amplifier.
 */
export const EntryPathSchema = z
  .array(z.string().refine(isAssistantNodeId, 'خطوة مش معروفة'))
  .max(24);

/** `POST /api/assistant/conversations` — opening one. */
export const OpenConversationSchema = z
  .object({
    entryPath: EntryPathSchema,
    message: messageBody,
    /**
     * Required for an anonymous visitor, absent for a signed-in one — the
     * SERVER decides which, from the session, and ignores whatever the body
     * says about identity. A signed-in caller posting a name here is not
     * renaming themselves in the inbox.
     */
    name: z.string().trim().min(2, 'الاسم لسه فاضي').max(120).optional(),
    phone: egyptianPhone('رقم الواتساب مطلوب').optional(),
  })
  .strict();

/** `POST /api/assistant/conversations/:id/messages` — a follow-up. */
export const PostMessageSchema = z.object({ message: messageBody }).strict();

// ── attachments ──────────────────────────────────────────────────────────

/**
 * A file the INSTRUCTOR attached to a reply — a lecture PDF, a photo of a
 * worked solution.
 *
 * ## One direction, deliberately
 *
 * `PostMessageSchema` above is untouched: a student cannot attach anything.
 * That is not an oversight to fill in later — the upload endpoint costs
 * `media:write`, the storage has no quota, and the people on the other end of
 * these threads are fifteen. Receiving a file needs no permission; sending one
 * does.
 *
 * ## What is stored, and what is NOT
 *
 * The key, the display name and the size. There is no `mime` column anywhere
 * on this path: every pipeline picks the stored extension from the DETECTED
 * type, so `mimeForStorageKey` reads it back off the key — and a second copy
 * in a column could only ever disagree with the bytes. Same reasoning that
 * makes `DocumentService` refuse to echo an uploader's `Content-Type`.
 */
export const MessageAttachmentInputSchema = z
  .object({
    /*
     * Validated against the same anchored patterns the filesystem layer uses.
     * This is the value a browser hands back after uploading, so it is
     * attacker-controlled: without the check, a reply could name
     * `../../etc/passwd` and the storage layer would be the only thing
     * standing between that and a read.
     */
    storageKey: z.string().refine(isValidStorageKey, 'الملف مش معروف'),
    /** Display only. Never used to build a path — see `DocumentService`. */
    filename: z.string().trim().min(1).max(200),
    sizeBytes: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
  })
  .strict();

/**
 * The attachment as a THREAD renders it.
 *
 * `path`, not a storage URL, and the difference is the security control: a
 * conversation attachment lives under the `msg/` prefix, which the public
 * media route cannot address, and comes back only through an `/api/…` route
 * that re-checks who is asking on every request. Structurally the same promise
 * `PlayerResourceSchema` makes with `z.string().startsWith('/api/')`.
 *
 * The path is computed per AUDIENCE — the admin serializer emits the admin
 * route, the visitor serializer emits the visitor one — so neither side is
 * ever handed a URL it is not allowed to follow.
 */
export const MessageAttachmentSchema = z.object({
  /** `image` renders inline in the bubble; `document` renders as a file card. */
  kind: z.enum(['image', 'document']),
  filename: z.string(),
  sizeBytes: z.number().int().positive(),
  /** Inline: an `<img src>` or an iframe. */
  path: z.string().startsWith('/api/'),
  /** The same bytes with `Content-Disposition: attachment`. */
  downloadPath: z.string().startsWith('/api/'),
});

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;
export type MessageAttachmentInput = z.infer<typeof MessageAttachmentInputSchema>;

/**
 * `POST /api/admin/conversations/:id/reply`.
 *
 * ## Why `message` is no longer simply `messageBody`
 *
 * A reply that is ONLY a file is a real message — «اتفضل المحاضرة» is a
 * courtesy, not a requirement, and forcing him to type one to send a PDF is
 * the kind of friction that ends with the file going out on WhatsApp instead.
 * So the two-character floor moves from the field to the OBJECT: a reply must
 * carry words or a file, and may carry both.
 *
 * The ceiling stays on the field, because it is about the column.
 */
export const ReplySchema = z
  .object({
    message: z.string().trim().max(MESSAGE_MAX, `الرسالة طويلة أوي — الحد ${MESSAGE_MAX} حرف`),
    attachment: MessageAttachmentInputSchema.nullish(),
  })
  .strict()
  .refine(
    (value) => value.message.length >= MESSAGE_MIN || Boolean(value.attachment),
    { message: 'اكتب رسالة أو ارفق ملف', path: ['message'] },
  );

/** `PATCH /api/admin/conversations/:id/status`. Reopening is `open`. */
export const SetStatusSchema = z
  .object({ status: z.enum(['open', 'closed']) })
  .strict();

/**
 * «ردّ بإيموجي» — what the instructor may put on a message.
 *
 * A CLOSED LIST, and the API validates against it rather than accepting any
 * string the client sends. Two reasons, and the second is the real one:
 *
 *   · the column is a `VARCHAR(16)` a UI draws in a 20px circle, and «any
 *     string» is how a paragraph ends up in it;
 *   · every one of these renders on a STUDENT's screen under the instructor's
 *     name. An open field would mean the platform could show a fifteen-year-old
 *     any glyph an attacker could get into a request — including the ones that
 *     are not funny. Six he would actually use is the whole requirement.
 *
 * The order is the order they appear in the picker: agreement first, because
 * that is what «👍» on a student's reply is for.
 */
export const MESSAGE_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '🙏'] as const;
export const MessageReactionSchema = z.enum(MESSAGE_REACTIONS);
export type MessageReaction = (typeof MESSAGE_REACTIONS)[number];

/**
 * `PUT /api/admin/conversations/:id/messages/:messageId/reaction`.
 *
 * `null` CLEARS it — the same request that sets one, which is what makes
 * tapping the same emoji twice work without a DELETE route whose only
 * difference is the verb.
 */
export const SetReactionSchema = z
  .object({ reaction: MessageReactionSchema.nullable() })
  .strict();

export const ConversationMessageSchema = z.object({
  id: z.uuid(),
  author: MessageAuthorSchema,
  body: z.string(),
  createdAt: z.iso.datetime(),
  /**
   * The instructor's emoji, or `null`.
   *
   * On the wire as a plain nullable string rather than the enum: a row written
   * when the picker offered a seventh emoji must still render after it is
   * removed from the list, and a thread that throws on one historical value is
   * worse than one that shows a glyph nobody can pick any more.
   */
  adminReaction: z.string().nullable(),
  /** The file on this message, or `null` — see `MessageAttachmentSchema`. */
  attachment: MessageAttachmentSchema.nullable(),
});

/** What the widget renders for the visitor's own thread. */
export const ConversationThreadSchema = z.object({
  id: z.uuid(),
  status: ConversationStatusSchema,
  entryPath: z.array(z.string()),
  messages: z.array(ConversationMessageSchema),
  /** Drives the dot on the floating button without opening the panel. */
  unreadForVisitor: z.number().int().min(0),
});

/**
 * `null` — with a 200, not a 404 — when the caller has no thread.
 *
 * A 404 would make "you have never written to us" indistinguishable from "the
 * id you guessed does not exist", and a client would have to treat an error
 * status as a normal state.
 *
 * ⚠️ This is the PANEL's shape now, fetched when it opens. The launcher, which
 * asks on every page load of every route, reads
 * `@ayman/contracts/assistant/summary` instead — pulling a whole conversation
 * to decide whether to draw an unread dot was a cost this endpoint could not
 * shrink, because messages are the entire point of it.
 */
export const MyConversationSchema = z.object({
  conversation: ConversationThreadSchema.nullable(),
  /**
   * Whether the caller is signed in — answered HERE rather than by a second
   * request to `/api/session`.
   *
   * The widget needs it for one decision: whether to ask for a name and a
   * WhatsApp number. A signed-in student already gave the platform both, and
   * asking again is the difference between a form that respects what it knows
   * and one that does not. Two round trips to render one panel is not worth
   * the tidier separation.
   *
   * It is NOT an authorization signal and nothing gates on it: the server
   * takes identity from the session on every write regardless of what the
   * client believes.
   *
   * The summary shape above carries the same flag, and that is the copy the
   * widget actually reads — the handoff form can be reached without any
   * thread ever being fetched, so the answer has to be on the shape that
   * always arrives. Kept here rather than removed: it is what lets this
   * response be interpreted on its own, which is the property the paragraph
   * above argued for in the first place.
   */
  isSignedIn: z.boolean(),
});

// ── admin ────────────────────────────────────────────────────────────────

export const AdminConversationRowSchema = z.object({
  id: z.uuid(),
  status: ConversationStatusSchema,
  origin: ConversationOriginSchema,
  /**
   * The student has written in this thread at least once.
   *
   * On a `visitor` thread this is trivially true and the list ignores it. On an
   * `outreach` one it is the whole story, and it is the ONLY thing that lets
   * such a thread onto this screen at all: a message the platform sent and
   * nobody answered belongs in «رسايلي للطلبة», not in the inbox. See
   * `AssistantService`'s `INBOX_WHERE`.
   */
  hasVisitorReply: z.boolean(),
  /** The student's account name, or the name a guest typed. */
  who: z.string(),
  /**
   * The account behind the thread, or `null` for a guest.
   *
   * On the ROW as well as the detail, so the list can make each name a link
   * into `/admin/students/:userId` — «لو ضغطت على الاسم بتاع الشخص أقدر إني
   * أدخل البروفايل الشخصي بتاعه». A guest has no record to open and stays
   * plain text.
   */
  userId: z.string().nullable(),
  isGuest: z.boolean(),
  /** `null` for a signed-in student — their profile already holds it. */
  guestPhone: z.string().nullable(),
  entryPath: z.array(z.string()),
  /**
   * First line of the LATEST message, truncated server-side.
   *
   * The newest line, not the opening one. On a single-message thread — which
   * almost every escalation is — the two are the same string, so nothing about
   * the escalation inbox changed. On the threads where they differ (a student
   * who followed up, and every outreach thread, which accumulates) the newest
   * line is the one that says what the row needs from him now, and the opening
   * one is a summary of a conversation that has moved on.
   */
  preview: z.string(),
  /** Who wrote `preview`, so the list can prefix «إنت:» on his own words. */
  previewAuthor: MessageAuthorSchema,
  lastMessageAt: z.iso.datetime(),
  /**
   * Something has happened here since the instructor last OPENED it.
   *
   * Not "unanswered" — opening the thread writes `adminReadAt`, and that is
   * what this compares against. It drives the row's accent border, the
   * «غير مقروءة» tab and the sidebar badge, all three off one rule so they
   * cannot disagree about what the number means.
   */
  unreadForAdmin: z.boolean(),
});

export const AdminConversationDetailSchema = AdminConversationRowSchema.extend({
  messages: z.array(ConversationMessageSchema),
  createdAt: z.iso.datetime(),
  /**
   * The number to reach this person on, in E.164 — a guest's typed number, or
   * a signed-in student's account phone.
   *
   * ## Why this is on the DETAIL and never on the row
   *
   * `guestPhone` above is `null` for a signed-in student on purpose, under the
   * rule that the inbox must not become a second, staler copy of the student
   * record. That rule still holds for the LIST, which renders twenty rows and
   * needs none of them.
   *
   * The thread is a different question. He is reading one conversation and the
   * next thing he wants is to answer it on WhatsApp — «زرار الاتصال يوديني
   * يكلمه واتساب» — and sending him to the student record to copy a number
   * back is not a screen, it is an errand. This is read LIVE off
   * `users.phone_number` in the same query, so it is not a copy of anything:
   * it is the record, joined at read time.
   */
  contactPhone: z.string().nullable(),
});

export const AdminUnreadCountSchema = z.object({
  unread: z.number().int().min(0),
});

/**
 * Inbox filters.
 *
 * ## `unread` is first, and it is the default
 *
 * It used to be `open`, and `open` meant "nobody has typed an answer yet" —
 * so a thread he had opened, read and decided needed no reply sat on the
 * default screen forever, and the sidebar badge (which counted the same
 * population) never went down. Asked for directly: «لو أنا شفت المحادثة دخلت
 * عليها وبصيت عليها، هيبقى كده أعتبر إنها مقروءة. مش عايز إنها لازم أرد».
 *
 * So reading is what clears this list, and answering is a separate question
 * that keeps its own tab. The two are genuinely different — a question that
 * needs a reply is a debt, a message he has not looked at is news — and the
 * screen now has one tab each rather than one tab pretending to be both.
 *
 * ⚠️ `unread` and `all` are NOT `ConversationStatus` values. `AssistantService.list`
 * casts the filter into a Prisma `status` WHERE, so both have to stay
 * special-cased there; adding a third non-status member without touching that
 * switch is a runtime Prisma error, not a type error.
 */
export const INBOX_FILTERS = ['unread', 'open', 'answered', 'closed', 'all'] as const;
export const InboxFilterSchema = z.enum(INBOX_FILTERS).default('unread');

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type ConversationOrigin = (typeof CONVERSATION_ORIGINS)[number];
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];
export type OpenConversationInput = z.input<typeof OpenConversationSchema>;
export type PostMessageInput = z.infer<typeof PostMessageSchema>;
export type ReplyInput = z.infer<typeof ReplySchema>;
export type SetReactionInput = z.infer<typeof SetReactionSchema>;
export type ConversationMessageEntry = z.infer<typeof ConversationMessageSchema>;
export type ConversationThread = z.infer<typeof ConversationThreadSchema>;
export type MyConversation = z.infer<typeof MyConversationSchema>;
export type AdminConversationRow = z.infer<typeof AdminConversationRowSchema>;
export type AdminConversationDetail = z.infer<typeof AdminConversationDetailSchema>;
export type InboxFilter = (typeof INBOX_FILTERS)[number];
