'use server';

import { revalidatePath, updateTag } from 'next/cache';
import {
  HomeBlockCreateSchema,
  HomeBlockPatchSchema,
  HomeBlockReorderSchema,
  HomeBlockSchema,
  type HomeBlockCreate,
  type HomeBlockPatch,
} from '@ayman/contracts/admin/home-blocks';
import { z } from 'zod';
import { adminSend } from '@/lib/admin-api';
import { tags } from '@/lib/cache-tags';

export type ActionResult = { ok: true } | { ok: false; message: string };
const OkSchema = z.object({ ok: z.boolean() });

/** `updateTag`, never `revalidateTag` (Global Constraint 15) — the public
 *  homepage must reflect this save on this same request. */
function afterWrite(): void {
  updateTag(tags.homeBlocks());
  revalidatePath('/admin/home');
}

export async function createHomeBlockAction(input: HomeBlockCreate): Promise<ActionResult> {
  try {
    const body = HomeBlockCreateSchema.parse(input);
    await adminSend('POST', '/api/admin/home-blocks', body, HomeBlockSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function patchHomeBlockAction(id: string, input: HomeBlockPatch): Promise<ActionResult> {
  try {
    const body = HomeBlockPatchSchema.parse(input);
    await adminSend('PATCH', `/api/admin/home-blocks/${id}`, body, HomeBlockSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function setHomeBlockPublishedAction(id: string, isPublished: boolean): Promise<ActionResult> {
  try {
    await adminSend('PATCH', `/api/admin/home-blocks/${id}/published`, { isPublished }, HomeBlockSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function archiveHomeBlockAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('DELETE', `/api/admin/home-blocks/${id}`, undefined, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function restoreHomeBlockAction(id: string): Promise<ActionResult> {
  try {
    await adminSend('POST', `/api/admin/home-blocks/${id}/restore`, undefined, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}

export async function reorderHomeBlocksAction(ids: string[]): Promise<ActionResult> {
  try {
    const body = HomeBlockReorderSchema.parse({ ids });
    await adminSend('POST', '/api/admin/home-blocks/order', body, OkSchema);
    afterWrite();
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
