import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { isFeatureEnabled } from '../../common/entitlements';

/**
 * «سعر المشتركين القدام» — the two rules every write of a returning price
 * shares, for the course's month (`CourseService.update`) and for a term
 * (`TermService`). See `Course.returningMonthlyPriceCents` in schema.prisma.
 */

/**
 * The price is only writable on a stack that has the feature. Clearing it
 * (`null`) always is: a stack that loses the feature must still be able to
 * take an old price off its own courses.
 */
export function assertReturningPriceWritable(returningCents: number | null | undefined): void {
  if (returningCents != null && !isFeatureEnabled('returningPrice')) {
    throw new ForbiddenException('feature unavailable on this platform');
  }
}

/**
 * Below the regular price, and never without one — the same rule as the
 * CHECKs, said in Arabic next to the field instead of as a 500 from Postgres.
 * Both values are the RESOLVED ones (patch over current row): a patch that
 * lowers only the regular price can break the pair as surely as one that
 * raises the returning price.
 */
export function assertReturningBelowRegular(
  regularCents: number | null | undefined,
  returningCents: number | null | undefined,
): void {
  if (returningCents == null) return;
  if (regularCents == null || returningCents >= regularCents) {
    throw new BadRequestException('سعر المشتركين القدام لازم يبقى أقل من السعر العادي');
  }
}

/**
 * The line between «قديم» and «جديد», drawn ONCE — the first time any
 * returning price on the course is set — and never moved by a later edit. See
 * `Course.returningPriceBefore` for why moving it would undo the price rise.
 * `updateMany` with `returningPriceBefore: null` so the stamp is a no-op on a
 * course that already has one, with no read-then-write race.
 */
export async function stampReturningPriceBefore(
  client: Pick<Prisma.TransactionClient, 'course'>,
  courseId: string,
): Promise<void> {
  await client.course.updateMany({
    where: { id: courseId, returningPriceBefore: null },
    data: { returningPriceBefore: new Date() },
  });
}
