import { z } from '@ayman/contracts/zod';

/**
 * `/admin/broadcast` — a message the instructor writes himself and sends on
 * purpose, to one student or to everyone, as opposed to the four automated
 * `OutreachKind`s that fire from something a particular student did.
 *
 * Deliberately a separate route from `/admin/outreach`, whose own header
 * explains why that screen stays read-only: "a broadcast control would turn
 * a personal channel into a mailing list in one click." This is that control
 * — kept OUT of the automated system's cap and dedupe (both exist to bound a
 * sweeper, not a human's own deliberate press) and given its own screen so
 * the two are never confused for one feature.
 *
 * Delivery is still the SAME mechanism outreach uses: an ordinary `admin`
 * row in the student's own conversation, so «the student sees it in the same
 * المساعد panel... and replying works» — see `OutreachService.threadFor`.
 */

export const BroadcastTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('user'), userId: z.string() }),
]);

/** `.strict()` — Global Constraint 8: an unknown field is a 400, not a
 *  silently-dropped one. */
export const BroadcastRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    target: BroadcastTargetSchema,
  })
  .strict();

/**
 * `GET /api/admin/broadcast/recipient-count` — what the confirm dialog shows
 * BEFORE the send button is pressable, for `target: { type: 'all' }`. The one
 * thing standing between an admin and messaging every active student is
 * seeing the number first.
 */
export const RecipientCountSchema = z.object({ count: z.number().int().min(0) });

/**
 * The response to `POST /api/admin/broadcast`.
 *
 * `queued`, not `sent`, for `target: 'all'`: the request returns as soon as
 * the recipient list is resolved, and delivery continues after the response
 * — see the service for why waiting on every write would risk the request
 * itself timing out on a large cohort. A single `user` target IS sent
 * synchronously, so `queued` there always equals `1`.
 */
export const BroadcastResponseSchema = z.object({ queued: z.number().int().min(0) });

export type BroadcastTarget = z.infer<typeof BroadcastTargetSchema>;
export type BroadcastRequest = z.infer<typeof BroadcastRequestSchema>;
export type RecipientCount = z.infer<typeof RecipientCountSchema>;
export type BroadcastResponse = z.infer<typeof BroadcastResponseSchema>;
