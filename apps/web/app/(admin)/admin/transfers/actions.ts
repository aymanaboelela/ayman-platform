'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { IngestTransfersResultSchema, type IngestTransfersResult } from '@ayman/contracts/admin/transfers';
import { adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

/** «اقفلها» — a transfer the admin has accounted for outside the platform. */
export async function dismissTransferAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/transfers/${id}/dismiss`, {}, z.object({ ok: z.literal(true) }));
    revalidatePath('/admin/transfers');
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * The paste box — the same ingest the iOS Shortcut posts to, for when the
 * Shortcut is not set up yet or is not to hand.
 *
 * Also revalidates `/admin/payments`: an ingest can approve a pending claim
 * outright, and leaving the review queue showing it as pending would be the
 * platform contradicting itself on two adjacent screens.
 */
export async function ingestTransfersAction(
  text: string,
): Promise<{ ok: true; result: IngestTransfersResult } | { ok: false; message: string }> {
  try {
    const result = await adminSend(
      'POST',
      '/api/admin/transfers/ingest',
      { text },
      IngestTransfersResultSchema,
    );
    revalidatePath('/admin/transfers');
    revalidatePath('/admin/payments');
    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
