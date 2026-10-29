import { MAX_YOUTUBE_THUMBNAIL_BYTES, YoutubeVideoDetailSchema, type YoutubeVideoDetail } from '@ayman/contracts/youtube/studio';
import { youtubeStudioCopy as y } from '@ayman/contracts/copy/youtube-studio';
import { post } from '@/lib/upload-client';
import { youtubeErrorText } from './errors';

export type ThumbnailOutcome = { ok: true; value: YoutubeVideoDetail } | { ok: false; message: string };

const TYPES = new Set(['image/jpeg', 'image/png']);

/**
 * A custom thumbnail, from the browser straight to the API — never through a
 * Server Action, whose 1 MB body cap refuses a 2 MB picture in silence
 * (`server-action-1mb-upload-ceiling`). The API checks the bytes again and
 * hands them to `thumbnails.set`; a refusal comes back with YouTube's own
 * sentence (`errors.ts`).
 *
 * A module of its own rather than one more export on `upload-client.ts`, for
 * the reason `lib/social-posts/upload.ts` gives.
 */
export async function uploadYoutubeThumbnail(videoId: string, file: File): Promise<ThumbnailOutcome> {
  if (file.size > MAX_YOUTUBE_THUMBNAIL_BYTES) return { ok: false, message: y.editor.thumbnailTooLarge };
  if (!TYPES.has(file.type)) return { ok: false, message: y.editor.thumbnailBadType };
  const response = await post(`/api/admin/youtube/videos/${encodeURIComponent(videoId)}/thumbnail`, file);
  if (!response) return { ok: false, message: y.editor.thumbnailFailed };
  let body: unknown = null;
  try {
    body = JSON.parse(response.body);
  } catch {
    // A proxy's HTML page — the status alone decides below.
  }
  if (response.status === 413) return { ok: false, message: y.editor.thumbnailTooLarge };
  if (response.status < 200 || response.status >= 300) {
    const text = youtubeErrorText(response.status, body);
    return { ok: false, message: text === y.errorGeneric ? y.editor.thumbnailFailed : text };
  }
  const parsed = YoutubeVideoDetailSchema.safeParse(body);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, message: y.editor.thumbnailFailed };
}
