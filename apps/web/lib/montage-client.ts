'use client';

import {
  MontageDownloadSchema,
  MontageListSchema,
  MontagePublishResultSchema,
  MontageTargetsSchema,
  MontageUploadSessionSchema,
  MontageVideoSchema,
  type MontageDownload,
  type MontageList,
  type MontagePublish,
  type MontagePublishResult,
  type MontageTargets,
  type MontageUploadComplete,
  type MontageUploadResume,
  type MontageUploadSession,
  type MontageUploadStart,
  type MontageVideo,
  type MontageVideoPatch,
} from '@ayman/contracts/montage';
import type { ZodType } from 'zod';
import { CSRF_HEADER, readCsrfToken } from '@/lib/csrf';

/**
 * «المونتاج» from the browser, straight to the API — `designs-client.ts`'s
 * reasoning: the editor's account has no dashboard, and a Server Action under
 * `/admin` is the dashboard's code. The video bytes never come through here at
 * all; these are the small JSON messages around a transfer that goes from the
 * browser to the bucket (see `video-upload-manager.ts`).
 */

export class MontageRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string | null,
  ) {
    super(`montage request failed with ${status}`);
  }
}

/** The API's own Arabic sentence, when it sent one — Nest puts it in `message`. */
async function detailOf(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' ? body.message : null;
  } catch {
    return null;
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
  if (!response.ok) throw new MontageRequestError(response.status, await detailOf(response));
  if (schema === null) return undefined as T;
  return schema.parse(await response.json());
}

const at = (id: string) => `/api/montage/${encodeURIComponent(id)}`;

export const montageApi = {
  list: (): Promise<MontageList> => send('GET', '/api/montage', undefined, MontageListSchema),
  start: (input: MontageUploadStart): Promise<MontageUploadSession> =>
    send('POST', '/api/montage/uploads', input, MontageUploadSessionSchema),
  resume: (id: string, input: MontageUploadResume): Promise<MontageUploadSession> =>
    send('POST', `${at(id)}/upload/resume`, input, MontageUploadSessionSchema),
  complete: (id: string, input: MontageUploadComplete): Promise<MontageVideo> =>
    send('POST', `${at(id)}/upload/complete`, input, MontageVideoSchema),
  patch: (id: string, input: MontageVideoPatch): Promise<MontageVideo> =>
    send('PATCH', at(id), input, MontageVideoSchema),
  remove: (id: string): Promise<void> => send('DELETE', at(id), undefined, null),
  download: (id: string): Promise<MontageDownload> => send('GET', `${at(id)}/download`, undefined, MontageDownloadSchema),
  targets: (): Promise<MontageTargets> => send('GET', '/api/admin/montage/targets', undefined, MontageTargetsSchema),
  publish: (id: string, input: MontagePublish): Promise<MontagePublishResult> =>
    send('POST', `/api/admin/montage/${encodeURIComponent(id)}/publish`, input, MontagePublishResultSchema),
};
