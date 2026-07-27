'use server';

import { revalidatePath, updateTag } from 'next/cache';
import {
  NavigationCreateSchema,
  NavigationItemSchema,
  NavigationPatchSchema,
  ReorderSchema,
  type NavigationCreate,
  type NavigationPatch,
} from '@ayman/contracts/admin/navigation';
import { z } from 'zod';
import { adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

export type ActionResult = { ok: true } | { ok: false; message: string };
const OkSchema = z.object({ ok: z.boolean() });

/** Every mutation ends the same way: `updateTag`, never `revalidateTag`
 *  (Global Constraint 15) — the public menu must reflect the admin's own
 *  save on this same request, not the next visitor's. */
function afterWrite(): void {
  updateTag(tags.nav());
  revalidatePath('/admin/navigation');
}

export async function createNavItemAction(input: NavigationCreate): Promise<ActionResult> {
  try {
    const body = NavigationCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/navigation', body, NavigationItemSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function patchNavItemAction(id: string, input: NavigationPatch): Promise<ActionResult> {
  try {
    const body = NavigationPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/navigation/${id}`, body, NavigationItemSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function archiveNavItemAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('DELETE', `/api/admin/navigation/${id}`, undefined, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function restoreNavItemAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/navigation/${id}/restore`, undefined, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function reorderNavAction(
  parentId: string | null,
  ids: string[],
): Promise<ActionResult> {
  try {
    const body = ReorderSchema.parse({ parentId, ids });
    await adminSend('POST', '/api/admin/navigation/order', body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
