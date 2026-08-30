'use server';

import { revalidatePath } from 'next/cache';
import { AdminFinanceRowSchema } from '@ayman/contracts/admin/finance';
import { adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

function explain(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}

/**
 * «القيمة اللي اتسجلت غلط» — corrects what the latest approved submission
 * behind this grant actually collected. See `FinanceService.editAmount`:
 * this is the same `PaymentSubmission.amountCents`/`.isFree` the row's own
 * amount column reads from, not a second "corrected" number living
 * alongside it.
 */
export async function editFinanceAmountAction(
  grantId: string,
  amountCents: number,
  isFree: boolean,
): Promise<ActionResult> {
  try {
    await adminSend(
      'PATCH',
      `/api/admin/finance/${grantId}/amount`,
      { amountCents, isFree },
      AdminFinanceRowSchema,
    );
    revalidatePath('/admin/finance');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

/**
 * «أنا سوبر أدمن، أعمل اللي أنا عايزه» — direct override of a course-scope
 * grant's window. `validUntil: null` reopens it. See
 * `FinanceService.editDates` for why a term grant rejects a non-null one.
 */
export async function editFinanceDatesAction(
  grantId: string,
  validFrom: string,
  validUntil: string | null,
): Promise<ActionResult> {
  try {
    await adminSend(
      'PATCH',
      `/api/admin/finance/${grantId}/dates`,
      { validFrom, validUntil },
      AdminFinanceRowSchema,
    );
    revalidatePath('/admin/finance');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}

/**
 * Ends a subscription early, with a reason — `showToStudent` decides
 * whether the platform's own notification bell ever says it, not whether
 * the reason gets written at all. See `FinanceService.cancel`.
 */
export async function cancelFinanceSubscriptionAction(
  grantId: string,
  reason: string,
  showToStudent: boolean,
): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/finance/${grantId}/cancel`,
      { reason, showToStudent },
      AdminFinanceRowSchema,
    );
    revalidatePath('/admin/finance');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: explain(error) };
  }
}
