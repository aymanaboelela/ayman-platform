import { z } from '@ayman/contracts/zod';

/**
 * «التحليلات ← مصادر التسجيل» — for each ad link: how many accounts it
 * brought, how many of them paid, and how much.
 *
 * ## One row is one (source, medium, campaign)
 *
 * The three `utm_*` values an ad link is built with. A click that carried
 * only Facebook's own `fbclid` has none of them, so the API reports it under
 * the source `facebook` rather than in a blank row nobody can read — and with
 * NO medium, because Facebook adds `fbclid` to a link in an ordinary post
 * exactly as it does to an ad: it says where, never whether it was paid for.
 *
 * ## The window is about the ACCOUNT, the money is about the student
 *
 * `from`/`to` choose accounts by the Cairo day they were created. `paid` and
 * `revenueCents` are then everything those accounts have paid since, with no
 * date bound: «الحملة دي جابت كام» is a question about the students it
 * brought, and a student who subscribes three weeks after signing up is still
 * that campaign's student.
 *
 * ## «دفع» and «الإيراد» are the finance screens' own definitions
 *
 *   · `paid` — holds at least one approved subscription that was not comped,
 *     whichever way it was paid for; `FinanceService`'s «paid» count.
 *   · `revenueCents` — `SUBSCRIPTION_CASH_WHERE` plus `WALLET_INCOME_WHERE`:
 *     the money that actually arrived, with a wallet-funded subscription
 *     counted once, on the top-up. Before refunds, like every «إيراد» tile.
 *
 * Books are left out: an order needs no account, so most of them could never
 * be traced to a sign-up, and their total carries the courier's fee.
 */

/** `YYYY-MM-DD`, both optional and independent — `from` alone is «من يوم كذا لحد دلوقتي». */
export const AcquisitionReportQuerySchema = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict();
export type AcquisitionReportQuery = z.infer<typeof AcquisitionReportQuerySchema>;

/** More campaigns than this in one window is not a report anybody reads; the rest are counted, not listed. */
export const ACQUISITION_REPORT_MAX_ROWS = 200;

export const AcquisitionReportRowSchema = z.object({
  /** `null` where the link did not say — never an empty string. */
  source: z.string().nullable(),
  medium: z.string().nullable(),
  campaign: z.string().nullable(),
  signups: z.number().int().min(0),
  paid: z.number().int().min(0),
  /** Piastres. Can dip below zero only if a paid wallet credit was later taken back. */
  revenueCents: z.number().int(),
});
export type AcquisitionReportRow = z.infer<typeof AcquisitionReportRowSchema>;

export const AcquisitionReportSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** Most sign-ups first. At most `ACQUISITION_REPORT_MAX_ROWS`. */
  rows: z.array(AcquisitionReportRowSchema),
  /** Over EVERY campaign in the window, listed or not — so the totals never depend on the cap. */
  totals: z.object({
    campaigns: z.number().int().min(0),
    signups: z.number().int().min(0),
    paid: z.number().int().min(0),
    revenueCents: z.number().int(),
  }),
});
export type AcquisitionReport = z.infer<typeof AcquisitionReportSchema>;
