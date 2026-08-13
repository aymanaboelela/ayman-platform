'use client';

import { useEffect } from 'react';
import { UPSTREAM_TIMEOUT_DIGEST } from './api';

/**
 * The one place an `error.tsx` hands its error somewhere before drawing a
 * calm screen over it.
 *
 * ## Why this exists at all
 *
 * An error boundary is a `catch`, and a `catch` that only renders is a
 * `catch` that swallows. The four boundaries under `app/` all render the same
 * reassuring paragraph, so without this the ONLY trace of a client-side
 * failure would be that paragraph — which by design says nothing about what
 * broke.
 *
 * Server Component throws are the case that is already covered: Next logs
 * those on the server with the full stack and prints the `digest` next to it,
 * which is exactly why the boundaries render that digest. This hook is for the
 * other half — an error thrown while React was rendering on the CLIENT, which
 * carries no digest, never reaches a server log, and would otherwise be
 * invisible.
 *
 * ## The reporter this file reserved a place for
 *
 * The paragraph that used to be here said there was no client error reporting
 * in this repo — no Sentry, no RUM, no `onRequestError` — that `console.error`
 * was the entire sink, and that when a reporter was added it should go HERE,
 * one call in one file, rather than being pasted into each boundary. This is
 * that reporter, added for the reason the gap predicted: the instructor's only
 * signal that anything was broken was a student telling him, days late and
 * without a route, a device or a count.
 *
 * `POST /api/errors` groups on a fingerprint server-side, so a five-minute
 * outage that hits four hundred page views becomes ONE row with a counter
 * rather than four hundred rows. `/admin/errors` is where it is read.
 *
 * ## ⚠️ Nothing here may throw, and nothing here may be awaited
 *
 * The caller is an error boundary: the student is already looking at a
 * failure, and a reporter that failed visibly would be the second one. So the
 * fetch is fire-and-forget, every rejection is swallowed, and `keepalive` is
 * set so a report survives the student closing the tab on a page that would
 * not load — which is exactly the moment they are most likely to.
 *
 * `console.error` is kept alongside it. The network call is for the
 * instructor; the console line is for whoever is holding the device with
 * devtools open, and it costs nothing.
 *
 * ## Why `useEffect` and not a call in the render body
 *
 * The boundary re-renders on every `reset()` attempt and on any parent
 * re-render. Reporting in the body would fire on each of those, and under
 * StrictMode twice per mount, turning one failure into a stream of identical
 * reports. Keyed on `error`, this fires once per distinct error object, which
 * is once per actual failure.
 */
export function useErrorReport(error: Error & { digest?: string }): void {
  useEffect(() => {
    // The whole object, not `error.message`. In a production build Next has
    // already replaced the message of a Server Component error with one fixed
    // generic sentence, so the message alone would say nothing; the object
    // still carries the `digest` that ties it to the server log, and on a
    // genuine client error it carries the real stack.
    console.error('[error-boundary]', error);

    /*
     * `timeout` is a distinguishable kind because `lib/api.ts` stamps a known
     * digest on that path — Next preserves a digest that is already set, so it
     * survives to the browser in production where the message does not. A
     * digest we did not write means Next generated one, which only happens for
     * a SERVER render; no digest at all means the throw happened here, on the
     * client, while React was rendering.
     */
    const kind =
      error.digest === UPSTREAM_TIMEOUT_DIGEST
        ? 'timeout'
        : error.digest
          ? 'server'
          : 'client';

    void fetch('/api/errors', {
      method: 'POST',
      // Same-origin only, and no CSRF header: this route is `@Public()` and
      // deliberately not CSRF-guarded — see the controller for why appending
      // to a log nobody is impersonated in is not the same risk as appending
      // to a student's conversation.
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      // Outlives the page. A student who gives up and closes the tab is the
      // most valuable report there is, and the one most likely to be lost.
      keepalive: true,
      body: JSON.stringify({
        kind,
        // The PATHNAME, never `href`. A query string on this platform can
        // carry a password-reset token or an `?assistant=1` deep link, and an
        // error log is the wrong place for either. The API re-checks this.
        route: window.location.pathname,
        message: error.message.slice(0, 1000),
        digest: error.digest,
        stack: error.stack?.slice(0, 4000),
      }),
    }).catch(() => {
      // The API is unreachable — which, given what this hook is called for, is
      // frequently the very thing being reported. Nothing to do and nothing to
      // say: the student is already looking at the failure screen.
    });
  }, [error]);
}
