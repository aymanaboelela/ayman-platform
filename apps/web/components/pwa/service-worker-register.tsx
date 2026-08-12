'use client';

import { useEffect } from 'react';

/**
 * Registers `public/sw.js`, which is what turns a complete manifest into an
 * installable app — Chrome requires a service worker with a fetch handler
 * before it will offer "install", and `app/manifest.ts` has been carrying a
 * comment saying exactly that.
 *
 * Renders nothing. It is a `useEffect` in an empty component rather than an
 * inline `<script>` because the Report-Only CSP in `proxy.ts` runs a nonce
 * policy, and an inline script would either need threading a nonce down to
 * here or would quietly become the first violation of the policy nobody
 * notices — the exact failure mode `report-only-csp-hides-breakage` describes.
 *
 * ## Why `load` and not straight away
 *
 * Registering during hydration puts the worker's own install — which fetches
 * and precaches the offline page — in competition with the page the student is
 * waiting for. On a phone on 3G that is the difference between a fast first
 * paint and a stalled one. `load` has already fired for a returning visitor,
 * so the branch below is not an optimisation for them; it is only for the
 * first paint.
 *
 * ## Why no update prompt
 *
 * `sw.js` calls `skipWaiting()` and `clients.claim()`, so a new worker takes
 * over on its own. That is safe here ONLY because nothing personal is ever
 * cached — see the header of `sw.js`. Do not add HTML caching without also
 * adding an update flow the student controls.
 *
 * ## Why the URL below carries no version
 *
 * Registering `/sw.js?v=<build id>` is the usual way to make every deploy look
 * like a new worker, so that the worker's `activate` handler gets a chance to
 * purge the previous deploy's cached chunks. It is not done here because there
 * is no per-deploy token in this app's client bundle to put in that query — the
 * three dead ends (`NEXT_DEPLOYMENT_ID`, the App Router build id, the
 * Dockerfile's build args) are written out next to `VERSION` in `sw.js`, along
 * with what the worker does about it instead. Read that before adding one.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // A failed registration costs the install prompt and nothing else —
        // every page still works, because the worker never handled anything
        // the app depends on. Not worth a toast at the student.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
