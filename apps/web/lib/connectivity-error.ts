import { isConnectivityErrorMessage } from '@ayman/contracts/error-classify';

/**
 * "The page did not fail — the student's connection did."
 *
 * ## What it looked like on `/admin/errors`
 *
 * `TypeError: network error` on `/results` (five in one second), on a quiz
 * review (seven in ten minutes), on `/dashboard` and `/rank` — all from the same
 * kind of phone on the same kind of mobile data. That sentence is Chrome's for a
 * response whose BODY died half-way: the soft navigation's RSC payload started
 * streaming, the connection dropped, the Flight reader threw, and the route's
 * `error.tsx` caught it. The student met «الصفحة دي مافتحتش» for a page that was
 * perfectly fine, and the instructor met a row he could do nothing about.
 *
 * `87b3d476` had already stopped filing Chrome's OTHER sentence for the same
 * event («Failed to fetch») and Safari's («Load failed»). The list is now one
 * list, shared with the API — `@ayman/contracts/error-classify` says why.
 *
 * ## Two halves, both required
 *
 * The message must be one of the known sentences AND the error a `TypeError`
 * (or React's plain `Error` for «Connection closed.», the one it raises itself
 * when a Flight stream ends early). The name is what keeps a component that
 * happens to throw `new Error('network error')` on purpose in the log.
 *
 * `navigator.onLine === false` is the third way in: a browser that KNOWS it is
 * offline is not a page fault whatever it threw. The converse is not true —
 * `onLine` is `true` on exactly the weak-signal and captive-portal cases that
 * matter, which is why this does not rely on it.
 *
 * A NEW module rather than more exports on `stale-deploy.ts` or
 * `report-error.ts`: both already shipped in client bundles, and a tab from an
 * older build that loaded a newer chunk importing a fresh export from either
 * would read it as `undefined` — see `zod-exports-only-z.spec.ts` in contracts.
 * The same reason this file names React's two spellings itself below instead of
 * importing `MINIFIED_CONNECTION_CLOSED_MESSAGE`: a fresh export read through an
 * older tab's copy of `error-classify` would be `undefined`.
 */
export function isConnectivityError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!(error instanceof Error)) return false;
  if (!isConnectivityErrorMessage(error.message)) return false;
  return error.name === 'TypeError' || isReactConnectionClosed(error.message);
}

/**
 * React's own «the Flight stream ended early», which it raises as a plain
 * `Error`. Next 16.2.11's React threw the sentence; the 19.3 build in 16.3.8
 * throws it minified as error #412 — see `MINIFIED_CONNECTION_CLOSED_MESSAGE`
 * in `@ayman/contracts/error-classify`. The caller has already matched the
 * whole message against that shared list, so a prefix is enough here.
 */
function isReactConnectionClosed(message: string): boolean {
  const text = message.trim();
  return text === 'Connection closed.' || text.startsWith('Minified React error #412;');
}
