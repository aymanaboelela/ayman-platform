'use server';

import { updateTag } from 'next/cache';
import { revalidatePath } from '@/lib/revalidate-screen';
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
import { STARTER_HOME_BLOCKS } from '@/lib/home-blocks';

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

/**
 * Writes the shipped landing page into `home_blocks`, published, in order.
 *
 * With an empty table the public page already renders `STARTER_HOME_BLOCKS` as
 * a fallback, so this changes nothing a visitor sees — it converts the page
 * from "hardcoded default" into "rows you can now reorder, rewrite and
 * unpublish". Offered only when the table IS empty (see `page.tsx`), because
 * running it twice would collide on the unique `key` and half-succeed.
 *
 * ⚠️ `STARTER_HOME_BLOCKS`, not `DEFAULT_HOME_BLOCKS`. The two are the same
 * list on Ayman's stack and deliberately different on anybody else's, and this
 * action is the one place where the difference is irreversible: the fallback
 * can be re-gated by an env var, but rows written into `home_blocks` are that
 * tenant's page until somebody deletes them by hand.
 *
 * Sequential rather than `Promise.all`: `HomeBlocksService.create` computes
 * each row's `position` from `MAX(position) + 1`, so ten concurrent creates
 * would all read the same maximum and land on the same position.
 */
export async function seedDefaultHomeBlocksAction(): Promise<ActionResult> {
  try {
    for (const block of STARTER_HOME_BLOCKS) {
      const body = HomeBlockCreateSchema.parse({
        key: block.key,
        isPublished: true,
        props: block.props,
      });
      await adminSend('POST', '/api/admin/home-blocks', body, HomeBlockSchema);
    }
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
