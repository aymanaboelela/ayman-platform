import { z } from '@ayman/contracts/zod';
import { egyptianPhone } from '@ayman/contracts/phone';
import { isAssistantNodeId } from '@ayman/contracts/assistant/script';

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

export const MESSAGE_AUTHORS = ['visitor', 'admin'] as const;
export const MessageAuthorSchema = z.enum(MESSAGE_AUTHORS);

/** Caps the free-text a stranger can post in one go. Enforced before the
 *  service runs, so an oversized body never reaches Postgres. */
export const MESSAGE_MAX = 2000;
const MESSAGE_MIN = 2;

const messageBody = z
  .string()
  .trim()
  .min(MESSAGE_MIN, 'اكتب سؤالك الأول')
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
    name: z.string().trim().min(2, 'اكتب اسمك').max(120).optional(),
    phone: egyptianPhone('رقم الواتساب مطلوب').optional(),
  })
  .strict();

/** `POST /api/assistant/conversations/:id/messages` — a follow-up. */
export const PostMessageSchema = z.object({ message: messageBody }).strict();

/** `POST /api/admin/conversations/:id/reply`. */
export const ReplySchema = z.object({ message: messageBody }).strict();

/** `PATCH /api/admin/conversations/:id/status`. Reopening is `open`. */
export const SetStatusSchema = z
  .object({ status: z.enum(['open', 'closed']) })
  .strict();

export const ConversationMessageSchema = z.object({
  id: z.uuid(),
  author: MessageAuthorSchema,
  body: z.string(),
  createdAt: z.iso.datetime(),
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
 * id you guessed does not exist", and the widget would have to treat an error
 * status as a normal state on every single page load.
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
   */
  isSignedIn: z.boolean(),
});

// ── admin ────────────────────────────────────────────────────────────────

export const AdminConversationRowSchema = z.object({
  id: z.uuid(),
  status: ConversationStatusSchema,
  /** The student's account name, or the name a guest typed. */
  who: z.string(),
  isGuest: z.boolean(),
  /** `null` for a signed-in student — their profile already holds it. */
  guestPhone: z.string().nullable(),
  entryPath: z.array(z.string()),
  /** First line of the opening message, for the list. Truncated server-side. */
  preview: z.string(),
  lastMessageAt: z.iso.datetime(),
  /** Unanswered since the instructor last looked. Drives the dot and the badge. */
  unreadForAdmin: z.boolean(),
});

export const AdminConversationDetailSchema = AdminConversationRowSchema.extend({
  /** Present only when a signed-in student opened it — links to their record. */
  userId: z.string().nullable(),
  messages: z.array(ConversationMessageSchema),
  createdAt: z.iso.datetime(),
});

export const AdminUnreadCountSchema = z.object({
  unread: z.number().int().min(0),
});

/** Inbox filters. `all` is deliberately not the default — the screen exists
 *  to surface what still needs an answer. */
export const INBOX_FILTERS = ['open', 'answered', 'closed', 'all'] as const;
export const InboxFilterSchema = z.enum(INBOX_FILTERS).default('open');

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];
export type OpenConversationInput = z.input<typeof OpenConversationSchema>;
export type PostMessageInput = z.infer<typeof PostMessageSchema>;
export type ReplyInput = z.infer<typeof ReplySchema>;
export type ConversationMessageEntry = z.infer<typeof ConversationMessageSchema>;
export type ConversationThread = z.infer<typeof ConversationThreadSchema>;
export type MyConversation = z.infer<typeof MyConversationSchema>;
export type AdminConversationRow = z.infer<typeof AdminConversationRowSchema>;
export type AdminConversationDetail = z.infer<typeof AdminConversationDetailSchema>;
export type InboxFilter = (typeof INBOX_FILTERS)[number];
