'use client';

import {
  DesignAssetSchema,
  DesignFolderDetailSchema,
  DesignFolderSchema,
  DesignStudioSchema,
  MAX_DESIGN_BYTES,
  type DesignAsset,
  type DesignAssetPatch,
  type DesignFolder,
  type DesignFolderCreate,
  type DesignFolderDetail,
  type DesignFolderPatch,
  type DesignPublishShape,
  type DesignStudio,
} from '@ayman/contracts/designs';
import { MediaAssetSchema, type MediaAsset } from '@ayman/contracts/admin/media';
import type { ZodType } from 'zod';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';
import { classify, post } from '@/lib/upload-client';

/**
 * «ستوديو التصميم» from the browser, straight to the API — the same route
 * every upload on this platform takes (see `lib/upload-client.ts` for why a
 * Server Action cannot carry a file over 1 MB). The JSON calls go the same
 * way so the studio is one client: a designer renaming a picture should not
 * wait on a server render to see the new name.
 *
 * Same-origin through the `/api/:path*` rewrite: the session cookie rides
 * along, and the CSRF header is what `CsrfGuard` checks.
 */

export class DesignsRequestError extends Error {
  constructor(readonly status: number) {
    super(`designs request failed with ${status}`);
  }
}

async function send<T>(method: string, path: string, body: unknown, schema: ZodType<T> | null): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      [CSRF_HEADER]: readCsrfToken() || 'browser',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw new DesignsRequestError(response.status);
  if (schema === null) return undefined as T;
  return schema.parse(await response.json());
}

export const designsApi = {
  studio: (): Promise<DesignStudio> => send('GET', '/api/designs', undefined, DesignStudioSchema),
  folder: (id: string): Promise<DesignFolderDetail> =>
    send('GET', `/api/designs/folders/${encodeURIComponent(id)}`, undefined, DesignFolderDetailSchema),
  createFolder: (input: DesignFolderCreate): Promise<DesignFolder> =>
    send('POST', '/api/designs/folders', input, DesignFolderSchema),
  patchFolder: (id: string, input: DesignFolderPatch): Promise<DesignFolder> =>
    send('PATCH', `/api/designs/folders/${encodeURIComponent(id)}`, input, DesignFolderSchema),
  deleteFolder: (id: string): Promise<void> =>
    send('DELETE', `/api/designs/folders/${encodeURIComponent(id)}`, undefined, null),
  patchAsset: (id: string, input: DesignAssetPatch): Promise<DesignAsset> =>
    send('PATCH', `/api/designs/assets/${encodeURIComponent(id)}`, input, DesignAssetSchema),
  deleteAsset: (id: string): Promise<void> =>
    send('DELETE', `/api/designs/assets/${encodeURIComponent(id)}`, undefined, null),
  publish: (id: string, shape: DesignPublishShape): Promise<MediaAsset> =>
    send('POST', `/api/admin/designs/assets/${encodeURIComponent(id)}/publish`, { shape }, MediaAssetSchema),
};

/** Why a picture did not upload — a closed set the screen maps to Arabic once. */
export type DesignUploadFailure = 'tooLarge' | 'badType' | 'unreadable' | 'full' | 'network' | 'failed';

export type DesignUploadOutcome = { ok: true; value: DesignAsset } | { ok: false; reason: DesignUploadFailure };

/**
 * A 503 is the encode slot saying «busy» (one picture is processed at a time,
 * so three stacks on four cores stay up). It is not a failure — the file is
 * fine — so it is retried after a pause, a few times, before it is reported.
 */
const BUSY_RETRIES = 6;
const BUSY_PAUSE_MS = 2500;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendFile(
  path: string,
  file: File,
  onProgress: (fraction: number) => void,
  onBusy: () => void,
): Promise<DesignUploadOutcome> {
  if (file.size > MAX_DESIGN_BYTES) return { ok: false, reason: 'tooLarge' };

  for (let attempt = 0; ; attempt += 1) {
    const response = await post(path, file, onProgress);
    if (!response) return { ok: false, reason: 'network' };
    if (response.status === 503 && attempt < BUSY_RETRIES) {
      onBusy();
      await wait(BUSY_PAUSE_MS * (attempt + 1));
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      if (response.status === 413 && /storage is full/i.test(response.body)) return { ok: false, reason: 'full' };
      return { ok: false, reason: classify(response.status, response.body) };
    }
    try {
      return { ok: true, value: DesignAssetSchema.parse(JSON.parse(response.body)) };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  }
}

/** Never compressed in the browser — the whole point is the original pixels. */
export function uploadDesign(
  folderId: string,
  file: File,
  onProgress: (fraction: number) => void,
  onBusy: () => void,
): Promise<DesignUploadOutcome> {
  return sendFile(`/api/designs/folders/${encodeURIComponent(folderId)}/assets`, file, onProgress, onBusy);
}

export function replaceDesign(
  assetId: string,
  file: File,
  onProgress: (fraction: number) => void,
  onBusy: () => void,
): Promise<DesignUploadOutcome> {
  return sendFile(`/api/designs/assets/${encodeURIComponent(assetId)}/replace`, file, onProgress, onBusy);
}
