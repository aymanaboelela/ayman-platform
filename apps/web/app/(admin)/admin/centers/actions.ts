'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  AdminCenterPatchSchema,
  AdminCenterWriteSchema,
  AdminSetBookingSchema,
  AdminSlotPatchSchema,
  AdminSlotWriteSchema,
  type AdminCenterPatchInput,
  type AdminCenterWriteInput,
  type AdminSlotPatchInput,
  type AdminSlotWriteInput,
} from '@ayman/contracts/admin/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { AdminApiError, adminSendVoid } from '@/lib/admin-api';

const c = copy.admin.centers;

/**
 * `hasHistory` is the one refusal the screen does something with: a centre or
 * slot with bookings or attendance behind it answers 409, and the dialog then
 * offers «إيقاف» in place of the delete it cannot do.
 */
export type ActionResult =
  | { ok: true }
  | { ok: false; message: string; hasHistory?: boolean };

function codeOf(error: AdminApiError): unknown {
  return typeof error.payload === 'object' && error.payload !== null
    ? (error.payload as { code?: unknown }).code
    : undefined;
}

/** The API's refusal in the admin's words — never the raw
 *  «PATCH /api/… failed with 400: {…}» that `AdminApiError.message` carries. */
function refusal(error: unknown): ActionResult {
  if (error instanceof AdminApiError) {
    if (error.status === 429) return { ok: false, message: copy.admin.common.rateLimited };
    const code = codeOf(error);
    if (code === 'center_has_history' || code === 'center_slot_has_history') {
      return { ok: false, message: c.confirm.hasHistory, hasHistory: true };
    }
    if (code === 'center_slot_times') return { ok: false, message: c.slotForm.badTimes };
  }
  return { ok: false, message: c.errorGeneric };
}

/**
 * Every screen under `/admin/centers` reads these rows — the list, a slot's
 * bookings and sheet, the scanner's picker, the money — so a write expires
 * the whole segment rather than guessing which of them is open.
 */
function invalidate(): void {
  revalidatePath('/admin/centers', 'layout');
}

export async function createCenterAction(input: AdminCenterWriteInput): Promise<ActionResult> {
  const parsed = AdminCenterWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.errorGeneric };
  try {
    await adminSendVoid('POST', '/api/admin/centers', parsed.data);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function updateCenterAction(
  id: string,
  input: AdminCenterPatchInput,
): Promise<ActionResult> {
  const parsed = AdminCenterPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.errorGeneric };
  try {
    await adminSendVoid('PATCH', `/api/admin/centers/${encodeURIComponent(id)}`, parsed.data);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteCenterAction(id: string): Promise<ActionResult> {
  try {
    await adminSendVoid('DELETE', `/api/admin/centers/${encodeURIComponent(id)}`);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function createSlotAction(
  centerId: string,
  input: AdminSlotWriteInput,
): Promise<ActionResult> {
  const parsed = AdminSlotWriteSchema.safeParse(input);
  if (!parsed.success) {
    // The one refine is «end after start»; the form checks it first, so this
    // is a stale form rather than a typo.
    const times = parsed.error.issues.some((issue) => issue.path[0] === 'endMinute');
    return { ok: false, message: times ? c.slotForm.badTimes : c.errorGeneric };
  }
  try {
    await adminSendVoid(
      'POST',
      `/api/admin/centers/${encodeURIComponent(centerId)}/slots`,
      parsed.data,
    );
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function updateSlotAction(
  slotId: string,
  input: AdminSlotPatchInput,
): Promise<ActionResult> {
  const parsed = AdminSlotPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: c.errorGeneric };
  try {
    await adminSendVoid(
      'PATCH',
      `/api/admin/centers/slots/${encodeURIComponent(slotId)}`,
      parsed.data,
    );
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

export async function deleteSlotAction(slotId: string): Promise<ActionResult> {
  try {
    await adminSendVoid('DELETE', `/api/admin/centers/slots/${encodeURIComponent(slotId)}`);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}

/**
 * Books, moves or removes one student by hand — past «فل», which is the
 * admin's to override. `null` removes the booking, and the API sets the
 * student to «أونلاين» in the same transaction.
 */
export async function setStudentBookingAction(
  userId: string,
  slotId: string | null,
): Promise<ActionResult> {
  const parsed = AdminSetBookingSchema.safeParse({ slotId });
  if (!parsed.success) return { ok: false, message: c.errorGeneric };
  try {
    await adminSendVoid(
      'PUT',
      `/api/admin/centers/students/${encodeURIComponent(userId)}/booking`,
      parsed.data,
    );
    revalidatePath(`/admin/students/${userId}`);
    invalidate();
    return { ok: true };
  } catch (error) {
    return refusal(error);
  }
}
