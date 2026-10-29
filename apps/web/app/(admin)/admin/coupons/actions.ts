'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  AdminCouponRedemptionsSchema,
  AdminCouponRowSchema,
  type AdminCouponCreateInput,
  type AdminCouponRedemptions,
  type AdminCouponUpdateInput,
} from '@ayman/contracts/admin/coupons';
import { adminCouponsCopy as c } from '@ayman/contracts/copy/admin-coupons';
import { z } from '@ayman/contracts/zod';
import { AdminApiError, adminGet, adminSend } from '@/lib/admin-api';

/**
 * The writes behind «كوبونات الخصم», as Server Actions that return
 * `{ ok, message }` instead of throwing — the client cannot import
 * `AdminApiError` for an `instanceof` without pulling `next/headers` into the
 * browser bundle. Async functions only: a `'use server'` module may export
 * nothing else.
 */
export type CouponActionResult = { ok: true } | { ok: false; message: string };

const PATH = '/admin/coupons';

function failure(error: unknown): CouponActionResult {
  if (error instanceof AdminApiError) {
    const code = (error.payload as { code?: unknown } | null)?.code;
    if (code === 'coupon_code_taken') return { ok: false, message: c.errors.codeTaken };
    if (code === 'coupon_max_below_uses') return { ok: false, message: c.errors.maxBelowUses };
    if (code === 'coupon_has_redemptions') return { ok: false, message: c.errors.hasRedemptions };
    if (error.status === 400) return { ok: false, message: c.errors.invalid };
  }
  return { ok: false, message: c.errors.failed };
}

export async function createCouponAction(input: AdminCouponCreateInput): Promise<CouponActionResult> {
  try {
    await adminSend('POST', '/api/admin/coupons', input, AdminCouponRowSchema);
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateCouponAction(id: string, input: AdminCouponUpdateInput): Promise<CouponActionResult> {
  try {
    await adminSend('PATCH', `/api/admin/coupons/${encodeURIComponent(id)}`, input, AdminCouponRowSchema);
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCouponAction(id: string): Promise<CouponActionResult> {
  try {
    await adminSend('DELETE', `/api/admin/coupons/${encodeURIComponent(id)}`, undefined, z.object({ ok: z.literal(true) }));
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/** The uses of one code, for the dialog — a read, so `null` on failure. */
export async function couponRedemptionsAction(id: string): Promise<AdminCouponRedemptions | null> {
  try {
    return await adminGet(`/api/admin/coupons/${encodeURIComponent(id)}/redemptions`, AdminCouponRedemptionsSchema);
  } catch {
    return null;
  }
}
