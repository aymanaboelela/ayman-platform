'use client';

import { useEffect } from 'react';
import { isConnectivityError } from './connectivity-error';
import { isModuleEvaluationError, isStaleChunkError, isStaleDeployError } from './stale-deploy';
import { isStaleActionError } from './stale-tab';

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
 * Server Component throws are NOT this hook's to file any more. They used to
 * be, and every one of them arrived as Next's fixed production sentence plus a
 * digest — forty-one rows' worth of «An error occurred in the Server Components
 * render» from one live exam, with the container logs that held the real
 * message long gone. `instrumentation.ts` now files them from the server, where
 * the message and the stack still exist, under the same fingerprint the
 * browser would have used (kind, pathname, digest). Filing the browser's copy
 * as well would only count every failure twice and race the real stack with a
 * generic one. This hook is for the other half — an error thrown while React
 * was rendering on the CLIENT, which carries no digest, never reaches a server,
 * and would otherwise be invisible.
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
     * Tabs older than the deploy they are talking to (missing server action ids,
     * old chunk hashes that 404 after deploy, or outdated module graphs) are deploy
     * artifacts, not application faults. Filing them costs more than it sounds: every
     * row on `/admin/errors` that describes a deploy is a row making real failures
     * harder to find. `use-error-retry` automatically recovers via document reload.
     *
     * Still logged to the console above, like everything else.
     */
    if (
      isStaleDeployError(error) ||
      isStaleChunkError(error) ||
      isModuleEvaluationError(error) ||
      // «An unexpected response was received from the server.» — a Server
      // Action answered by Traefik or Cloudflare instead of by this app, i.e.
      // the deploy window. `isStaleActionError` explains why it counts as one.
      // (`as unknown`: it is a type guard on `Error`, and narrowing on it
      // would leave `error` typed `never` below.)
      isStaleActionError(error as unknown) ||
      (typeof error.message === 'string' && error.message.includes('Failed to load chunk'))
    ) {
      return;
    }

    /*
     * The student's connection dropped — before the answer, or half-way through
     * its body (`TypeError: network error`, which is what `/results`, `/rank`
     * and a quiz review recorded). Not a fault, and not this boundary's to
     * explain: `use-error-retry.ts` brings the page back by itself once the
     * connection does. See `lib/connectivity-error.ts` for the exact sentences.
     */
    if (isConnectivityError(error)) {
      return;
    }

    /*
     * A digest means the throw happened in a SERVER render (Next generated it,
     * or `lib/api.ts` stamped one of its constants). `instrumentation.ts` has
     * already filed that from the server with the real message — see the
     * header. In production the copy here carries nothing but Next's generic
     * sentence.
     */
    if (error.digest) {
      return;
    }

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
        // Always `client` from here: every digest-bearing error was returned
        // above, and a digest is the only thing that ever made it anything else.
        kind: 'client',
        // The PATHNAME, never `href`. A query string on this platform can
        // carry a password-reset token or an `?assistant=1` deep link, and an
        // error log is the wrong place for either. The API re-checks this.
        route: window.location.pathname,
        message: error.message.slice(0, 1000),
        stack: error.stack?.slice(0, 4000),
      }),
    }).catch(() => {
      // The API is unreachable — which, given what this hook is called for, is
      // frequently the very thing being reported. Nothing to do and nothing to
      // say: the student is already looking at the failure screen.
    });
  }, [error]);
}
