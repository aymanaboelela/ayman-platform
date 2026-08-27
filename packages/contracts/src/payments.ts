import { z } from '@ayman/contracts/zod';
import { egyptianPhone } from '@ayman/contracts/phone';

/**
 * A student's course subscription claim over Vodafone Cash, and its review.
 *
 * ## The two-step upload, same shape as `assistant/conversation` attachments
 *
 * `POST /payments/screenshot` returns a storage key; `POST
 * /payments/submissions` is a plain JSON body that carries that key alongside
 * `courseId`, `plan` and `senderPhone`. Combining the file and the fields into
 * one multipart request was considered and rejected for the same reason the
 * assistant's attachment endpoint already made that call: a JSON body is
 * trivial to validate with Zod and a multipart one is not, and splitting the
 * upload out means a failed submission (wrong number, a duplicate pending
 * claim) never has to re-upload the picture.
 *
 * ## `amountCents` is not a student-typed field
 *
 * It used to be — the student typed the pounds they sent, unchecked against
 * anything. The course's own `monthlyPriceCents`/`quarterlyPriceCents` for
 * the chosen plan is a stricter, already-trusted number, so `PaymentsService
 * .submit` derives it from there instead of asking twice for something the
 * platform already knows. `senderPhone` is the field actually worth asking
 * for: it is the one fact on the transfer the platform has no other way to
 * learn, and it is what an admin reconciles against the real Vodafone Cash
 * log — an amount typed by hand next to a screenshot that already shows the
 * amount was redundant a different way.
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
    /** The Vodafone Cash number the transfer was sent FROM — may differ
     *  from the student's own account phone (a parent's line, for example).
     *  Normalised to E.164, same rule as every other phone field. */
    senderPhone: egyptianPhone('اكتب رقم الموبايل اللي حوّلت منه'),
    screenshotKey: z.string().min(1).max(255),
  })
  .strict();
export type SubmitPaymentInput = z.infer<typeof SubmitPaymentSchema>;

const base = {
  id: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  plan: PaymentPlanSchema,
  /** The plan's price at the moment of submission — derived server-side
   *  from the course's own pricing, never student input. */
  amountCents: z.number().int(),
  /** `null` for a row an admin created directly (`adminManualSubscribe`) —
   *  see the model note on `PaymentSubmission.senderPhone`. Every submission
   *  the STUDENT-facing flow creates still has one. */
  senderPhone: z.string().nullable(),
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
