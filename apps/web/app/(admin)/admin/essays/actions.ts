'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import { z } from '@ayman/contracts/zod';
import {
  AdminEssaySchema,
  DailyEssayBatchSchema,
  DailyEssayMarkSchema,
  DailyEssayUpdateSchema,
} from '@ayman/contracts/daily-essay';
import { AdminApiError, adminSend, adminSendVoid } from '@/lib/admin-api';

/** `refused` is the one failure the screen words differently: a question with answers on it is hidden, not deleted. */
export type EssayActionResult = { ok: true } | { ok: false; reason: 'failed' | 'refused' };

const CreatedSchema = z.object({ created: z.number().int(), firstDay: z.string(), lastDay: z.string() });

/**
 * «إضافة أسئلة» — the whole batch in one request, laid on its days by the API.
 *
 * Parsed against the contract before it leaves, even though the API validates
 * again: the API is the gate, this is the second lock on the same door.
 * `revalidatePath` drops the ROUTER cache — every read on these screens is
 * already `no-store`.
 */
export async function createEssaysAction(
  input: z.input<typeof DailyEssayBatchSchema>,
): Promise<{ ok: true; created: number } | { ok: false; reason: 'failed' }> {
  try {
    const body = DailyEssayBatchSchema.parse(input);
    const result = await adminSend('POST', '/api/admin/daily-essays', body, CreatedSchema);
    revalidatePath('/admin/essays');
    return { ok: true, created: result.created };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** One question edited, hidden or shown. Only the fields sent are changed. */
export async function updateEssayAction(
  id: string,
  input: z.input<typeof DailyEssayUpdateSchema>,
): Promise<EssayActionResult> {
  try {
    const body = DailyEssayUpdateSchema.parse(input);
    await adminSend('PATCH', `/api/admin/daily-essays/${id}`, body, AdminEssaySchema);
    revalidatePath('/admin/essays');
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export async function removeEssayAction(id: string): Promise<EssayActionResult> {
  try {
    await adminSendVoid('DELETE', `/api/admin/daily-essays/${id}`);
    revalidatePath('/admin/essays');
    return { ok: true };
  } catch (error) {
    // 409 `essay_has_answers`.
    return { ok: false, reason: error instanceof AdminApiError && error.status === 409 ? 'refused' : 'failed' };
  }
}

/**
 * The mark.
 *
 * ⚠️ `adminSendVoid`, never `adminSend`: the route answers 204, and a helper
 * that parses the body would throw AFTER the student had been marked, told,
 * and had their photographs deleted.
 */
export async function markEssayAction(
  id: string,
  input: { mark: number; note: string | null },
): Promise<EssayActionResult> {
  try {
    const body = DailyEssayMarkSchema.parse(input);
    await adminSendVoid('POST', `/api/admin/daily-essays/submissions/${id}/mark`, body);
    revalidatePath('/admin/essays');
    revalidatePath(`/admin/essays/${id}`);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
