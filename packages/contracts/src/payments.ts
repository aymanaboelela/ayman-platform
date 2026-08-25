import { z } from '@ayman/contracts/zod';

/**
 * A student's course subscription claim over Vodafone Cash, and its review.
 *
 * ## The two-step upload, same shape as `assistant/conversation` attachments
 *
 * `POST /payments/screenshot` returns a storage key; `POST
 * /payments/submissions` is a plain JSON body that carries that key alongside
 * `courseId`, `plan` and `amountCents`. Combining the file and the fields into
 * one multipart request was considered and rejected for the same reason the
 * assistant's attachment endpoint already made that call: a JSON body is
 * trivial to validate with Zod and a multipart one is not, and splitting the
 * upload out means a failed submission (wrong amount, a duplicate pending
 * claim) never has to re-upload the picture.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

export const PaymentPlanSchema = z.enum(['monthly', 'quarterly']);
export type PaymentPlan = z.infer<typeof PaymentPlanSchema>;

export const PaymentSubmissionStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type PaymentSubmissionStatus = z.infer<typeof PaymentSubmissionStatusSchema>;

/**
 * `screenshotKey` is a bare storage key, not a URL — same convention as
 * `coverKey` everywhere else. It came from `POST /payments/screenshot`
 * moments earlier and is trusted no further than that: `PaymentsService`
 * re-checks it names a real object before accepting the submission.
 */
export const SubmitPaymentSchema = z
  .object({
    courseId: z.uuid(),
    plan: PaymentPlanSchema,
    /** What the student says they sent, EGP cents. Never trusted alone. */
    amountCents: z.number().int().positive(),
    screenshotKey: z.string().min(1).max(255),
  })
  .strict();
export type SubmitPaymentInput = z.infer<typeof SubmitPaymentSchema>;

const base = {
  id: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  plan: PaymentPlanSchema,
  amountCents: z.number().int(),
  status: PaymentSubmissionStatusSchema,
  /** `null` unless `status = rejected`. Admin-authored, shown as-is. */
  rejectionReason: z.string().nullable(),
  /** `null` while `pending`, and the course's new expiry once `approved`. */
  validUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
};

/** A student's own submission — never another student's. */
export const PaymentSubmissionSchema = z.object(base);
export type PaymentSubmission = z.infer<typeof PaymentSubmissionSchema>;

export const PaymentSubmissionListSchema = z.object({
  submissions: z.array(PaymentSubmissionSchema),
});
export type PaymentSubmissionList = z.infer<typeof PaymentSubmissionListSchema>;

export const SubmitPaymentScreenshotResultSchema = z.object({
  screenshotKey: z.string(),
});
