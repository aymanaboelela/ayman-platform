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
 * `sw.js` calls `clients.claim()`, and a new worker waits — as the browser
 * makes it — until the tabs running the old one are gone. Nothing personal is
 * ever cached, so neither the takeover nor the wait can show one student
 * another's data; see the header of `sw.js` for why the wait is now load-bearing
 * rather than merely tidy. Do not add HTML caching without also adding an
 * update flow the student controls.
 *
 * ## Why the URL below carries a version
 *
 * It used to carry none, and the comment here said why: registering
 * `/sw.js?v=<build id>` is the usual way to make every deploy look like a new
 * worker — which is what gives `activate` a chance to purge the previous
 * deploy's cached chunks — and there was no per-deploy token in this app's
 * client bundle to put in the query. Three dead ends were written out next to
 * `VERSION` in `sw.js`: `NEXT_DEPLOYMENT_ID` compiles to the literal `false`
 * with no `deploymentId` configured, the App Router build id never reaches
 * client code, and `apps/web/Dockerfile` forwarded only `NEXT_PUBLIC_*` build
 * args that do not change when the code does.
 *
 * The third one is no longer true, which settles the other two: the Dockerfile
 * now computes a token in the same layer that runs `next build` and passes it
 * as `NEXT_PUBLIC_BUILD_ID`, so it is an ordinary inlined string here. The same
 * value feeds `deploymentId` in `next.config.ts`.
 *
 * ⚠️ The fallback matters as much as the value. In `next dev`, and in any build
 * that does not go through the Dockerfile, the variable is absent — the
 * registration then has no query at all, which is byte-for-byte the URL every
 * already-installed worker was registered with. Emitting `?v=undefined` would
 * make a local build look like a new deploy to a real device.
 */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;
const SW_URL = BUILD_ID ? `/sw.js?v=${encodeURIComponent(BUILD_ID)}` : '/sw.js';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register(SW_URL).catch(() => {
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
