import { youtubeStudioCopy as y } from '@ayman/contracts/copy/youtube-studio';

/**
 * What the «يوتيوب» screen says when the API refused, from the status and the
 * parsed error body (`{ message, code? }` — `all-exceptions.filter.ts`).
 *
 * Isomorphic on purpose: the Server Actions, the page and the browser upload
 * (which never passes through an action) all read the same answer.
 *
 *   · `youtube`               Google's OWN sentence, shown as is — «the
 *                             authenticated user doesn't have permissions to
 *                             upload and set custom video thumbnails» says
 *                             «verify the channel» better than a translation;
 *   · `youtube_quota`         the project's 10,000 units for the day are gone;
 *   · `youtube_not_connected` the grant was revoked from the Google account.
 */
export function youtubeErrorText(status: number | null, payload: unknown): string {
  const body = (payload && typeof payload === 'object' ? payload : {}) as { message?: unknown; code?: unknown };
  const message = typeof body.message === 'string' ? body.message : '';
  if (body.code === 'youtube_quota') return y.errorQuota;
  if (body.code === 'youtube_not_connected') return y.errorNotConnected;
  if (body.code === 'ai_unavailable') return y.editor.noAi;
  if (body.code === 'youtube' && message) return y.errorYoutube(message);
  if (status === 429) return y.errorThrottled;
  if (status === 502 && message.startsWith('the AI')) return y.errorAi;
  return y.errorGeneric;
}
