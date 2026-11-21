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

/**
 * «طلبة كورس» — the students of one course, optionally narrowed by whether
 * they hold one curriculum month: «اللي في الكورس ومشتركوش في الشهر التالت،
 * عايز أبعتلهم يشتركوا».
 *
 * `access` reads the SAME verdict the player opens lectures by
 * (`monthSliceOf`), so «مشترك في شهر ٣» includes a term or yearly subscriber
 * whose grant covers it — never "has a `course_month` row for it", which would
 * nag every term student to buy a month they already own. With no `monthId`
 * the question is the course as a whole: any live subscription to it.
 *
 * `paidBefore` narrows to students who held a paid grant to this course at
 * some point, lapsed or not. Without it «ماشتركوش» also reaches everybody who
 * enrolled and never paid anything, which is a different message.
 */
export const BroadcastAccessSchema = z.enum(['any', 'has', 'missing']);

export const BroadcastCourseTargetSchema = z.object({
  type: z.literal('course'),
  courseId: z.uuid(),
  monthId: z.uuid().optional(),
  access: BroadcastAccessSchema.default('any'),
  paidBefore: z.boolean().default(false),
});

export const BroadcastTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('all') }),
  z.object({ type: z.literal('user'), userId: z.string() }),
  BroadcastCourseTargetSchema,
]);

/**
 * `GET /api/admin/broadcast/courses` — what the «طلبة كورس» picker offers.
 * Its own read rather than the content editor's months route: that one is
 * `section:write`, and sending a message must not need the authority to
 * rearrange a course.
 */
export const BroadcastCourseOptionSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  months: z.array(z.object({ id: z.uuid(), monthIndex: z.number().int(), title: z.string() })),
});
export const BroadcastCoursesSchema = z.object({ courses: z.array(BroadcastCourseOptionSchema) });

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
 * BEFORE the send button is pressable, for `all` and `course` targets. The one
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
export type BroadcastTargetInput = z.input<typeof BroadcastTargetSchema>;
export type BroadcastCourseTarget = z.infer<typeof BroadcastCourseTargetSchema>;
export type BroadcastAccess = z.infer<typeof BroadcastAccessSchema>;
export type BroadcastCourseOption = z.infer<typeof BroadcastCourseOptionSchema>;
export type BroadcastCourses = z.infer<typeof BroadcastCoursesSchema>;
export type BroadcastRequest = z.infer<typeof BroadcastRequestSchema>;
export type RecipientCount = z.infer<typeof RecipientCountSchema>;
export type BroadcastResponse = z.infer<typeof BroadcastResponseSchema>;
