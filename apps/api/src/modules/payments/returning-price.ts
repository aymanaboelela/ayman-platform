import type { Prisma } from '../../generated/prisma/client';
import { isFeatureEnabled } from '../../common/entitlements';

/**
 * «سعر المشتركين القدام» at checkout — see `Course.returningMonthlyPriceCents`.
 *
 * Kept beside `plan-price.ts` and called from the same two doors
 * (`resolvePurchase`, `adminManualSubscribe`), plus the read the checkout draws
 * its prices from: three readers that must agree on who is «قديم» and what
 * they pay, or the panel shows ١٥٠ and the claim asks for ٢٠٠.
 */

export type ReturningPriceCourse = {
  id: string;
  returningMonthlyPriceCents: number | null;
  returningPriceBefore: Date | null;
  terms: readonly { id: string; returningPriceCents: number | null }[];
};

/**
 * Did this student pay for this course before the price went up?
 *
 * «اشترك قبل كده» counts the two ways money for a course arrives:
 *
 *   · an APPROVED, non-free `PaymentSubmission` — a transfer, the wallet, or
 *     an admin recording a transfer by hand. Submitted (`createdAt`) before the
 *     line, so a claim sent at ١٥٠ the night before and approved the morning
 *     after still counts. An `isFree` row is an admin comp, not a payment, and
 *     the instructor's words were «اللي مدفعتش».
 *   · an unlock code for this course redeemed before the line — a centre sells
 *     those for cash, and that student paid as surely as one who transferred.
 *
 * `false` whenever the course has no line yet — no returning price was ever
 * set, so nobody is «قديم» — and whenever the stack does not have the feature.
 */
export async function isReturningSubscriber(
  client: Pick<Prisma.TransactionClient, 'paymentSubmission' | 'unlockCode'>,
  userId: string,
  course: Pick<ReturningPriceCourse, 'id' | 'returningPriceBefore'>,
): Promise<boolean> {
  const before = course.returningPriceBefore;
  if (before === null || !isFeatureEnabled('returningPrice')) return false;

  const [paid, redeemed] = await Promise.all([
    client.paymentSubmission.findFirst({
      where: { userId, courseId: course.id, status: 'approved', isFree: false, createdAt: { lt: before } },
      select: { id: true },
    }),
    client.unlockCode.findFirst({
      where: { redeemedByUserId: userId, courseId: course.id, redeemedAt: { lt: before } },
      select: { id: true },
    }),
  ]);
  return paid !== null || redeemed !== null;
}

/**
 * What a returning student pays for this plan — `null` when the plan has no
 * returning price, and the caller charges the regular one.
 *
 * Month and term only: those are the two the instructor priced twice. A year
 * has one price for everyone.
 */
export function returningPlanPriceCents(
  course: ReturningPriceCourse,
  plan: 'monthly' | 'quarterly' | 'yearly' | 'term',
  termId: string | null,
): number | null {
  switch (plan) {
    case 'monthly':
      return course.returningMonthlyPriceCents;
    case 'term':
      return course.terms.find((term) => term.id === termId)?.returningPriceCents ?? null;
    default:
      return null;
  }
}

/**
 * The price this student is charged for this plan: the returning one when
 * the plan has one AND the student is «قديم», the regular one otherwise. The
 * returning lookup is skipped entirely for a plan with no returning price, so
 * every course without one costs no extra query.
 */
export async function chargedPlanPriceCents(
  client: Pick<Prisma.TransactionClient, 'paymentSubmission' | 'unlockCode'>,
  userId: string,
  course: ReturningPriceCourse,
  plan: 'monthly' | 'quarterly' | 'yearly' | 'term',
  termId: string | null,
  regularCents: number | null,
): Promise<number | null> {
  if (regularCents === null) return null;
  const returningCents = returningPlanPriceCents(course, plan, termId);
  if (returningCents === null) return regularCents;
  return (await isReturningSubscriber(client, userId, course)) ? returningCents : regularCents;
}
