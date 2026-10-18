/**
 * What an error MESSAGE alone can say about where a failure came from — the
 * part of `/admin/errors`' triage that both ends of the pipe have to agree on.
 *
 * ## Why this is shared, and why it is its own module
 *
 * The browser decides what to file (`apps/web/lib/report-error.ts`) and the API
 * decides what to store (`DiagnosticsService.record`). The API's check is the
 * one that still holds for a tab running a build from before a rule was added,
 * so the two lists must be the same list — and they drifted the first time
 * round: `87b3d476` taught both sides «Failed to fetch» and «Load failed» and
 * neither of them Chrome's other sentence for the same event, «network error»,
 * which is what filled the log next.
 *
 * Zod-free and import-free on purpose. `report-error.ts` is evaluated by every
 * error boundary in the product, and `diagnostics.ts` next door would drag Zod
 * into all of them; and the API loads contracts subpaths through Node's own
 * loader, where a leaf with no relative imports is the shape that boots (see
 * `apps/api/test/contracts-barrel.check.ts`). A NEW module rather than more
 * exports on an old one, for the reason `zod-exports-only-z.spec.ts` records.
 */

/**
 * The sentences browsers and React use when the CONNECTION failed, not the page.
 *
 * Each engine words the one event differently, and the event has two shapes:
 *
 *   · the request never got an answer — Chrome «Failed to fetch», Safari «Load
 *     failed», Firefox «NetworkError when attempting to fetch resource.»;
 *   · the answer started and its body died half-way — Chrome «network error»
 *     (a `TypeError` thrown out of the RSC stream reader, which is what
 *     `/results`, `/rank`, `/dashboard` and a quiz review recorded), Safari «The
 *     network connection was lost.», and React's own «Connection closed.» when
 *     a Flight stream ends before every row it promised has arrived.
 *
 * None of them is a fault in this product, and none of them is fixed by
 * changing code — the student's mobile data dropped. They are matched EXACTLY,
 * never as substrings: «network error» inside a longer sentence is somebody's
 * real message and must still reach the log.
 */
export const CONNECTIVITY_ERROR_MESSAGES: readonly string[] = [
  'Failed to fetch',
  'Load failed',
  'network error',
  'NetworkError when attempting to fetch resource.',
  'The network connection was lost.',
  'The Internet connection appears to be offline.',
  'The request timed out.',
  'A server with the specified hostname could not be found.',
  'Network request failed',
  'Connection closed.',
];

export function isConnectivityErrorMessage(message: string | null | undefined): boolean {
  return typeof message === 'string' && CONNECTIVITY_ERROR_MESSAGES.includes(message.trim());
}

/**
 * Next's replacement for a Server Component error's message in a production
 * build. The browser only ever sees this; the server has the real one.
 *
 * Matched on its middle clause, which is the stable part of a sentence Next has
 * reworded at both ends across versions («An error occurred in the Server
 * Components render. The specific message is omitted in production builds to
 * avoid leaking sensitive details. A digest property is included…»). Next's own
 * `create-error-handler.js` keys on the same fragment.
 *
 * It matters to the log because a report carrying it knows NOTHING the row does
 * not already know — so it must never overwrite a message or a stack the
 * server's own report put there. See `DiagnosticsService.record`.
 */
export function isOmittedServerErrorMessage(message: string | null | undefined): boolean {
  return (
    typeof message === 'string' &&
    message.includes('The specific message is omitted in production builds')
  );
}

/**
 * What Next's client throws when a Server Action was answered by something that
 * is not an RSC payload (`server-action-reducer.js`, next 16.2.11).
 *
 * Next's own server never produces that answer: a fetch action is always
 * answered with `text/x-component`, or — for an action id this build does not
 * know — with an empty 404 and `x-nextjs-action-not-found`, which the client
 * turns into the separate «Server Action "…" was not found» sentence. So this
 * one means the response came from IN FRONT of the app: Traefik's plain-text
 * 404 / 502 while a deploy swaps containers, or Cloudflare's HTML error page
 * when the origin did not answer. Recorded on `/admin/grading/<id>` and
 * `/admin/homework/<id>` — an editor pressing save while `main` deployed.
 */
export const UNEXPECTED_SERVER_RESPONSE_MESSAGE = 'An unexpected response was received from the server.';

export function isUnexpectedServerResponseMessage(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.trim() === UNEXPECTED_SERVER_RESPONSE_MESSAGE;
}
