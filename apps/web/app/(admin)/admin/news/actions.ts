'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import {
  AdminNewsDetailSchema,
  AdminNewsRowSchema,
  type NewsCreate,
  type NewsPatch,
} from '@ayman/contracts/news';
import { adminSend } from '@/lib/admin-api';
import { TAG_NEWS } from '@/lib/cache-tags';

/**
 * ⚠️ `updateTag`, never `revalidateTag` (Global Constraint 15). `updateTag`
 * expires the tag AND refreshes it for the CURRENT request, so the editor's
 * next read — including an already-open tab that re-renders — is their own
 * write. `revalidateTag` only marks it stale for the NEXT visitor, which makes
 * a save look like it silently failed until a second reload.
 *
 * Every one of these invalidates `TAG_NEWS`, which covers both the public
 * index and every article page — see the tag's comment for why the section
 * deliberately has no per-post tag.
 */

export async function createArticle(input: NewsCreate) {
  const row = await adminSend('POST', '/api/admin/news', input, AdminNewsRowSchema);
  updateTag(TAG_NEWS);
  return row;
}

export async function patchArticle(id: string, input: NewsPatch) {
  const detail = await adminSend(
    'PATCH',
    `/api/admin/news/${encodeURIComponent(id)}`,
    input,
    AdminNewsDetailSchema,
  );
  updateTag(TAG_NEWS);
  return detail;
}

/**
 * Separate from `patchArticle` because it is a separate PERMISSION
 * (`news:publish`, not `news:write`) — putting a page on the public internet
 * under the instructor's name is a different authority from fixing its typos.
 */
export async function setArticlePublished(id: string, isPublished: boolean) {
  const row = await adminSend(
    'PATCH',
    `/api/admin/news/${encodeURIComponent(id)}/published`,
    { isPublished },
    AdminNewsRowSchema,
  );
  updateTag(TAG_NEWS);
  return row;
}

export async function deleteArticle(id: string) {
  await adminSend(
    'DELETE',
    `/api/admin/news/${encodeURIComponent(id)}`,
    undefined,
    z.object({ ok: z.boolean() }),
  );
  updateTag(TAG_NEWS);
}
