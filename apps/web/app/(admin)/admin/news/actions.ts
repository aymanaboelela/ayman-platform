'use server';

import { updateTag } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import {
  AdminNewsDetailSchema,
  AdminNewsRowSchema,
  type NewsCreate,
  type NewsPatch,
} from '@ayman/contracts/news';
import { adminSend } from '@/lib/admin-api';
import { TAG_NEWS } from '@/lib/cache-tags';
import { submitToIndexNow } from '@/lib/seo/indexnow';

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

/**
 * ⚠️ `status === 'published'` gates the IndexNow push on BOTH write paths, and
 * it is read from the API's response rather than from the input — a PATCH that
 * renames a draft must not announce that draft's URL to Bing, and the input
 * has no `status` field to check (publishing is a separate route and a separate
 * permission). The response always carries it.
 *
 * The index page goes with the article: a new or retitled article changes
 * `/news` too, and a crawler that fetches only the article never sees that the
 * list it came from has moved.
 */
const announce = (row: { slug: string; status: string }): void => {
  if (row.status !== 'published') return;
  // `after`, not a floating promise: a server action's request may be torn
  // down the moment it returns, and a POST that never completes is a push that
  // silently does nothing. See `submitToIndexNow` for why it can never throw.
  after(() => submitToIndexNow([`/news/${row.slug}`, '/news']));
};

export async function patchArticle(id: string, input: NewsPatch) {
  const detail = await adminSend(
    'PATCH',
    `/api/admin/news/${encodeURIComponent(id)}`,
    input,
    AdminNewsDetailSchema,
  );
  updateTag(TAG_NEWS);
  announce(detail);
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
  announce(row);
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
