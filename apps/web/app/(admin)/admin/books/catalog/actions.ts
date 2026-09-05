'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import {
  AdminBookCreateSchema,
  AdminBookPatchSchema,
  AdminBookRowSchema,
  type AdminBookRow,
  type AdminBookCreateInput,
  type AdminBookPatchInput,
} from '@ayman/contracts/admin/books';
import { SiteSettingsSchema, StoreSettingsSchema } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet, adminSend } from '@/lib/admin-api';
import { TAG_BOOKS } from '@/lib/cache-tags';

const c = copy.admin.books;

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * «قسم الكتب» — the catalogue's writes.
 *
 * ## Why every one of these invalidates `TAG_BOOKS`
 *
 * Unlike an order edit, each of these changes what a VISITOR sees: a title, a
 * price, a cover, whether a book is on the shelf at all. `/books` is a
 * `'use cache'` page on that one tag, so without this a repriced book keeps
 * quoting the old number to everyone for the rest of the cache window — the
 * exact failure `api-writes-skip-next-revalidation` describes, on money.
 *
 * ⚠️ `updateTag`, never `revalidateTag` (Global Constraint 15). `updateTag`
 * expires the tag AND refreshes it for the CURRENT request, so the admin's own
 * next read is their own write; `revalidateTag` only marks it stale for the
 * next visitor, which makes a save look like it silently failed until a second
 * reload.
 *
 * `revalidatePath('/admin/books/catalog')` alongside it, because the admin list
 * is an uncached `adminGet` on a Server Component and needs the segment
 * re-rendered rather than a tag expired.
 */
function invalidate(): void {
  updateTag(TAG_BOOKS);
  revalidatePath('/admin/books/catalog');
}

export async function createBookAction(input: AdminBookCreateInput): Promise<ActionResult> {
  try {
    const body = AdminBookCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/books', body, AdminBookRowSchema);
    invalidate();
    return { ok: true };
  } catch {
    // Never the raw `AdminApiError`/`ZodError` message — see `AdminApiError`'s
    // own doc on why that used to leak a route, a status and a JSON body into
    // this Arabic RTL screen.
    return { ok: false, message: c.catalogSaveFailed };
  }
}

export async function patchBookAction(
  id: string,
  input: AdminBookPatchInput,
): Promise<ActionResult> {
  try {
    const body = AdminBookPatchSchema.parse(input);
    await adminSend(
      'PATCH',
      `/api/admin/books/${encodeURIComponent(id)}`,
      body,
      AdminBookRowSchema,
    );
    invalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: c.catalogSaveFailed };
  }
}

/**
 * Deleting a book leaves every order that bought it intact —
 * `book_order_items.book_id` is `ON DELETE SET NULL` and the line keeps its own
 * title and price. The screen still leads with «اخفيه» (`isActive: false`),
 * because a title that comes back next term should not have to be retyped.
 */
export async function deleteBookAction(id: string): Promise<ActionResult> {
  try {
    await adminSend(
      'DELETE',
      `/api/admin/books/${encodeURIComponent(id)}`,
      undefined,
      z.object({ ok: z.boolean() }),
    );
    invalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: c.catalogDeleteFailed };
  }
}

/**
 * The delivery fee — one number for the whole shop, edited here because this is
 * where prices live rather than buried on `/admin/settings` under a fifth tab.
 *
 * Changing it does NOT rewrite existing orders: each one froze its own
 * `shipping_cents` at checkout. It only changes what the next order is quoted,
 * which is exactly what a price change should mean.
 */
export async function setBookShippingAction(shippingCents: number): Promise<ActionResult> {
  try {
    const body = StoreSettingsSchema.parse({ shippingCents });
    /* The route answers with the WHOLE settings object, not the section it was
       given — `SettingsController.update` returns `SiteSettings`. */
    await adminSend('PATCH', '/api/admin/settings/store', body, SiteSettingsSchema);
    invalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: c.shippingSettingFailed };
  }
}

/**
 * Everything the «الكتاب الورقي» panel inside a course editor needs, read on
 * demand.
 *
 * ## Why a Server Action and not props from the course page
 *
 * `/admin/courses/[id]` builds one `AdminCourseDetail`, and a course's book is
 * not part of it — the link lives on `books.course_id`, pointing the other way.
 * Threading it through the page would mean widening that payload for every
 * course editor render, including the forty-lecture ones where nobody opens the
 * book panel at all. The panel is a client island that already knows its own
 * course id, so it asks for exactly what it needs, when it is on screen.
 *
 * It also gives the panel a way to REFRESH itself after a save:
 * `invalidate()` above re-renders `/admin/books/catalog`, which is not the page
 * the admin is standing on.
 *
 * The book is found by scanning the catalogue rather than by a dedicated route:
 * `books.course_id` is UNIQUE, the shop is a list of twelve titles by design
 * (see the catalogue page's own note on why it is not paginated), and one
 * uncached read is cheaper than an endpoint another agent would have to own.
 */
export async function loadCourseBookAction(courseId: string): Promise<
  | { ok: true; book: AdminBookRow | null; subjects: { id: string; nameAr: string }[] }
  | { ok: false; message: string }
> {
  try {
    const [books, subjects] = await Promise.all([
      adminGet('/api/admin/books', z.array(AdminBookRowSchema)),
      /* `/admin/taxonomy/subjects`, not the public `/api/taxonomy` — the same
         reason the catalogue page gives: the public payload nests subjects per
         offering, so one subject appears many times without its bare id. */
      adminGet(
        '/api/admin/taxonomy/subjects',
        z.array(z.object({ id: z.string(), nameAr: z.string() })),
      ),
    ]);
    return {
      ok: true,
      book: books.find((candidate) => candidate.courseId === courseId) ?? null,
      subjects,
    };
  } catch {
    return { ok: false, message: c.actionFailed };
  }
}
