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
  'subscription_expiring_soon',
  'subscription_cancelled',
  /**
   * ADMIN-facing. The two below are the first notifications on this platform
   * addressed to staff rather than to a student, and they are ordinary
   * `Notification` rows for a deliberate reason: the alternative — a
   * fire-and-forget socket event with no table behind it — loses every alert
   * that arrives while nobody has the tab open, which is most of them.
   *
   * They are emitted to every user holding the matching permission at the
   * moment of the event (`payment:read`, `book-order:read`). A staff member
   * hired afterwards does not retroactively receive them; the queue screens
   * are the durable record, and this is the interruption.
   */
  'payment_submitted',
  'book_order_placed',
  /**
   * ADMIN — a student sent المساعد a message that needs a reply: a new thread
   * (`AssistantService.open`) or a follow-up on one already answered
   * (`AssistantService.postMessage`). Same fan-out as the two kinds above —
   * every user holding `conversation:read`, the permission `/admin/inbox`
   * itself requires — and the same reason for an ordinary row rather than
   * only a live event: most of these arrive while nobody has the tab open.
   */
  'assistant_question_received',
  /**
   * STUDENT — the three moments after «طلبت الكتاب» that the platform used to
   * know about and never mention.
   *
   * `book_order_placed` above is the ADMIN's alert; these are the student's
   * side of the same order. Ordering a printed book was the one flow that ended
   * in silence: the confirmation screen said «هيوصلك»، and after that the only
   * way to find out anything was to phone and ask. `shipped` and `delivered`
   * close the courier's half of it, and `rejected` is the answer somebody is
   * owed when the order stops moving on purpose.
   *
   * All three carry `bookOrderId`; `book_order_rejected` also carries the
   * admin's `reason`, exactly as `payment_rejected` does.
   */
  'book_order_shipped',
  'book_order_delivered',
  'book_order_rejected',
  /**
   * «مبروك، خلصت الكورس» — back to a STUDENT kind after the four admin ones.
   *
   * The dashboard already celebrates 100% on screen (`next-up-block.tsx`,
   * `copy.dashboard.nextUp.won*`). This is not that: the moment a course is
   * finished is spent on the last lesson's player, not on the dashboard, so
   * the card only ever congratulates a student who has already come back. The
   * notification is what tells them there is something to come back TO.
   *
   * Emitted on the TRANSITION into finished and nowhere else — see
   * `CourseProgressService`. Course progress is recomputed on every lesson
   * completion and keeps answering "finished" afterwards, so a kind emitted on
   * the value rather than the edge would re-congratulate a student every time
   * they re-opened a lesson to revise.
   */
  'course_completed',
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
  /** `null` for an approved TERM purchase — it does not expire by date, only
   *  by an admin closing the term. Unused by the feed's own render today
   *  (`notification-view.ts` shows no date for this kind), kept on the
   *  payload only because `subscription_expiring_soon` shares this shape's
   *  intent and genuinely needs a date. */
  validUntil: z.iso.datetime().nullable(),
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

/**
 * A `purchase` `AccessGrant` is within a few days of `validUntil`. Same shape
 * as `PaymentApprovedNotificationSchema` — `courseId`/`courseSlug`/
 * `courseTitle` resolved at read time, `validUntil` carried on the payload —
 * because it answers the same question ("what course, and until when") from
 * the opposite direction: that one says access just opened, this one says it
 * is about to close.
 */
export const SubscriptionExpiringSoonNotificationSchema = z.object({
  ...base,
  kind: z.literal('subscription_expiring_soon'),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  validUntil: z.iso.datetime(),
});

/**
 * An admin cancelled a `purchase` `AccessGrant` early via `/admin/finance`,
 * with `AccessGrant.cancelReasonVisibleToStudent: true` — see that field's
 * own model note. Same shape as `PaymentRejectedNotificationSchema`: an
 * admin's own free-text `reason`, carried straight through. Only ever
 * emitted when the admin chose to show it; the far more common silent
 * cancellation writes no notification at all.
 */
export const SubscriptionCancelledNotificationSchema = z.object({
  ...base,
  kind: z.literal('subscription_cancelled'),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  reason: z.string(),
});

/**
 * ADMIN — a student uploaded a Vodafone Cash transfer and is waiting on a
 * decision. `studentName` and the course pair are resolved at read time, same
 * discipline as every kind above.
 */
export const PaymentSubmittedNotificationSchema = z.object({
  ...base,
  kind: z.literal('payment_submitted'),
  submissionId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  studentName: z.string(),
});

/**
 * ADMIN — a paid book order is waiting to be shipped. It carries no course:
 * the shop sells from its own catalogue and an order is not attached to one,
 * which is why this is the one admin kind whose only subject is a person and
 * a parcel.
 */
export const BookOrderPlacedNotificationSchema = z.object({
  ...base,
  kind: z.literal('book_order_placed'),
  orderId: z.uuid(),
  studentName: z.string(),
});

/**
 * ADMIN — a student's message to المساعد. `preview` is a short, ALREADY
 * TRUNCATED snapshot of what was asked (see `AssistantController`'s
 * `summaryPreview` call), taken at write time rather than resolved fresh from
 * the conversation — unlike a course or lesson TITLE, a chat message does not
 * get renamed, and a notification is exactly a record of what was asked at
 * the moment it interrupted him. `studentName` is resolved at read time, same
 * discipline as `payment_submitted`/`book_order_placed`: a guest's given name
 * or a signed-in student's account name, empty only if the account has since
 * been deleted.
 */
export const AssistantQuestionReceivedNotificationSchema = z.object({
  ...base,
  kind: z.literal('assistant_question_received'),
  conversationId: z.uuid(),
  preview: z.string(),
  studentName: z.string(),
});

/**
 * STUDENT — the courier's half of «طلبت الكتاب وبعدين إيه؟».
 *
 * One shape for all three, because the card renders the same thing in all
 * three cases: a title, and a link back to the order. `bookTitle` is resolved
 * at READ time from the order's first line, same discipline as every other
 * kind here — a book renamed after shipping should read as its current name,
 * and an order whose lines were all removed simply has an empty title rather
 * than a card that fails to parse.
 */
const bookOrderBase = {
  ...base,
  orderId: z.uuid(),
  bookTitle: z.string(),
};

export const BookOrderShippedNotificationSchema = z.object({
  ...bookOrderBase,
  kind: z.literal('book_order_shipped'),
});

export const BookOrderDeliveredNotificationSchema = z.object({
  ...bookOrderBase,
  kind: z.literal('book_order_delivered'),
});

/**
 * The one that carries text. `reason` is the admin's own words, stored on the
 * order and shown VERBATIM — the same rule `payment_rejected` follows, and for
 * the same reason: a reason paraphrased by the platform is a reason the student
 * argues with instead of acting on.
 */
export const BookOrderRejectedNotificationSchema = z.object({
  ...bookOrderBase,
  kind: z.literal('book_order_rejected'),
  reason: z.string(),
});

/**
 * «مبروك، خلصت الكورس». The same `courseId`/`courseTitle`/`courseSlug` triple
 * every course-carrying kind above uses, resolved at READ time for the same
 * reason: a course renamed after a student finished it should congratulate
 * them by its new name, and a stored slug would 404 the moment an admin
 * changed it.
 *
 * It deliberately carries no percentage and no date. The percentage is 100 by
 * construction — a row of this kind exists only because it was — and the date
 * is `createdAt`, which every entry on this feed already has.
 */
export const CourseCompletedNotificationSchema = z.object({
  ...base,
  kind: z.literal('course_completed'),
  courseId: z.uuid(),
  courseTitle: z.string(),
  courseSlug: z.string(),
});

export const NotificationSchema = z.discriminatedUnion('kind', [
  QuizGradedNotificationSchema,
  ExtraAttemptNotificationSchema,
  ConversationReplyNotificationSchema,
  InstructorMessageNotificationSchema,
  PaymentApprovedNotificationSchema,
  PaymentRejectedNotificationSchema,
  SubscriptionExpiringSoonNotificationSchema,
  SubscriptionCancelledNotificationSchema,
  PaymentSubmittedNotificationSchema,
  BookOrderPlacedNotificationSchema,
  AssistantQuestionReceivedNotificationSchema,
  BookOrderShippedNotificationSchema,
  BookOrderDeliveredNotificationSchema,
  BookOrderRejectedNotificationSchema,
  CourseCompletedNotificationSchema,
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

/* ---------------------------------------------------------------------------
   The live stream. The Web Push subscription it hands off to when no tab is
   open at all lives in its own leaf module — `@ayman/contracts/notifications/push`.
   --------------------------------------------------------------------------- */

/**
 * One frame on `GET /api/me/notifications/stream` (Server-Sent Events).
 *
 * ## Why SSE and not a WebSocket
 *
 * The traffic is one-directional — the server tells the client something
 * happened, the client never speaks back over the same channel — and SSE is
 * the protocol shaped like that. It also survives the deployment this platform
 * actually has: it is plain HTTP through the same Traefik, carries the same
 * cookies and the same permission guard as every other route, and reconnects
 * on its own with `Last-Event-ID`. A WebSocket would need its own upgrade
 * path, its own auth handshake, and its own reconnection logic, to move strictly
 * less information.
 *
 * ## Why `unread` rides along
 *
 * The badge is the only thing most frames change, and shipping the count with
 * the event means the client never has to follow up with a request to learn
 * what number to draw. A client that misses frames (a sleeping laptop) still
 * converges: the count is absolute, not a delta.
 */
export const NotificationEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('notification'),
    notification: NotificationSchema,
    unread: z.number().int().min(0),
  }),
  /**
   * A heartbeat. Proxies and phone radios drop a connection that has been
   * silent for a while, and a stream that dies silently is worse than one that
   * never opened — the client believes it is live and stops polling.
   */
  z.object({ type: z.literal('ping') }),
]);

export type NotificationEvent = z.infer<typeof NotificationEventSchema>;
