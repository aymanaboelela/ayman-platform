import { z } from '@ayman/contracts/zod';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';
import { ConversationStatusSchema } from '@ayman/contracts/assistant/conversation';

/**
 * `GET /api/admin/assistant/questions` — what students actually typed into
 * المساعد, for the one person who can act on it.
 *
 * ## ⚠️ This REVERSES a documented decision, deliberately
 *
 * The open chat shipped storing nothing at all: «The question, the history and
 * the answer live for the length of one request… No transcript table, no log
 * line carrying what a student typed.» That was the right default for a
 * feature nobody had used yet, and it is the wrong one now that it is
 * answering real questions — because the single most valuable thing in this
 * product is the list of things students asked and did not get a good answer
 * to. It is what the corpus should be written from, and it was being thrown
 * away.
 *
 * So the exchange is kept, and the cost of keeping it is paid explicitly:
 *
 *   - The ADMIN is the only reader. There is no student-facing route.
 *   - Rows expire. Ninety days is long enough to spot a pattern across a term
 *     and short enough that a database dump is not a permanent record of what
 *     a fifteen-year-old typed at midnight.
 *   - The student is a `userId` or nothing. No name, no phone, no IP is
 *     copied into this table — the name on screen is joined at read time from
 *     the account that is still there.
 */

/** One exchange, as the admin list shows it. */
export const AssistantQuestionSchema = z.object({
  id: z.uuid(),
  question: z.string(),
  answer: z.string(),
  /**
   * Which model answered, or `null` when the written corpus did.
   *
   * The single most useful column for reading the rest: an answer from
   * `script` is one the model never saw, and a page full of them means the
   * keys are exhausted rather than that the answers are bad.
   */
  provider: z.string().nullable(),
  /** المساعد said this one needed a person. */
  escalated: z.boolean(),
  /** The student's name, joined at read time. `null` for a visitor. */
  studentName: z.string().nullable(),
  /**
   * Whether there is an ACCOUNT behind this row at all — not merely whether
   * `studentName` happens to be set. A signed-in student whose account was
   * since deleted also reads `studentName: null`, and the admin screen needs
   * to tell that apart from an anonymous visitor: one is a person the
   * platform could in principle reach again, the other never was.
   */
  isGuest: z.boolean(),
  /**
   * A real conversation this same signed-in student has open or has had,
   * closest in time to this question — `null` when none exists (including
   * always, for a guest: see `isGuest`).
   *
   * Present only to let the admin screen ask "did anything come of this" in
   * one glance and jump straight to `/admin/inbox/:id`. It is a HINT, not a
   * claim that the conversation is ABOUT this question — a student who
   * already had an open thread about something else still shows one here.
   */
  conversationId: z.uuid().nullable(),
  askedAt: z.iso.datetime(),
});

/** `{ rows, rowCount }` — the shape every admin list in this product returns. */
export const AssistantQuestionPageSchema = listResponse(AssistantQuestionSchema);

/**
 * The one filter worth having on day one.
 *
 * «اللي المساعد وقف قدامه» is the actionable half of this screen — every row
 * where it had to hand over is a gap in the corpus with a student's own
 * wording attached.
 */
export const AssistantQuestionQuerySchema = ListQuerySchema.extend({
  escalatedOnly: z.coerce.boolean().default(false),
}).strict();

/**
 * `GET /api/admin/assistant/questions/:id/context` — everything around one
 * exchange: what else this student asked in the same visit, and whether it
 * ever became a real conversation.
 *
 * ## Why "siblings" and not "the conversation"
 *
 * The open chat keeps no session id (see `AssistantQuestionService.record`'s
 * own note — the signature carries no identity beyond `userId`), so there is
 * no exact boundary for "this visit". `siblings` is therefore a RECONSTRUCTION
 * — every other question from the same signed-in student within a few hours
 * of this one — not a guaranteed replay of one sitting. Good enough to answer
 * "was this a one-off or part of a longer back-and-forth", which is the
 * question this screen exists to answer; not good enough to claim as a
 * transcript.
 *
 * A guest question has no siblings and no conversation link at all: without a
 * stable identity across requests (no session token is captured today), a
 * second question five minutes later from the same visitor is indistinguishable
 * from a different person entirely. `isGuest: true` says so plainly rather
 * than the screen silently showing an empty list that looks like "asked once".
 */
export const AssistantQuestionContextSchema = z.object({
  question: AssistantQuestionSchema,
  /** Ordered oldest first — read top to bottom like a conversation would be. */
  siblings: z.array(AssistantQuestionSchema),
  conversation: z
    .object({
      id: z.uuid(),
      status: ConversationStatusSchema,
      startedAt: z.iso.datetime(),
    })
    .nullable(),
});

export type AssistantQuestion = z.infer<typeof AssistantQuestionSchema>;
export type AssistantQuestionPage = z.infer<typeof AssistantQuestionPageSchema>;
export type AssistantQuestionQuery = z.infer<typeof AssistantQuestionQuerySchema>;
export type AssistantQuestionContext = z.infer<typeof AssistantQuestionContextSchema>;
