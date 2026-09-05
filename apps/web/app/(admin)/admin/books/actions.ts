'use server';

import { revalidatePath } from 'next/cache';
import {
  AdminCreateBookOrderResultSchema,
  AdminCreateBookOrderSchema,
  DeleteBookOrderResultSchema,
  DeleteBookOrderSchema,
  MarkBookOrderDeliveredResultSchema,
  MarkBookOrderShippedResultSchema,
  RejectBookOrderResultSchema,
  RejectBookOrderSchema,
  RestoreBookOrderResultSchema,
} from '@ayman/contracts/admin/book-orders';
import { z } from 'zod';
import {
  AdminBookOrderPatchSchema,
  AdminBookRowSchema,
  type AdminBookOrderPatchInput,
} from '@ayman/contracts/admin/books';
import { BookOrderSchema } from '@ayman/contracts/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet, adminSend } from '@/lib/admin-api';

const c = copy.admin.books;

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * One catalogue book as an order line, priced from the SHELF.
 *
 * The dialog sends an id and nothing else, and the price is looked up here
 * rather than posted from the form — same rule the public cart follows, for the
 * same reason. It is a deliberate asymmetry with `adminPatchBookOrderAction`,
 * where the admin DOES type the price: creating an order quotes the shop, and
 * negotiating a different number is an edit made afterwards, visibly.
 */
async function catalogLine(bookId: string) {
  const books = await adminGet('/api/admin/books', z.array(AdminBookRowSchema));
  const book = books.find((entry) => entry.id === bookId);
  if (!book) throw new Error('unknown book');
  return {
    bookId: book.id,
    titleAr: book.titleAr,
    unitPriceCents: book.priceCents,
    quantity: 1,
  };
}

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

    /*
     * Exactly one of the two, mirroring the dialog's own source toggle — the
     * schema refines on "one, never both", so sending an empty string for the
     * absent one would be a shape error rather than an omission.
     *
     * The catalogue branch sends a one-line basket. `unitPriceCents` is read
     * from the BOOK on the server, not typed here: this is the create path, and
     * the price the admin is quoting is the shelf price until they edit the
     * order afterwards.
     */
    const courseIdRaw = String(formData.get('courseId') ?? '');
    const bookIdRaw = String(formData.get('bookId') ?? '');
    const chosen =
      bookIdRaw.length > 0
        ? { items: [await catalogLine(bookIdRaw)] }
        : { courseId: courseIdRaw };

    const body = AdminCreateBookOrderSchema.parse({
      ...chosen,
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

/**
 * «أعدل الطلب» — the basket, the delivery fee, the discount, the address and
 * the internal note, in one PATCH.
 *
 * Takes a typed object rather than a `FormData`, unlike its neighbours: the
 * payload contains an ARRAY of lines, and round-tripping that through form
 * fields would mean inventing an indexed naming convention and parsing it back
 * — a second, hand-rolled encoding of a shape the contract already describes.
 * The dialog that calls this is a client component holding real state.
 *
 * ⚠️ `revalidatePath`, matching this file's two neighbours. The public shop is
 * NOT invalidated here, and that is correct: editing one order changes nothing
 * a visitor can see — no price, no stock, no title — so expiring `TAG_BOOKS`
 * would drop the whole catalogue's cache for a write that cannot affect it.
 * The catalogue actions in `catalog/actions.ts` do invalidate it, because they
 * change what is on sale.
 */
export async function adminPatchBookOrderAction(
  id: string,
  input: AdminBookOrderPatchInput,
): Promise<ActionResult> {
  try {
    const body = AdminBookOrderPatchSchema.parse(input);
    await adminSend(
      'PATCH',
      `/api/admin/book-orders/${encodeURIComponent(id)}`,
      body,
      BookOrderSchema,
    );
    revalidatePath('/admin/books');
    return { ok: true };
  } catch {
    return { ok: false, message: c.editFailed };
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

/*
 * ════════════════════════════════════════════════════════════════════════════
 * The rest of an order's life: «وصل»، «ارفض»، «احذف»، «رجّعه».
 *
 * ## None of these touch `TAG_BOOKS`, on purpose
 *
 * Same reasoning as `adminPatchBookOrderAction` above, and it is worth stating
 * once for all four: not one of them changes anything a VISITOR can see. No
 * price moves, no title changes, no book leaves the shelf — so expiring the
 * public catalogue's tag would drop every shopper's cache for a write that
 * cannot affect them. `catalog/actions.ts` invalidates because it changes what
 * is on sale; this file changes what happened to one parcel.
 *
 * ## Why the failure message differs per action
 *
 * «مقدرناش نرفض الطلب» and «مقدرناش نحذف الطلب» are two different sentences
 * because they are two different things to have failed at, and an admin who
 * pressed «احذف» wants to know the DELETE is what did not happen. Never the raw
 * `AdminApiError` message — see its own doc on why that used to leak a route, a
 * status and a JSON body into this Arabic RTL screen.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * «وصل» — the arrival, which is NOT a tidier «اتشحن».
 *
 * Pressing it SENDS the student a notification (`bookOrderDelivered`), so it is
 * a statement about the world rather than a bookkeeping click — which is why
 * the button that calls it confirms first, and why the confirmation says so.
 *
 * The 400 is mapped rather than shown: the API answers a second «وصل» on an
 * already-delivered order with one, and «الطلب ده اتسجّل إنه وصل قبل كده» is a
 * fact the admin can act on, unlike a status code.
 */
export async function markBookOrderDeliveredAction(id: string): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/book-orders/${encodeURIComponent(id)}/deliver`,
      {},
      MarkBookOrderDeliveredResultSchema,
    );
    revalidatePath('/admin/books');
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes('failed with 400')
        ? 'already-delivered'
        : error instanceof Error
          ? error.message
          : 'unknown';
    return { ok: false, message };
  }
}

/**
 * «ارفض الطلب» — turn it down, and tell the student why in your own words.
 *
 * The reason is parsed HERE as well as in the dialog and again in the API: the
 * dialog's copy is the same `RejectBookOrderSchema`, so an admin cannot get
 * past it with an empty box, but a Server Action is a public endpoint and this
 * is the boundary that makes that true rather than a hope.
 */
export async function rejectBookOrderAction(id: string, reason: string): Promise<ActionResult> {
  try {
    const body = RejectBookOrderSchema.parse({ reason });
    await adminSend(
      'POST',
      `/api/admin/book-orders/${encodeURIComponent(id)}/reject`,
      body,
      RejectBookOrderResultSchema,
    );
    revalidatePath('/admin/books');
    return { ok: true };
  } catch {
    return { ok: false, message: c.rejectFailed };
  }
}

/**
 * «احذف الطلب» — hide it from every working list. Soft, and the reason is
 * internal: the student is never told (most of these rows are guests with no
 * account to tell), and the text is for whoever asks «ليه اتشال ده» later.
 *
 * A DELETE with a BODY, which is unusual enough to say out loud: the reason is
 * required, and putting a required field in a query string would put it in the
 * access log of every proxy between here and the API.
 */
export async function deleteBookOrderAction(id: string, reason: string): Promise<ActionResult> {
  try {
    const body = DeleteBookOrderSchema.parse({ reason });
    await adminSend(
      'DELETE',
      `/api/admin/book-orders/${encodeURIComponent(id)}`,
      body,
      DeleteBookOrderResultSchema,
    );
    revalidatePath('/admin/books');
    return { ok: true };
  } catch {
    return { ok: false, message: c.removeFailed };
  }
}

/**
 * «رجّعه» — undo a deletion. No reason asked for: putting something back is not
 * a decision anybody has to justify, and the audit log records who did it.
 * A plain `window.confirm` is enough on the button side for the same reason.
 */
export async function restoreBookOrderAction(id: string): Promise<ActionResult> {
  try {
    await adminSend(
      'POST',
      `/api/admin/book-orders/${encodeURIComponent(id)}/restore`,
      {},
      RestoreBookOrderResultSchema,
    );
    revalidatePath('/admin/books');
    return { ok: true };
  } catch {
    return { ok: false, message: c.restoreFailed };
  }
}
