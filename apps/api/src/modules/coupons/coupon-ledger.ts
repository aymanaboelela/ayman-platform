import { HttpException, HttpStatus } from '@nestjs/common';
import { normalizeCouponCode } from '@ayman/contracts/coupon-code';
import { couponDiscountCents, type CouponKind, type CouponRefusal } from '@ayman/contracts/coupons';
import type { Prisma } from '../../generated/prisma/client';

/**
 * The ONLY code that moves a coupon's use count — pure functions over a
 * caller's transaction, the way `wallet-ledger.ts` moves a wallet. The claim
 * and the use it spends must commit or roll back together, and the claim's
 * transaction belongs to `PaymentsService`.
 *
 * ## The statement that makes the ceiling hold
 *
 *     UPDATE coupons SET uses_count = uses_count + 1
 *      WHERE code = $code AND is_active
 *        AND (max_uses IS NULL OR uses_count < max_uses)
 *      RETURNING id
 *
 * It takes the coupon's row lock and holds it to commit. Two students racing
 * for the last use serialise on it, and the second one's WHERE is re-evaluated
 * against the first one's committed count — zero rows, refused. Everything
 * read after it (the window, the course list, this student's own count) is
 * read UNDER the lock, so the per-student ceiling is serialised the same way.
 * `coupons_uses_within_max` refuses an over-count at the database even if a
 * later caller forgets the WHERE.
 *
 * A refusal after the increment throws, and the caller's transaction rolling
 * back is what un-spends the use. Nothing here catches its own errors.
 */

/** «الكود ده مابينفعش» — the 422 the checkout turns into a sentence. */
export class CouponRefusedError extends HttpException {
  constructor(readonly reason: CouponRefusal) {
    super({ code: `coupon_${reason}`, message: reason }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** A coupon as the rules below need it — the course list narrowed to the one
 *  course being bought, so «is it on this course» is `courses.length > 0`. */
interface CouponFacts {
  id: string;
  code: string;
  kind: CouponKind;
  percentOff: number | null;
  amountOffCents: number | null;
  allCourses: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  maxUsesPerStudent: number | null;
  usesCount: number;
  isActive: boolean;
  courses: readonly { courseId: string }[];
}

/** What one purchase is charged once the code applies. */
export interface CouponPrice {
  couponId: string;
  code: string;
  originalCents: number;
  discountCents: number;
  finalCents: number;
}

export interface CouponRequest {
  code: string;
  userId: string;
  courseId: string;
  /** The price `resolvePurchase` derived — never a number from the client. */
  originalCents: number;
  now: Date;
}

type CouponReader = Pick<Prisma.TransactionClient, 'coupon' | 'couponRedemption'>;

function factsSelect(courseId: string) {
  return {
    id: true,
    code: true,
    kind: true,
    percentOff: true,
    amountOffCents: true,
    allCourses: true,
    startsAt: true,
    endsAt: true,
    maxUses: true,
    maxUsesPerStudent: true,
    usesCount: true,
    isActive: true,
    courses: { where: { courseId }, select: { courseId: true } },
  } as const;
}

/**
 * Why this coupon does not apply right now, or `null`. The order is the order
 * a student is told: switched off before not-yet, not-yet before over, over
 * before used up. `usesCount` is read as given — the claim passes the count
 * from BEFORE its own increment.
 */
export function couponRefusal(coupon: CouponFacts, now: Date): CouponRefusal | null {
  if (!coupon.isActive) return 'inactive';
  if (coupon.startsAt !== null && coupon.startsAt > now) return 'not_started';
  if (coupon.endsAt !== null && coupon.endsAt <= now) return 'expired';
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) return 'exhausted';
  if (!coupon.allCourses && coupon.courses.length === 0) return 'not_for_course';
  return null;
}

/**
 * The discounted price, or `exceeds_price` when nothing would be left to pay.
 * A discount of zero (10% of a 5-pound price floors to nothing) is refused the
 * same way: a code that changes nothing is not something to record a use of.
 */
export function priceWithCoupon(coupon: CouponFacts, originalCents: number): CouponPrice {
  const discountCents = couponDiscountCents(coupon, originalCents);
  if (discountCents <= 0 || discountCents >= originalCents) {
    throw new CouponRefusedError('exceeds_price');
  }
  return {
    couponId: coupon.id,
    code: coupon.code,
    originalCents,
    discountCents,
    finalCents: originalCents - discountCents,
  };
}

async function perStudentRefusal(
  client: CouponReader,
  coupon: CouponFacts,
  userId: string,
): Promise<CouponRefusal | null> {
  if (coupon.maxUsesPerStudent === null) return null;
  // Released uses (a rejected claim) do not count — the student never got
  // anything for them.
  const used = await client.couponRedemption.count({
    where: { couponId: coupon.id, userId, releasedAt: null },
  });
  return used >= coupon.maxUsesPerStudent ? 'per_student_limit' : null;
}

/**
 * «تطبيق» on the checkout — every rule, no lock, nothing written. What the
 * student sees before transferring; `claimCoupon` decides again at the press.
 */
export async function quoteCoupon(client: CouponReader, request: CouponRequest): Promise<CouponPrice> {
  const coupon = await client.coupon.findUnique({
    where: { code: normalizeCouponCode(request.code) },
    select: factsSelect(request.courseId),
  });
  if (!coupon) throw new CouponRefusedError('not_found');
  const refusal = couponRefusal(coupon, request.now) ?? (await perStudentRefusal(client, coupon, request.userId));
  if (refusal) throw new CouponRefusedError(refusal);
  return priceWithCoupon(coupon, request.originalCents);
}

/**
 * Spends one use, inside the claim's transaction — see the header. Returns the
 * price computed from the LOCKED row, which is the one the claim must charge.
 */
export async function claimCoupon(
  tx: Prisma.TransactionClient,
  request: CouponRequest,
): Promise<CouponPrice> {
  const code = normalizeCouponCode(request.code);
  const claimed = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "app"."coupons"
       SET "uses_count" = "uses_count" + 1
     WHERE "code" = ${code}
       AND "is_active"
       AND ("max_uses" IS NULL OR "uses_count" < "max_uses")
    RETURNING "id"
  `;

  if (claimed.length === 0) {
    // Nothing to roll back — say which of the three it was.
    const row = await tx.coupon.findUnique({ where: { code }, select: { isActive: true } });
    if (!row) throw new CouponRefusedError('not_found');
    throw new CouponRefusedError(row.isActive ? 'exhausted' : 'inactive');
  }

  const locked = await tx.coupon.findUniqueOrThrow({
    where: { code },
    select: factsSelect(request.courseId),
  });
  // The count from before this claim's own increment, so the shared rule
  // reads it the way `quoteCoupon` does. (The ceiling itself was already
  // decided by the UPDATE.)
  const before = { ...locked, usesCount: locked.usesCount - 1 };
  const refusal = couponRefusal(before, request.now) ?? (await perStudentRefusal(tx, before, request.userId));
  if (refusal) throw new CouponRefusedError(refusal);
  return priceWithCoupon(before, request.originalCents);
}

/** The redemption row, beside the claim it priced — same transaction. */
export async function recordRedemption(
  tx: Prisma.TransactionClient,
  input: { price: CouponPrice; userId: string; submissionId: string; courseId: string },
): Promise<void> {
  await tx.couponRedemption.create({
    data: {
      couponId: input.price.couponId,
      userId: input.userId,
      submissionId: input.submissionId,
      courseId: input.courseId,
      originalCents: input.price.originalCents,
      discountCents: input.price.discountCents,
    },
  });
}

/**
 * A rejected claim gives its use back. A no-op for a claim that had no coupon,
 * or whose use was already given back. Conditional on `releasedAt IS NULL`, so
 * it can only ever subtract once per redemption.
 */
export async function releaseCouponRedemption(
  tx: Prisma.TransactionClient,
  submissionId: string,
  now: Date,
): Promise<void> {
  const released = await tx.couponRedemption.updateMany({
    where: { submissionId, releasedAt: null },
    data: { releasedAt: now },
  });
  if (released.count === 0) return;
  const redemption = await tx.couponRedemption.findUniqueOrThrow({
    where: { submissionId },
    select: { couponId: true },
  });
  await tx.coupon.update({
    where: { id: redemption.couponId },
    data: { usesCount: { decrement: 1 } },
  });
}
