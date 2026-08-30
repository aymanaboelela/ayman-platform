'use server';

import { revalidatePath } from 'next/cache';
import {
  AdminCreateBookOrderResultSchema,
  AdminCreateBookOrderSchema,
  MarkBookOrderShippedResultSchema,
} from '@ayman/contracts/admin/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import { adminSend } from '@/lib/admin-api';

const c = copy.admin.books;

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * «أضف طلب كتاب» — an admin recording a customer's order directly.
 * `screenshotKey` arrives already uploaded (see `CreateBookOrderDialog`'s own
 * client-side upload step, same two-step shape `SubscriptionSection`'s
 * `adminSubscribeAction` uses) — this action never sees the file itself.
 */
export async function adminCreateBookOrderAction(formData: FormData): Promise<ActionResult> {
  try {
    const screenshotKeyRaw = String(formData.get('screenshotKey') ?? '');
    const senderPhoneRaw = String(formData.get('senderPhone') ?? '');
    const addressBuildingRaw = String(formData.get('addressBuilding') ?? '');
    const addressNoteRaw = String(formData.get('addressNote') ?? '');

    const body = AdminCreateBookOrderSchema.parse({
      courseId: String(formData.get('courseId') ?? ''),
      fullName: String(formData.get('fullName') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      altPhone: String(formData.get('altPhone') ?? ''),
      governorateCode: String(formData.get('governorateCode') ?? ''),
      city: String(formData.get('city') ?? ''),
      addressStreet: String(formData.get('addressStreet') ?? ''),
      addressBuilding: addressBuildingRaw.length > 0 ? addressBuildingRaw : null,
      addressNote: addressNoteRaw.length > 0 ? addressNoteRaw : null,
      paid: formData.get('paid') === 'true',
      senderPhone: senderPhoneRaw.length > 0 ? senderPhoneRaw : null,
      screenshotKey: screenshotKeyRaw.length > 0 ? screenshotKeyRaw : null,
    });

    await adminSend('POST', '/api/admin/book-orders', body, AdminCreateBookOrderResultSchema);

    revalidatePath('/admin/books');
    return { ok: true };
  } catch {
    // Never the raw `AdminApiError`/`ZodError` message — see `AdminApiError`'s
    // own doc on why that used to leak an internal route/status/JSON body
    // into this Arabic RTL screen.
    return { ok: false, message: c.createFailed };
  }
}

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
