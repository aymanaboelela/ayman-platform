'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ApprovePaymentResultSchema } from '@ayman/contracts/admin/payments';
import { adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function approvePaymentAction(id: string): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/payments/submissions/${id}/approve`,
      {},
      ApprovePaymentResultSchema,
    );
    revalidatePath('/admin/payments');
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? 'already-reviewed'
        : error instanceof Error
          ? error.message
          : 'unknown';
    return { ok: false, message };
  }
}

export async function rejectPaymentAction(id: string, reason: string): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/payments/submissions/${id}/reject`,
      { reason },
      z.object({ ok: z.literal(true) }),
    );
    revalidatePath('/admin/payments');
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 409')
        ? 'already-reviewed'
        : error instanceof Error
          ? error.message
          : 'unknown';
    return { ok: false, message };
  }
}
