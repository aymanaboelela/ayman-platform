import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isFeatureEnabled } from '../../common/entitlements';

/**
 * «عرض» — the two rules every write of a sale price shares, for the course
 * (`CourseService.update`) and for a term (`TermService`). See
 * `Course.saleMonthlyPriceCents` in schema.prisma.
 */

/**
 * Only writable on a stack that has the feature. Clearing (`null`) always is:
 * a stack that loses the feature must still be able to take an offer off.
 */
export function assertSaleWritable(value: unknown): void {
  if (value != null && !isFeatureEnabled('courseSale')) {
    throw new ForbiddenException('feature unavailable on this platform');
  }
}

/**
 * Below the regular price, and never without one — the CHECKs, said in Arabic
 * next to the field instead of as a 500 from Postgres. Both values RESOLVED
 * (patch over current row): lowering only the regular price can break the pair
 * as surely as raising the sale price.
 */
export function assertSaleBelowRegular(
  regularCents: number | null | undefined,
  saleCents: number | null | undefined,
): void {
  if (saleCents == null) return;
  if (regularCents == null || saleCents >= regularCents) {
    throw new BadRequestException('سعر العرض لازم يبقى أقل من السعر الأصلي');
  }
}
