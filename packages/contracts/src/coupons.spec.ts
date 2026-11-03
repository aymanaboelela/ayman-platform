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

  it('reads a per-plan amount off the plan bought, and nothing off a plan it has no amount for', () => {
    const coupon = {
      kind: 'per_plan' as const,
      percentOff: null,
      amountOffCents: null,
      planAmounts: { monthly: 5_100, quarterly: null, term: 15_000, yearly: null },
    };
    // 150 → 99 on the month, 450 → 300 on the term, the year untouched.
    expect(couponDiscountCents(coupon, 15_000, 'monthly')).toBe(5_100);
    expect(couponDiscountCents(coupon, 45_000, 'term')).toBe(15_000);
    expect(couponDiscountCents(coupon, 95_000, 'yearly')).toBe(0);
    expect(couponDiscountCents(coupon, 15_000)).toBe(0);
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

  it('a per-plan coupon carries amounts and nothing else, and at least one plan', () => {
    const base = { code: 'WELCOME0311', allCourses: true, kind: 'per_plan' };
    const planAmounts = { monthly: 5_100, quarterly: null, term: 15_000, yearly: null };
    expect(AdminCouponCreateSchema.safeParse({ ...base, planAmounts }).success).toBe(true);
    expect(AdminCouponCreateSchema.safeParse({ ...base, planAmounts, amountOffCents: 5_000 }).success).toBe(false);
    expect(
      AdminCouponCreateSchema.safeParse({ ...base, planAmounts: { monthly: null, quarterly: null, term: null, yearly: null } })
        .success,
    ).toBe(false);
    expect(AdminCouponCreateSchema.safeParse({ ...base, planAmounts: { ...planAmounts, monthly: 5_150 } }).success).toBe(false);
    // …and a fixed coupon may not smuggle plan amounts in.
    expect(
      AdminCouponCreateSchema.safeParse({ code: 'SAVE50', allCourses: true, kind: 'fixed', amountOffCents: 5_000, planAmounts })
        .success,
    ).toBe(false);
  });

  it('an edit writes only what the admin sent — no defaults sneak in', () => {
    expect(AdminCouponUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});
