import { z } from '@ayman/contracts/zod';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';
import { PaymentSubmissionStatusSchema } from '@ayman/contracts/payments';
import {
  WalletTopupMethodSchema,
  WalletTransactionSchema,
  WALLET_MAX_TOPUP_CENTS,
} from '@ayman/contracts/wallet';

/**
 * «المحفظة» — the admin's half: find a student, see their balance and
 * statement, put money in (or take a wrong credit back out), and decide the
 * InstaPay / Vodafone Cash top-up requests that arrive live on «طلبات الشحن».
 *
 * Every write here is one row of the append-only ledger. Nothing edits a
 * balance: a correction is a NEW row in the opposite direction.
 */

/** 100,000 EGP — the database CHECK on a single ledger row. */
export const WALLET_MAX_ADMIN_CENTS = 10_000_000;

/** A ledger row as the admin sees it — the student's line plus who and why. */
export const AdminWalletTransactionSchema = WalletTransactionSchema.extend({
  /** Whether this row is reported as income on `/admin/finance`. */
  countsAsIncome: z.boolean(),
  note: z.string().nullable(),
  actor: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type AdminWalletTransaction = z.infer<typeof AdminWalletTransactionSchema>;

export const AdminWalletStudentSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});
export type AdminWalletStudent = z.infer<typeof AdminWalletStudentSchema>;

/** `GET /api/admin/wallets/:userId` — one student's wallet, whole. */
export const AdminWalletSchema = z.object({
  student: AdminWalletStudentSchema,
  balanceCents: z.number().int().min(0),
  pendingTopupCents: z.number().int().min(0),
  /** Money that came in and was reported as income, net — «دفع كام لحد
   *  دلوقتي في المحفظة». */
  incomeCents: z.number().int(),
  transactions: z.array(AdminWalletTransactionSchema),
});
export type AdminWallet = z.infer<typeof AdminWalletSchema>;

/**
 * «اشحن» on a student's wallet.
 *
 * `paid` is the one question that decides the money screens: «مدفوع» — the
 * admin received this money (cash, a WhatsApp transfer) and it is income
 * today; «هدية / تعويض» — nobody paid, and it must never show up as income.
 * No default: the admin picks one every time.
 */
export const AdminWalletCreditSchema = z
  .object({
    amountCents: z.number().int().min(100, 'أقل مبلغ جنيه واحد').max(WALLET_MAX_ADMIN_CENTS),
    paid: z.boolean(),
    note: z.string().trim().max(300).nullable().default(null),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type AdminWalletCreditInput = z.infer<typeof AdminWalletCreditSchema>;

/**
 * «خصم» — taking money back out. Never below zero (the ledger refuses it).
 *
 * `reducesIncome`: the money being taken back had been counted as income
 * (a paid credit typed wrong, or cash handed back to the student), so the
 * correction comes off income on TODAY — the same «its own day» rule a refund
 * follows. A gift taken back reduces nothing.
 */
export const AdminWalletDebitSchema = z
  .object({
    amountCents: z.number().int().min(100, 'أقل مبلغ جنيه واحد').max(WALLET_MAX_ADMIN_CENTS),
    reducesIncome: z.boolean(),
    note: z.string().trim().min(3, 'لازم سبب للخصم').max(300),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type AdminWalletDebitInput = z.infer<typeof AdminWalletDebitSchema>;

/** `GET /api/admin/wallets?q=` — the «شحن المحفظة» search box. */
export const AdminWalletSearchQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
});
export type AdminWalletSearchQuery = z.infer<typeof AdminWalletSearchQuerySchema>;

export const AdminWalletSearchRowSchema = AdminWalletStudentSchema.extend({
  balanceCents: z.number().int().min(0),
  /** When the wallet last moved — `null` for a student who never had one. */
  lastMovedAt: z.iso.datetime().nullable(),
});
export type AdminWalletSearchRow = z.infer<typeof AdminWalletSearchRowSchema>;

export const AdminWalletSearchSchema = z.object({
  /** With an empty `q`, the wallets that moved most recently. */
  rows: z.array(AdminWalletSearchRowSchema),
  totals: z.object({
    /** Everything students hold right now — money already counted as income
     *  that has not been spent yet. */
    balanceCents: z.number().int().min(0),
    walletCount: z.number().int().min(0),
    pendingCount: z.number().int().min(0),
    pendingCents: z.number().int().min(0),
  }),
});
export type AdminWalletSearch = z.infer<typeof AdminWalletSearchSchema>;

/* ── «طلبات الشحن» ─────────────────────────────────────────────────────── */

export const AdminWalletTopupSortSchema = z.enum(['oldest', 'newest']);

export const AdminWalletTopupQuerySchema = ListQuerySchema.extend({
  status: PaymentSubmissionStatusSchema.optional(),
  sort: AdminWalletTopupSortSchema.default('oldest'),
}).omit({ dir: true });
export type AdminWalletTopupQuery = z.infer<typeof AdminWalletTopupQuerySchema>;

export const AdminWalletTopupRowSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  studentName: z.string(),
  studentPhone: z.string().nullable(),
  method: WalletTopupMethodSchema,
  amountCents: z.number().int(),
  approvedAmountCents: z.number().int().nullable(),
  sender: z.string(),
  note: z.string().nullable(),
  status: PaymentSubmissionStatusSchema,
  rejectionReason: z.string().nullable(),
  /** The student's balance right now — what approving would add to. */
  balanceCents: z.number().int().min(0),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewedBy: z.string().nullable(),
});
export type AdminWalletTopupRow = z.infer<typeof AdminWalletTopupRowSchema>;

export const AdminWalletTopupListSchema = listResponse(AdminWalletTopupRowSchema);
export type AdminWalletTopupList = z.infer<typeof AdminWalletTopupListSchema>;

/**
 * «اقبل» — optionally with the amount that ACTUALLY arrived. Left out, the
 * request's own amount is credited; set, it wins (the screenshot says 250,
 * the student typed 300).
 */
export const AdminApproveWalletTopupSchema = z
  .object({
    amountCents: z.number().int().min(100).max(WALLET_MAX_TOPUP_CENTS).nullable().default(null),
  })
  .strict();
export type AdminApproveWalletTopupInput = z.infer<typeof AdminApproveWalletTopupSchema>;

export const AdminRejectWalletTopupSchema = z
  .object({
    /** Shown to the student as-is. */
    reason: z.string().trim().min(1).max(400),
  })
  .strict();
export type AdminRejectWalletTopupInput = z.infer<typeof AdminRejectWalletTopupSchema>;
