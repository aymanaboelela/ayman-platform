'use server';

import { z } from 'zod';
import {
  YoutubeConnectStartSchema,
  YoutubeSuggestionSchema,
  YoutubeVideoDetailSchema,
  YoutubeVideoListSchema,
  type YoutubeConnectStart,
  type YoutubeSuggestion,
  type YoutubeVideoDetail,
  type YoutubeVideoList,
  type YoutubeVideoUpdate,
} from '@ayman/contracts/youtube/studio';
import { youtubeStudioCopy } from '@ayman/contracts/copy/youtube-studio';
import { AdminApiError, adminGet, adminSend } from '@/lib/admin-api';
import { revalidatePath } from '@/lib/revalidate-screen';
import { youtubeErrorText } from '@/lib/youtube-studio/errors';

/**
 * Every call behind «يوتيوب» that is not a file, as Server Actions returning
 * a plain `ActionResult` — the shape `marketing/posts/actions.ts` explains.
 * The thumbnail is NOT here: it goes browser → API
 * (`lib/youtube-studio/upload-thumbnail.ts`).
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string; status: number | null };

const PATH = '/admin/youtube';
const video = (id: string, tail = '') => `/api/admin/youtube/videos/${encodeURIComponent(id)}${tail}`;

async function attempt<T>(work: () => Promise<T>, revalidate = false): Promise<ActionResult<T>> {
  try {
    const data = await work();
    if (revalidate) revalidatePath(PATH);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof AdminApiError) {
      return { ok: false, message: youtubeErrorText(error.status, error.payload), status: error.status };
    }
    return { ok: false, message: youtubeStudioCopy.errorGeneric, status: null };
  }
}

export async function startConnectAction(): Promise<ActionResult<YoutubeConnectStart>> {
  return attempt(() => adminSend('POST', '/api/admin/youtube/oauth/start', undefined, YoutubeConnectStartSchema));
}

export async function disconnectAction(): Promise<ActionResult<{ revoked: boolean }>> {
  return attempt(
    () => adminSend('DELETE', '/api/admin/youtube/connection', undefined, z.object({ revoked: z.boolean() })),
    true,
  );
}

export async function loadVideosAction(pageToken: string | null): Promise<ActionResult<YoutubeVideoList>> {
  const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
  return attempt(() => adminGet(`/api/admin/youtube/videos${query}`, YoutubeVideoListSchema));
}

export async function loadVideoAction(id: string): Promise<ActionResult<YoutubeVideoDetail>> {
  return attempt(() => adminGet(video(id), YoutubeVideoDetailSchema));
}

export async function saveVideoAction(id: string, patch: YoutubeVideoUpdate): Promise<ActionResult<YoutubeVideoDetail>> {
  return attempt(() => adminSend('PATCH', video(id), patch, YoutubeVideoDetailSchema), true);
}

export async function suggestAction(id: string, courseId: string | null): Promise<ActionResult<YoutubeSuggestion>> {
  return attempt(() => adminSend('POST', video(id, '/suggest'), { courseId }, YoutubeSuggestionSchema));
}

export async function markHandledAction(id: string): Promise<ActionResult<{ ok: true }>> {
  return attempt(() => adminSend('POST', video(id, '/handled'), undefined, z.object({ ok: z.literal(true) })), true);
}
