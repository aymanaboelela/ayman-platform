import { describe, expect, it } from 'vitest';
import { AdminCouponCreateSchema, AdminCouponUpdateSchema } from '@ayman/contracts/admin/coupons';
import { CouponCodeSchema } from '@ayman/contracts/coupon-code';
import { couponDiscountCents } from '@ayman/contracts/coupons';
import { SubmitPaymentSchema } from '@ayman/contracts/payments';

describe('coupon arithmetic', () => {
  it('floors a percentage to a whole pound, so the transfer stays matchable', () => {
    // 25% of 250 = 62.50 → 62 pounds off.
    expect(couponDiscountCents({ kind: 'percent', percentOff: 25, amountOffCents: null }, 25_000)).toBe(6_200);
    expect(couponDiscountCents({ kind: 'percent', percentOff: 10, amountOffCents: null }, 30_000)).toBe(3_000);
  });

  it('takes a fixed amount as it is', () => {
    expect(couponDiscountCents({ kind: 'fixed', percentOff: null, amountOffCents: 5_000 }, 25_000)).toBe(5_000);
  });
});

describe('coupon schemas', () => {
  it('compares codes without case', () => {
    expect(CouponCodeSchema.parse('  ramadan-25 ')).toBe('RAMADAN-25');
    expect(CouponCodeSchema.safeParse('رمضان').success).toBe(false);
  });

  it('a claim from an older tab, with no code at all, still parses as «no coupon»', () => {
    const parsed = SubmitPaymentSchema.parse({
      courseId: '0190a0a0-0000-7000-8000-000000000001',
      plan: 'monthly',
      senderPhone: '01012345678',
      screenshotKey: 'payment-proof/x.webp',
    });
    expect(parsed.couponCode).toBeNull();
  });

  it('a coupon is a percentage OR whole pounds, never 100% and never piastres', () => {
    const base = { code: 'SAVE10', allCourses: true };
    expect(AdminCouponCreateSchema.safeParse({ ...base, kind: 'percent', percentOff: 10 }).success).toBe(true);
    expect(AdminCouponCreateSchema.safeParse({ ...base, kind: 'percent', percentOff: 100 }).success).toBe(false);
    expect(AdminCouponCreateSchema.safeParse({ ...base, kind: 'fixed', amountOffCents: 5_050 }).success).toBe(false);
    expect(
      AdminCouponCreateSchema.safeParse({ ...base, kind: 'fixed', amountOffCents: 5_000, percentOff: 10 }).success,
    ).toBe(false);
    expect(AdminCouponCreateSchema.safeParse({ ...base, kind: 'percent', percentOff: 10, allCourses: false }).success).toBe(
      false,
    );
  });

  it('an edit writes only what the admin sent — no defaults sneak in', () => {
    expect(AdminCouponUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});
