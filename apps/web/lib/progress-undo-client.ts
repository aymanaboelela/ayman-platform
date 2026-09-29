import { HeartbeatResponseSchema, type HeartbeatResponse } from '@ayman/contracts/progress';
import { ApiRequestError, bound, resolve } from './api';
import { CSRF_HEADER, readCsrfToken } from './csrf';

/**
 * «نرجّع الدرس؟» — `DELETE` on the same path `postComplete` POSTs to, and the
 * same `HeartbeatResponse` back, so `LessonPlayerView.onProgress` takes either
 * answer without knowing which way the lesson moved.
 *
 * ## Why its own module, and not a fourth export of `./progress-client`
 *
 * Same reason `@ayman/contracts/completion-undo` is its own module: a tab that
 * outlived the deploy keeps the first factory it registered for a path, and a
 * new player chunk reading `deleteComplete` off an OLD `progress-client` gets
 * `undefined`. A new path has no old factory to lose to.
 *
 * And not `apiDelete`: that one is for `204`s and throws the body away, and
 * this answer is what redraws the button.
 */
export async function deleteComplete(lessonId: string): Promise<HeartbeatResponse> {
  const path = `/api/lessons/${lessonId}/complete`;
  const response = await fetch(
    resolve(path),
    bound({
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { accept: 'application/json', [CSRF_HEADER]: readCsrfToken() },
    }),
  );

  if (!response.ok) {
    throw new ApiRequestError(response.status, path, await response.json().catch(() => undefined));
  }

  return HeartbeatResponseSchema.parse(await response.json());
}
