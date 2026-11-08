'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  AdminReservationSchema,
  CenterManagerSchema,
  ReservationSettingsSchema,
  ReservationSetupSchema,
  type ReservationCenterPatch,
  type ReservationSettings,
  type ReviewAction,
} from '@ayman/contracts/center-reservations';
import { copy } from '@ayman/contracts/copy/admin';
import { z } from 'zod';
import { AdminApiError, adminSend } from '@/lib/admin-api';

export type ActionResult = { ok: true } | { ok: false; message: string };

const GENERIC = 'العملية ماتمّتش. نجرّب تاني؟';

/** The API's refusal in words — its own Arabic message when it sent one. */
function refusal(error: unknown): ActionResult {
  if (error instanceof AdminApiError) {
    if (error.status === 429) return { ok: false, message: copy.admin.common.rateLimited };
    const payload = error.payload as { message?: unknown } | undefined;
    const message = payload?.message;
    if (typeof message === 'string' && /[؀-ۿ]/.test(message)) return { ok: false, message };
    if (Array.isArray(message) && typeof message[0] === 'string') return { ok: false, message: message[0] };
  }
  return { ok: false, message: GENERIC };
}

function invalidate(): void {
  revalidatePath('/admin/centers/reservations', 'layout');
}

export async function reviewReservationAction(id: string, action: ReviewAction, reason?: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/center-reservations/${id}/review`, { action, reason }, AdminReservationSchema);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteReservationAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('DELETE', `/api/admin/center-reservations/${id}`, undefined, z.object({ ok: z.literal(true) }));
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function saveReservationSettingsAction(input: ReservationSettings): Promise<ActionResult> {
  try {
    await adminSend('PUT', '/api/admin/center-reservations/settings', input, ReservationSettingsSchema);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function patchReservationCenterAction(centerId: string, input: ReservationCenterPatch): Promise<ActionResult> {
  try {
    await adminSend('PATCH', `/api/admin/center-reservations/centers/${centerId}`, input, ReservationSetupSchema);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

const Managers = z.array(CenterManagerSchema);

export async function createManagerAction(input: {
  centerId: string;
  name: string;
  phone: string;
  password: string;
}): Promise<ActionResult> {
  try {
    await adminSend('POST', '/api/admin/center-reservations/managers', input, Managers);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function setManagerPasswordAction(userId: string, password: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/center-reservations/managers/${encodeURIComponent(userId)}/password`, { password }, Managers);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function setManagerDisabledAction(userId: string, disabled: boolean): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/center-reservations/managers/${encodeURIComponent(userId)}/${disabled ? 'disable' : 'enable'}`,
      undefined,
      Managers,
    );
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}
