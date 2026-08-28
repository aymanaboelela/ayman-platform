'use server';

import { revalidatePath } from 'next/cache';
import { MarkBookOrderShippedResultSchema } from '@ayman/contracts/admin/book-orders';
import { adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function markBookOrderShippedAction(id: string): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/book-orders/${id}/ship`,
      {},
      MarkBookOrderShippedResultSchema,
    );
    revalidatePath('/admin/books');
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 400')
        ? 'already-shipped'
        : error instanceof Error
          ? error.message
          : 'unknown';
    return { ok: false, message };
  }
}
