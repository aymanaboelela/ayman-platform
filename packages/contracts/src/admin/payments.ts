import { z } from '@ayman/contracts/zod';
import { PaymentPlanSchema, PaymentSubmissionStatusSchema } from '@ayman/contracts/payments';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';

/**
 * The review queue — one row per `PaymentSubmission`, admin's-eye view.
 *
 * `approvedBefore` is what makes «دفع قبل كده كام مرة» answerable without a
 * second round trip per row: the reviewing admin's next question after
 * «هل الصورة دي حقيقية» is almost always «هل ده أول اشتراك ولا تجديد», and a
 * count answers both.
 */
export const AdminPaymentQuerySchema = ListQuerySchema.extend({
  status: PaymentSubmissionStatusSchema.optional(),
}).omit({ dir: true, q: true });
export type AdminPaymentQuery = z.infer<typeof AdminPaymentQuerySchema>;

export const AdminPaymentRowSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  studentName: z.string(),
  studentEmail: z.string().nullable(),
  studentPhone: z.string().nullable(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  plan: PaymentPlanSchema,
  amountCents: z.number().int(),
  /** The Vodafone Cash number the transfer was sent FROM — the number an
   *  admin actually reconciles against, and often not `studentPhone`. `null`
   *  for a row `adminManualSubscribe` created directly — there is no
   *  transfer to reconcile. */
  senderPhone: z.string().nullable(),
  status: PaymentSubmissionStatusSchema,
  rejectionReason: z.string().nullable(),
  /** Submissions this same student had approved before this one. */
  approvedBefore: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  /** An admin-comped term — never real revenue. See the model note on
   *  `PaymentSubmission.isFree`. */
  isFree: z.boolean(),
  /** Whether there is a screenshot to open — the student-facing flow always
   *  has one, `adminManualSubscribe` usually does not. Lets the UI skip
   *  requesting `GET .../screenshot` for a row that has none, rather than
   *  rendering a thumbnail that 404s. */
  hasScreenshot: z.boolean(),
});
export type AdminPaymentRow = z.infer<typeof AdminPaymentRowSchema>;

/**
 * One row per COURSE-SCOPED `purchase` `AccessGrant` for one student — the
 * admin student page's manual-subscribe section. Deliberately NOT
 * `AdminGrantRowSchema`: that shape is `course-access-section.tsx`'s own,
 * for a grant with no plan, price or expiry concept at all (opening a
 * `requiresGrant` course outright). This one always has a plan and a real,
 * plan-length expiry, because it always went through the same
 * `computeApprovalValidUntil` math a genuine approval does.
 */
export const AdminSubscriptionRowSchema = z.object({
  /** The `AccessGrant` id. */
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  /**
   * From the latest APPROVED `PaymentSubmission` behind this grant.
   * `null` alongside `amountCents`/`isFree` should not occur for a
   * `source: purchase` grant — both `PaymentsService.approve` and
   * `.adminManualSubscribe` always create one alongside the grant — but the
   * join is a `findFirst`, not a guarantee, same defensive shape as
   * `AdminFinanceRowSchema`'s own `plan`/`amountCents`.
   */
  plan: PaymentPlanSchema.nullable(),
  /** What the term is worth — the course's own plan price, regardless of
   *  `isFree`. See the model note on `PaymentSubmission.amountCents`. */
  amountCents: z.number().int().nullable(),
  isFree: z.boolean().nullable(),
  validUntil: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminSubscriptionRow = z.infer<typeof AdminSubscriptionRowSchema>;

/**
 * Subscribing a student to a course from the admin side — recording a
 * payment that already happened outside the normal review flow, or comping
 * a term outright. Reaches the exact same `AccessGrant`/`Enrollment` state a
 * genuine `approve()` would, through `PaymentsService.adminManualSubscribe`.
 *
 * No `amountCents` field: the plan's price is never admin-typed, same rule
 * as the student-facing flow's own `SubmitPaymentSchema` — it is always
 * derived from the course's own `monthlyPriceCents`/`quarterlyPriceCents`.
 */
export const AdminManualSubscribeSchema = z
  .object({
    courseId: z.uuid(),
    plan: PaymentPlanSchema,
    /** `true` comps the term — same plan-length expiry, just never counted
     *  as revenue. `false` records money that already changed hands. */
    isFree: z.boolean(),
    /** OPTIONAL, unlike the student-facing flow's `screenshotKey`: proof of
     *  a transfer he already received is something he MAY attach, not
     *  something the API demands — he is often recording a WhatsApp
     *  transfer after the fact with nothing to upload. */
    screenshotKey: z.string().min(1).max(255).nullable().default(null),
  })
  .strict();
export type AdminManualSubscribe = z.infer<typeof AdminManualSubscribeSchema>;

export const AdminPaymentListSchema = listResponse(AdminPaymentRowSchema);

export const RejectPaymentSchema = z
  .object({
    /** Shown to the student as-is — see `PaymentSubmission.rejectionReason`. */
    reason: z.string().trim().min(1).max(400),
  })
  .strict();
export type RejectPaymentInput = z.infer<typeof RejectPaymentSchema>;

export const ApprovePaymentResultSchema = z.object({
  id: z.uuid(),
  status: z.literal('approved'),
  validUntil: z.iso.datetime(),
});
