'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import {
  PROMO_BANNER_MAX,
  PromoBannerCreateSchema,
  PromoBannerPatchSchema,
  PromoBannerReorderSchema,
  PromoBannerSchema,
  type PromoBannerCreate,
  type PromoBannerPatch,
} from '@ayman/contracts/admin/promo-banners';
import { promoBannersCopy } from '@ayman/contracts/copy/promo-banners';
import { formatCopy } from '@ayman/contracts/format';
import { AdminApiError, adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';
import { revalidatePath } from '@/lib/revalidate-screen';

const c = promoBannersCopy.admin;
const OkSchema = z.object({ ok: z.boolean() });

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * ⚠️ `updateTag`, not `revalidateTag` (Global Constraint 15).
 *
 * Every student's dashboard reads `getPromoBanners()`, a `'use cache'` entry
 * on this one tag with `cacheLife('minutes')`. Without this line the
 * instructor stops a banner, opens the dashboard as a student, still sees it,
 * and presses «وقّفه» again — `updateTag` makes this same request see the
 * write.
 */
function afterWrite(): void {
  updateTag(tags.promoBanners());
  revalidatePath('/admin/promo-banners');
}

/**
 * The message is from the copy table, never the error: `adminSend` throws
 * `POST /api/… failed with 400: {…}`, which would print as English JSON on an
 * Arabic screen. The one failure worth naming is the cap, because the fix
 * (delete an old banner) is not obvious from «الحفظ ماتمّش».
 */
function failure(error: unknown, creating = false): ActionResult {
  // 409 from `create` is the cap; from `reorder` it is a stale list, which
  // «الحفظ ماتمّش» plus the refreshed screen already explains.
  if (creating && error instanceof AdminApiError && error.status === 409) {
    return { ok: false, message: formatCopy(c.limitReached, { max: String(PROMO_BANNER_MAX) }) };
  }
  return { ok: false, message: c.saveFailed };
}

export async function createPromoBannerAction(input: PromoBannerCreate): Promise<ActionResult> {
  try {
    const body = PromoBannerCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/promo-banners', body, PromoBannerSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return failure(error, true);
  }
}

export async function patchPromoBannerAction(id: string, input: PromoBannerPatch): Promise<ActionResult> {
  try {
    const body = PromoBannerPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/promo-banners/${encodeURIComponent(id)}`, body, PromoBannerSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function removePromoBannerAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('DELETE', `/api/admin/promo-banners/${encodeURIComponent(id)}`, undefined, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function reorderPromoBannersAction(ids: string[]): Promise<ActionResult> {
  try {
    const body = PromoBannerReorderSchema.parse({ ids });
    await adminSend('POST', '/api/admin/promo-banners/order', body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
