import { z } from '@ayman/contracts/zod';
import { PaymentPlanSchema } from '@ayman/contracts/payments';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';

/**
 * «الاشتراكات والإيرادات» — `/admin/finance`.
 *
 * One row per live-or-lapsed `purchase` `AccessGrant`: who has paid, how
 * much their MOST RECENT approved submission for it was worth, and when it
 * runs out. Deliberately grant-centric rather than one row per
 * `PaymentSubmission` — a student who renewed twice has ONE subscription to
 * this course, and `/admin/payments` is already the append-only history of
 * every individual payment against it (see the model note on
 * `PaymentSubmission` for why approval extends one grant rather than
 * stacking many). This screen answers "what does he currently hold and
 * until when", not "what did he pay, one row per payment".
 */
export const FinanceStatusSchema = z.enum(['active', 'expiring_soon', 'expired']);
export type FinanceStatus = z.infer<typeof FinanceStatusSchema>;

export const AdminFinanceQuerySchema = ListQuerySchema.extend({
  status: FinanceStatusSchema.optional(),
}).omit({ dir: true, q: true });
export type AdminFinanceQuery = z.infer<typeof AdminFinanceQuerySchema>;

export const AdminFinanceRowSchema = z.object({
  /** The `AccessGrant` id — this row's own identity. */
  id: z.uuid(),
  userId: z.string(),
  studentName: z.string(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  /** The plan and amount of the LATEST approved submission behind this
   *  grant. `null` for the handful of grants a payment never created —
   *  should not occur for a `source: purchase` row, but the join is a
   *  `findFirst`, not a guarantee. */
  plan: PaymentPlanSchema.nullable(),
  amountCents: z.number().int().nullable(),
  /** That same submission's `reviewedAt` — when an admin actually approved
   *  it, which is what "paid on" means here. */
  paidAt: z.iso.datetime().nullable(),
  /** An admin-comped term — never counted in `summary.revenueThisMonthCents`.
   *  `null` alongside `plan`/`amountCents` for the same edge case: no
   *  approved submission behind this grant to read it from. */
  isFree: z.boolean().nullable(),
  validUntil: z.iso.datetime(),
  status: FinanceStatusSchema,
});
export type AdminFinanceRow = z.infer<typeof AdminFinanceRowSchema>;

export const AdminFinanceSummarySchema = z.object({
  /** Sum of `amountCents` across submissions APPROVED this calendar month —
   *  not grants created this month, so a quarterly plan approved on the 1st
   *  counts its full price once, in the month it was actually paid. */
  revenueThisMonthCents: z.number().int().min(0),
  activeCount: z.number().int().min(0),
  expiringSoonCount: z.number().int().min(0),
});
export type AdminFinanceSummary = z.infer<typeof AdminFinanceSummarySchema>;

export const AdminFinanceListSchema = listResponse(AdminFinanceRowSchema).extend({
  summary: AdminFinanceSummarySchema,
});
export type AdminFinanceList = z.infer<typeof AdminFinanceListSchema>;
