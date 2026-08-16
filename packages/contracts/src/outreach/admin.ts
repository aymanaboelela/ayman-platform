import { z } from '@ayman/contracts/zod';
import { OUTREACH_KINDS } from '@ayman/contracts/outreach/kinds';

/**
 * `/admin/outreach` — what the platform said in the instructor's name, to whom,
 * and whether it landed.
 *
 * ## Why the log is a first-class screen and not a filter on the inbox
 *
 * The inbox answers "who is waiting on me". This answers a different question —
 * "what went out under my name while I was asleep" — and a system that speaks
 * for someone owes them a place to read every word of it. The two screens share
 * the conversation rows underneath; they do not share a purpose.
 *
 * ## `facts`, not prose
 *
 * Each row carries the numbers the message was composed FROM as well as the
 * body that was composed. The body says what the student read; the facts say
 * why. Without the second half the screen can show him a message he cannot
 * check.
 */

export const OutreachKindSchema = z.enum(OUTREACH_KINDS);

/** One weak or strong area, as the log renders it back. */
export const OutreachTopicSchema = z.object({
  name: z.string().nullable(),
  questionNumbers: z.array(z.number().int().min(1)),
});

/**
 * The facts snapshot, per kind.
 *
 * A loose `z.record` would have been less code and would have let the screen
 * render `undefined` for a field an older build never wrote. This is the same
 * discriminated-union discipline `notifications.ts` argues for, for the same
 * reason: the consumer should not have to re-derive which kind it is holding
 * from which fields happen to be set.
 */
export const OutreachFactsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('quiz_result'),
    quizTitle: z.string(),
    scorePercent: z.number().min(0).max(100),
    weakTopics: z.array(OutreachTopicSchema),
    strongTopics: z.array(z.string()),
  }),
  z.object({ kind: z.literal('quiz_nudge'), lessonTitle: z.string() }),
  z.object({ kind: z.literal('lesson_praise'), lessonTitle: z.string() }),
  z.object({ kind: z.literal('whatsapp_invite') }),
]);

export const OutreachLogRowSchema = z.object({
  id: z.uuid(),
  kind: OutreachKindSchema,
  /** Links to the student record. `null` once the account is deleted. */
  userId: z.string().nullable(),
  studentName: z.string(),
  /** Opens the thread in the inbox, where he can answer it. */
  conversationId: z.uuid(),
  /** The full body. Short enough that truncating it would only hide the point. */
  body: z.string(),
  facts: OutreachFactsSchema,
  createdAt: z.iso.datetime(),
  /**
   * The student opened the thread after this message landed.
   *
   * Derived from `conversations.visitor_read_at`, which is why it is a boolean
   * here and a timestamp there: the screen only ever asks "did it land".
   */
  seen: z.boolean(),
  /** They wrote back. The strongest signal any of these messages can produce. */
  replied: z.boolean(),
});

/** Kind counts for the header strip. */
export const OutreachStatsSchema = z.object({
  sent: z.number().int().min(0),
  seen: z.number().int().min(0),
  replied: z.number().int().min(0),
  /** Last 30 days, so the strip means something on a platform a year old. */
  sentRecent: z.number().int().min(0),
  /**
   * The earliest moment the platform will write about — see
   * `OutreachSweeper.activationFloor`.
   *
   * Shown because a rule that silently drops work has to be visible somewhere,
   * or the first question it produces («ليه مبعتش عن امتحان امبارح؟») has no
   * answer on any screen. `null` only before the very first message has ever
   * been sent, when there is nothing to explain yet.
   */
  activeSince: z.iso.datetime().nullable(),
});

/**
 * `GET /api/admin/outreach/preview` — the composer, run on invented facts.
 *
 * Three samples per kind rather than one. One sample proves the wording exists;
 * three prove it MOVES, which is the property he is actually being asked to
 * approve.
 */
export const OutreachPreviewSchema = z.object({
  samples: z.array(z.object({ kind: OutreachKindSchema, body: z.string() })),
});

export const OUTREACH_LOG_FILTERS = ['all', ...OUTREACH_KINDS] as const;
export const OutreachLogFilterSchema = z.enum(OUTREACH_LOG_FILTERS).default('all');

export type OutreachLogRow = z.infer<typeof OutreachLogRowSchema>;
export type OutreachStats = z.infer<typeof OutreachStatsSchema>;
export type OutreachPreview = z.infer<typeof OutreachPreviewSchema>;
export type OutreachLogFilter = (typeof OUTREACH_LOG_FILTERS)[number];
export type OutreachFactsWire = z.infer<typeof OutreachFactsSchema>;
