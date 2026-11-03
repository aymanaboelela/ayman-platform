'use server';

import { WaContactsStatusSchema, type WaContactsStatus } from '@ayman/contracts/marketing/wa-contacts';
import { waContactsCopy } from '@ayman/contracts/copy/wa-contacts';
import { AdminApiError, adminGetOrNull, adminSend } from '@/lib/admin-api';

/**
 * «احفظهم في واتساب» — the panel's three calls, as Server Actions returning a
 * plain result (never a thrown `AdminApiError`: that class lives beside
 * `next/headers` and must not reach the browser bundle — see
 * `marketing/actions.ts`).
 *
 * No `revalidatePath`: the panel polls its own status, and nothing else on
 * the students page reads it.
 */

export type WaContactsResult = { ok: true; data: WaContactsStatus } | { ok: false; message: string };

const BASE = '/api/admin/marketing/wa-contacts';

async function attempt(work: () => Promise<WaContactsStatus>): Promise<WaContactsResult> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    // 409 is the one refusal with a fix the operator can act on: the API
    // will not start a run while the number is not connected.
    const offline = error instanceof AdminApiError && error.status === 409;
    return { ok: false, message: offline ? waContactsCopy.deviceOffline : waContactsCopy.actionFailed };
  }
}

/** `null` for anything that is not a status — the panel says «مقدرناش نجيب الحالة». */
export async function waContactsStatusAction(): Promise<WaContactsStatus | null> {
  try {
    return await adminGetOrNull(BASE, WaContactsStatusSchema);
  } catch {
    return null;
  }
}

/** `limit: null` is the whole list; a number is a trial that stops after that many. */
export async function startWaContactsAction(limit: number | null): Promise<WaContactsResult> {
  return attempt(() => adminSend('POST', `${BASE}/start`, { limit }, WaContactsStatusSchema));
}

export async function pauseWaContactsAction(): Promise<WaContactsResult> {
  return attempt(() => adminSend('POST', `${BASE}/pause`, undefined, WaContactsStatusSchema));
}
