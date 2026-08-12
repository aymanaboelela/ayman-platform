'use client';

import { useEffect } from 'react';

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
 * ## ⚠️ There is no client error reporting in this repo
 *
 * Checked when this was written: no Sentry, no PostHog, no Bugsnag, no
 * Rollbar, no Datadog RUM in any `package.json`; no `apps/web/instrumentation.ts`
 * and therefore no `onRequestError` hook; no `window.onerror` or
 * `reportError()` anywhere in `apps/web`. `console.error` is the entire sink,
 * and it is only ever read if someone happens to have the device in their
 * hand with devtools open.
 *
 * That is stated rather than quietly worked around because it is a real gap
 * and this is where it is felt. When a reporter is added, it goes HERE — one
 * call in one file, and all five boundaries start reporting — rather than
 * being pasted into each of them.
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
  }, [error]);
}
