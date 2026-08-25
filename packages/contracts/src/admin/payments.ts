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
   *  admin actually reconciles against, and often not `studentPhone`. */
  senderPhone: z.string(),
  status: PaymentSubmissionStatusSchema,
  rejectionReason: z.string().nullable(),
  /** Submissions this same student had approved before this one. */
  approvedBefore: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type AdminPaymentRow = z.infer<typeof AdminPaymentRowSchema>;

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
