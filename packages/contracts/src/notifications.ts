import { z } from '@ayman/contracts/zod';

/**
 * In-app notifications. `GET /api/me/notifications`.
 *
 * ## No message field
 *
 * The wire shape carries `kind` and a `payload` of ids and numbers, never a
 * rendered sentence. Copy lives in `@ayman/contracts/copy` (Global Constraint
 * 4) and the client composes the text — so a wording change is an edit to the
 * copy table, not a data migration over every row ever written.
 *
 * ## Why the payload is per-kind
 *
 * A discriminated union rather than one loose object: `quiz_graded` carries a
 * score and `extra_attempt_granted` does not, and modelling that as optional
 * fields on one shape means every consumer re-derives which kind it is holding
 * from which fields happen to be set.
 *
 * No relative imports — same rule as `activity.ts` and `sessions.ts`: a leaf
 * module both apps reach through `@ayman/contracts/notifications` without
 * tripping Node's native ESM loader on the root barrel.
 */

export const NOTIFICATION_KINDS = [
  'quiz_graded',
  'extra_attempt_granted',
  'conversation_reply',
  'instructor_message',
  'payment_approved',
  'payment_rejected',
] as const;

const base = {
  id: z.string(),
  createdAt: z.iso.datetime(),
  /** `null` while unread. The UI branches on this for the badge and the dot. */
  readAt: z.iso.datetime().nullable(),
};

export const QuizGradedNotificationSchema = z.object({
  ...base,
  kind: z.literal('quiz_graded'),
  attemptId: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  scorePercent: z.number().min(0).max(100),
  /** `null` should not occur on this kind — grading is what emits it — but the
   *  column is nullable, and a feed that throws on one odd row is worse than
   *  one that renders it without a verdict. */
  passed: z.boolean().nullable(),
});

export const ExtraAttemptNotificationSchema = z.object({
  ...base,
  kind: z.literal('extra_attempt_granted'),
  lessonId: z.string(),
  lessonTitle: z.string(),
});

/**
 * المساعد — the instructor answered a conversation this student opened.
 *
 * The FIRST kind that is not about a lesson. Everything above carries
 * `lessonId`/`lessonTitle`, and the service used to require one on every
 * emit and drop any row whose lesson had been deleted; both assumptions had
 * to go rather than be worked around with a placeholder lesson id.
 */
export const ConversationReplyNotificationSchema = z.object({
  ...base,
  kind: z.literal('conversation_reply'),
  conversationId: z.uuid(),
});

/**
 * «رسايل م. أيمن» — he wrote to the student first.
 *
 * Carries the OUTREACH KIND but not the message, for the reason the header
 * gives: the feed shows a one-line lead-in composed from `copy`, and the
 * message itself is read where it was sent — in the conversation the student
 * can answer. A body duplicated onto the notification row would be a second
 * copy of a sent message, free to disagree with the first.
 */
export const InstructorMessageNotificationSchema = z.object({
  ...base,
  kind: z.literal('instructor_message'),
  conversationId: z.uuid(),
  /** One of `OUTREACH_KINDS`; the feed picks the lead-in from it. */
  outreachKind: z.string(),
});

/**
 * An admin approved a `PaymentSubmission`. Lessonless, like the pair above —
 * `courseId`/`courseTitle` name what opened, `validUntil` is when it closes
 * again.
 */
export const PaymentApprovedNotificationSchema = z.object({
  ...base,
  kind: z.literal('payment_approved'),
  courseId: z.uuid(),
  courseTitle: z.string(),
  /** Resolved at read time, same as `courseTitle` — the course route is
   *  slug-based and a stored slug would go stale exactly like a stored title
   *  would, the moment an admin renames the course. */
  courseSlug: z.string(),
  validUntil: z.iso.datetime(),
});

/**
 * An admin rejected one. `reason` is the admin's own words — same field the
 * review screen writes, carried straight through rather than re-coded into a
 * fixed vocabulary the actual explanation might not fit.
 */
export const PaymentRejectedNotificationSchema = z.object({
  ...base,
  kind: z.literal('payment_rejected'),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  reason: z.string(),
});

export const NotificationSchema = z.discriminatedUnion('kind', [
  QuizGradedNotificationSchema,
  ExtraAttemptNotificationSchema,
  ConversationReplyNotificationSchema,
  InstructorMessageNotificationSchema,
  PaymentApprovedNotificationSchema,
  PaymentRejectedNotificationSchema,
]);

export const NotificationFeedSchema = z.object({
  entries: z.array(NotificationSchema),
  /**
   * Pass back as `?cursor=`; `null` means the end.
   *
   * A ROW ID, opaque to the client — not an offset and not a timestamp. An
   * offset paginator repeats rows on a feed that grows at the head, which this
   * one does. A timestamp cursor fails differently and more quietly: several
   * notifications routinely share a millisecond (three results graded in one
   * submit), and a `createdAt <` window cannot advance past them, so a page
   * boundary landing inside such a group repeats it. The service's own spec
   * caught exactly that — five rows paging out as six.
   */
  nextCursor: z.string().nullable(),
});

/** Its own endpoint, not a field on the feed: the topbar needs this number on
 *  every page and must not pay for twenty rows to render it. */
export const UnreadCountSchema = z.object({ unread: z.number().int().min(0) });

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type StudentNotification = z.infer<typeof NotificationSchema>;
export type NotificationFeed = z.infer<typeof NotificationFeedSchema>;
export type UnreadCount = z.infer<typeof UnreadCountSchema>;
