'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import {
  SocialConnectionSchema,
  SocialConnectionTestSchema,
  SocialPostSchema,
  SocialScanResultSchema,
  type SocialConnection,
  type SocialConnectionTest,
  type SocialConnectionWrite,
  type SocialPost,
  type SocialPostPatch,
  type SocialScanResult,
} from '@ayman/contracts/social/posts';
import { socialPostsCopy } from '@ayman/contracts/copy/social-posts';
import { AdminApiError, adminSend } from '@/lib/admin-api';

/**
 * Every write behind «استوديو البوستات», as Server Actions returning
 * `ActionResult` — the shape `marketing/actions.ts` explains: the class that
 * carries the API's message lives next to `next/headers`, so it is caught
 * here and a plain object crosses to the client.
 *
 * The picture upload is NOT here: it is a few hundred KB to a few MB, and
 * goes browser → API (`lib/social-posts/upload.ts`).
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string; status: number | null };

const POSTS_PATH = '/admin/marketing/posts';

/** The API's own `message`, when it sent one — «post is already published» beats «حصل خطأ». */
function messageOf(error: AdminApiError): string {
  const body = error.payload as { message?: unknown } | null;
  return typeof body?.message === 'string' ? body.message : socialPostsCopy.errorGeneric;
}

async function attempt<T>(work: () => Promise<T>, revalidate = true): Promise<ActionResult<T>> {
  try {
    const data = await work();
    if (revalidate) revalidatePath(POSTS_PATH);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AdminApiError) return { ok: false, message: messageOf(error), status: error.status };
    return { ok: false, message: socialPostsCopy.errorGeneric, status: null };
  }
}

const postPath = (id: string, tail = '') => `/api/admin/social/posts/${encodeURIComponent(id)}${tail}`;

export async function patchPostAction(id: string, patch: SocialPostPatch): Promise<ActionResult<SocialPost>> {
  return attempt(() => adminSend('PATCH', postPath(id), patch, SocialPostSchema));
}

export async function scanAction(): Promise<ActionResult<SocialScanResult>> {
  return attempt(() => adminSend('POST', '/api/admin/social/scan', undefined, SocialScanResultSchema));
}

export async function publishPostAction(id: string): Promise<ActionResult<SocialPost>> {
  return attempt(() => adminSend('POST', postPath(id, '/publish'), undefined, SocialPostSchema));
}

export async function markPublishedAction(id: string, permalink: string | null): Promise<ActionResult<SocialPost>> {
  return attempt(() => adminSend('POST', postPath(id, '/mark-published'), { permalink }, SocialPostSchema));
}

/** After a browser upload: refresh the list the page rendered, no write of its own. */
export async function refreshPostsAction(): Promise<void> {
  revalidatePath(POSTS_PATH);
}

export async function saveConnectionAction(input: SocialConnectionWrite): Promise<ActionResult<SocialConnection>> {
  return attempt(() => adminSend('PUT', '/api/admin/social/connection', input, SocialConnectionSchema));
}

export async function testConnectionAction(): Promise<ActionResult<SocialConnectionTest>> {
  return attempt(() => adminSend('POST', '/api/admin/social/connection/test', undefined, SocialConnectionTestSchema), false);
}
