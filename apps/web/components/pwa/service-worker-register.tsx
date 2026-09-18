'use client';

import { useEffect } from 'react';
import { aymanOnly } from '@/lib/tenant';

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
 * as `NEXT_PUBLIC_BUILD_ID`, so it is an ordinary inlined string here — no
 * `deploymentId`, no internal import.
 *
 * ⚠️ And it must stay that way round. Setting `deploymentId` to the same value
 * makes Next stamp `?dpl=` on every asset URL, which costs a returning student
 * the whole JS payload after every deploy for no correctness at all;
 * `next.config.ts` has the measurement and the argument.
 *
 * ⚠️ The fallback matters as much as the value. In `next dev`, and in any build
 * that does not go through the Dockerfile, the variable is absent — the
 * registration then has no query at all, which is byte-for-byte the URL every
 * already-installed worker was registered with. Emitting `?v=undefined` would
 * make a local build look like a new deploy to a real device.
 */
/**
 * ## Why the URL also carries the brand mark
 *
 * `public/sw.js` drew `/icons/icon-192.png` on every push notification and
 * precached it for the offline page. That PNG is not a logo — it is a crop of
 * Ayman's photograph, cut from `public/team/ayman.jpg` by
 * `scripts/build-mobile-icons.mjs`. `app/manifest.ts` gates the whole `icons`
 * array behind `IS_AYMAN` and `app/offline/page.tsx` gates its `<img>`, both
 * with notes explaining that no generic tile can be substituted; the service
 * worker, which is the one surface that draws it on a LOCK SCREEN with nothing
 * open, was gated nowhere. `layout.tsx` mounts this component on every route of
 * every deployment, so a tenant's students got his face over a line signed with
 * their own teacher's name.
 *
 * The worker cannot gate itself. Nothing rewrites a file in `public/` — the
 * build is `node scripts/vendor-pyodide.mjs && next build`, and neither step
 * touches it — so it has no `process.env`, no bundler and no way to import
 * `@/lib/tenant`. Its only channel is its own script URL, which is already how
 * `?v=` reaches it, and `self.location` is how it reads that back.
 *
 * So the decision is made HERE, where `aymanOnly()` can be imported and where
 * `TENANT_KEY` is a real value even in client code (`next.config.ts` lists it
 * under `env:`, which inlines it into the browser bundle). The worker receives
 * a path or receives nothing, and shows no mark when it receives nothing.
 *
 * The PATH rather than a tenant flag, deliberately: a flag would mean deciding
 * `IS_AYMAN` a second time inside a file that cannot see the gate, and a tenant
 * that one day uploads its own mark then needs no change to `sw.js` at all —
 * only a different string on this line.
 */
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;
const MARK = aymanOnly('/icons/icon-192.png');

/*
 * Built as a query list so a missing BUILD_ID still leaves a well-formed URL.
 *
 * ⚠️ Both parameters are part of the worker's IDENTITY: a browser installs a
 * new worker when the script URL or its bytes change. That is exactly what is
 * wanted on the deploy that ships this — every device re-registers and picks up
 * the gate — but it also means neither value may be made conditional on
 * anything that flickers between renders, or a student's device would churn a
 * new worker on every visit.
 *
 * The no-parameter case is still emitted as a bare `/sw.js`, because that is
 * byte-for-byte the URL every already-installed worker on a pre-`?v=` device
 * was registered with; `?v=undefined` would make a local build look like a new
 * deploy to a real phone.
 */
const SW_PARAMS = [
  ...(BUILD_ID ? [`v=${encodeURIComponent(BUILD_ID)}`] : []),
  ...(MARK ? [`mark=${encodeURIComponent(MARK)}`] : []),
];
const SW_URL = SW_PARAMS.length > 0 ? `/sw.js?${SW_PARAMS.join('&')}` : '/sw.js';

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
