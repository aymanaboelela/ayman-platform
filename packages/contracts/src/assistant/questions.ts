import { z } from '@ayman/contracts/zod';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';

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

export type AssistantQuestion = z.infer<typeof AssistantQuestionSchema>;
export type AssistantQuestionPage = z.infer<typeof AssistantQuestionPageSchema>;
export type AssistantQuestionQuery = z.infer<typeof AssistantQuestionQuerySchema>;
