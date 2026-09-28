import { createHmac } from 'node:crypto';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * The key an uploaded lecture is encrypted with — «مينفعش حد ينزّل الفيديو».
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The bucket is public by necessity: a student's browser fetches segments
 * from it with no session. Before this, anyone holding a playlist URL — a
 * student who opened DevTools, anyone they sent it to — had the whole
 * lecture, playable in VLC, forever. Now every segment is AES-128 encrypted,
 * and the key is only ever handed out by the API, to a signed-in student who
 * may watch a lesson that uses the video (`GET /api/videos/:id/key`).
 *
 * ## Derived, not stored
 *
 * HMAC of the video id under the deployment's own secret, domain-separated so
 * it can never collide with anything else that secret signs. So there is no
 * key column to migrate, nothing to copy when an upload replaces another and
 * is cancelled, and nothing a database dump hands over on its own.
 *
 * ⚠️ The one consequence to know: rotating `BETTER_AUTH_SECRET` changes every
 * key, and every encrypted lecture on that stack stops playing until it is
 * re-uploaded. Rotating it already signs every student out; this makes it a
 * decision about the video library too.
 *
 * ## What it does not do
 *
 * It is not DRM. A student who can watch can, with enough effort, record —
 * which is what the name drawn over the picture is for. What this ends is
 * the link that works for anyone, anywhere, without an account.
 */
export function videoKey(secret: string, videoId: string): Buffer {
  return createHmac('sha256', secret).update(`ayman:video-key:v1:${videoId}`).digest().subarray(0, 16);
}

/**
 * Where a player fetches the key. ABSOLUTE and on the SITE's origin, not the
 * video origin: a relative URI would resolve against the playlist, which
 * lives on the bucket's domain — and the key must come from the API, with
 * the student's cookie, never from the bucket.
 */
export function videoKeyUri(appUrl: string, videoId: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/videos/${videoId}/key`;
}
