import type { Prisma } from '../../generated/prisma/client';

/**
 * «الاشتراكات اللي دخّلت فلوس» — ONE definition, for every surface that adds
 * up subscription money. The sibling of `BOOK_REVENUE_WHERE`, for the same
 * reason that one exists: a total written twice is a total with two values.
 *
 * Three conditions, each load-bearing:
 *
 *   * `status = approved` — a claim nobody accepted is not money.
 *   * `is_free = false` — an admin-comped subscription collected nothing (see
 *     `countsAsRevenue`).
 *   * `wallet_transaction_id IS NULL` — a subscription paid FROM the wallet is
 *     not new money. The money for it was counted once, as income, the day it
 *     came INTO the wallet (`WalletTransaction.countsAsIncome`). Counting the
 *     purchase as well would report every wallet-funded subscription twice —
 *     on the day of the top-up and again on the day it was spent.
 *
 * A wallet-paid submission is still an approved, paid subscription for every
 * question that is not «how much money came in»: it opens the course, it
 * numbers as new or renewal, it shows on the student's history and on the
 * subscriptions list. Only the SUM leaves it out.
 */
export const SUBSCRIPTION_CASH_WHERE = {
  status: 'approved',
  isFree: false,
  walletTransactionId: null,
} as const satisfies Prisma.PaymentSubmissionWhereInput;

/**
 * The same predicate for raw SQL, over a `payment_submissions` alias. A
 * function of the alias rather than a string with `s.` baked in, because the
 * two raw readers alias the table differently (`s` and `p`).
 *
 * Safe to `Prisma.raw` only because `alias` is always a literal at the call
 * site, never anything off a request.
 */
export function subscriptionCashSql(alias: string): string {
  return `${alias}."status" = 'approved' AND ${alias}."is_free" = false AND ${alias}."wallet_transaction_id" IS NULL`;
}

/**
 * «شحن المحفظة» that counts as income — the wallet's half of the money.
 *
 * `counts_as_income` is decided once, when the row is written: an approved
 * transfer always, an admin credit or a code when it was «مدفوع», never a gift,
 * never a purchase and never a refund back to the wallet (the last two are
 * forbidden by CHECK). An `admin_debit` carrying it is a negative amount — a
 * paid credit taken back or cash returned — and comes off income on its own
 * day, which is why this is a plain SUM over signed amounts.
 */
export const WALLET_INCOME_WHERE = {
  countsAsIncome: true,
} as const satisfies Prisma.WalletTransactionWhereInput;
