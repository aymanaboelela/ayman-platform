import { z } from '@ayman/contracts/zod';
import {
  PaymentPlanSchema,
  PaymentSubmissionSchema,
  PaymentSubmissionStatusSchema,
} from '@ayman/contracts/payments';

/**
 * «المحفظة» — the student's half.
 *
 * A balance in piastres that anybody can fill (the student by transfer, an
 * admin by hand, a wallet code) and the student spends on a subscription with
 * one press instead of a transfer and a screenshot.
 *
 * The balance is never a number the client sends or edits: it is the SUM of a
 * server-side ledger (`wallet_transactions`), and every movement here is one
 * row of it. The admin's half lives in `./admin/wallet` and must never be
 * imported from a student module.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/** 50,000 EGP — one request larger than this is a typo, not a top-up. */
export const WALLET_MAX_TOPUP_CENTS = 5_000_000;
/** 10 EGP — below this a screenshot costs the admin more than it is worth. */
export const WALLET_MIN_TOPUP_CENTS = 1_000;

export const WalletTopupMethodSchema = z.enum(['instapay', 'vodafone_cash']);
export type WalletTopupMethod = z.infer<typeof WalletTopupMethodSchema>;

/**
 * What moved the money — the ledger's own vocabulary. The first four only
 * ever add, the last two only ever take (a database CHECK, not a convention).
 */
export const WalletTransactionKindSchema = z.enum([
  'admin_credit',
  'code_topup',
  'transfer_topup',
  'refund',
  'course_purchase',
  'admin_debit',
]);
export type WalletTransactionKind = z.infer<typeof WalletTransactionKindSchema>;

/** One line of the student's statement. `amountCents` is SIGNED. */
export const WalletTransactionSchema = z.object({
  id: z.uuid(),
  kind: WalletTransactionKindSchema,
  amountCents: z.number().int(),
  balanceAfterCents: z.number().int().min(0),
  /** The course a purchase (or its refund) was for — `null` on every other
   *  kind, and on a purchase whose course has since been deleted. */
  courseTitle: z.string().nullable(),
  /** The wallet code that was redeemed — `code_topup` only. */
  code: z.string().nullable(),
  /** How a `transfer_topup` arrived. */
  method: WalletTopupMethodSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;

/** A top-up request the student sent, in whatever state it is in. */
export const WalletTopupSchema = z.object({
  id: z.uuid(),
  method: WalletTopupMethodSchema,
  /** What the student said they sent. */
  amountCents: z.number().int().min(1),
  /** What was actually credited — `null` until approved. */
  approvedAmountCents: z.number().int().nullable(),
  sender: z.string(),
  status: PaymentSubmissionStatusSchema,
  /** The admin's own words, shown as-is. `null` unless rejected. */
  rejectionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type WalletTopup = z.infer<typeof WalletTopupSchema>;

/** `GET /api/wallet` — the whole wallet screen in one read. */
export const MyWalletSchema = z.object({
  balanceCents: z.number().int().min(0),
  /** Requests still with the admin — shown as «في الطريق», never as balance. */
  pendingTopupCents: z.number().int().min(0),
  /** Newest first, capped — the statement, not an export. */
  transactions: z.array(WalletTransactionSchema),
  /** Newest first, capped. */
  topups: z.array(WalletTopupSchema),
});
export type MyWallet = z.infer<typeof MyWalletSchema>;

/** `GET /api/wallet/balance` — what the checkout needs and nothing more. */
export const WalletBalanceSchema = z.object({
  balanceCents: z.number().int().min(0),
  pendingTopupCents: z.number().int().min(0),
});
export type WalletBalance = z.infer<typeof WalletBalanceSchema>;

/**
 * «اشحن المحفظة» by InstaPay or Vodafone Cash — the second step of the same
 * two-step upload a course payment uses: `POST /payments/screenshot` first,
 * then this JSON body carrying the key.
 *
 * `amountCents` IS student input here, unlike a course claim: there is no
 * price to derive it from. The admin sees it beside the screenshot and credits
 * what actually arrived, which may differ.
 */
export const SubmitWalletTopupSchema = z
  .object({
    method: WalletTopupMethodSchema,
    amountCents: z
      .number()
      .int()
      .min(WALLET_MIN_TOPUP_CENTS, 'أقل مبلغ للشحن ١٠ جنيه')
      .max(WALLET_MAX_TOPUP_CENTS, 'المبلغ ده كبير أوي على شحنة واحدة'),
    /** The number (Vodafone Cash) or InstaPay address the money came FROM. */
    sender: z.string().trim().min(3, 'اكتب الرقم أو عنوان إنستاباي اللي اتحوّل منه').max(120),
    note: z.string().trim().max(300).nullable().default(null),
    screenshotKey: z.string().min(1).max(255),
  })
  .strict();
export type SubmitWalletTopupInput = z.infer<typeof SubmitWalletTopupSchema>;

/**
 * «ادفع من المحفظة» — the same purchase a transfer claim makes, minus the
 * transfer: the plan (and term / months) exactly as `SubmitPaymentSchema`
 * carries them, and no sender and no screenshot.
 *
 * `idempotencyKey` is minted ONCE per checkout by the browser. A double press,
 * a retried request or a second tab all send the same key, and the ledger's
 * UNIQUE on it turns every one after the first into «already done» — the same
 * subscription, charged once.
 */
export const WalletPurchaseSchema = z
  .object({
    courseId: z.uuid(),
    plan: PaymentPlanSchema,
    termId: z.uuid().nullable().default(null),
    monthIds: z.uuid().array().max(12).default([]),
    idempotencyKey: z.uuid(),
  })
  .strict()
  .refine((value) => (value.plan === 'term') === (value.termId !== null), {
    message: 'لازم تختار الترم اللي هتشترك فيه',
    path: ['termId'],
  })
  .refine((value) => value.plan === 'monthly' || value.monthIds.length === 0, {
    message: 'الشهور بتتحدد مع الاشتراك الشهري بس',
    path: ['monthIds'],
  })
  .refine((value) => new Set(value.monthIds).size === value.monthIds.length, {
    message: 'فيه شهر مكرر',
    path: ['monthIds'],
  });
export type WalletPurchaseInput = z.infer<typeof WalletPurchaseSchema>;

export const WalletPurchaseResultSchema = z.object({
  submission: PaymentSubmissionSchema,
  balanceCents: z.number().int().min(0),
});
export type WalletPurchaseResult = z.infer<typeof WalletPurchaseResultSchema>;

/**
 * Why a wallet purchase was refused — the 4xx body's `code`, each one its own
 * sentence on the checkout.
 *
 * - `insufficient` — the balance does not cover the price (`details` carries
 *   the live `balanceCents` and `priceCents`, so the screen can say how much
 *   is missing without a second read).
 * - `already_owned` — a term the student already holds.
 */
export const WalletPurchaseErrorSchema = z.enum(['insufficient', 'already_owned']);
export type WalletPurchaseError = z.infer<typeof WalletPurchaseErrorSchema>;
