/**
 * Where the JavaScript playground's worker lives, and the policy it runs under.
 *
 * ## Why these two constants share a module
 *
 * The whole fix depends on the worker being started from the exact path that
 * carries the policy. `proxy.ts` matches a pathname to decide which response
 * gets `JS_RUNNER_CSP`; `run-code.ts` passes a URL to `new Worker`. If those
 * two strings ever drift, the worker loads from a path the proxy does not
 * recognise, inherits the DOCUMENT's `script-src` — which has no
 * `'unsafe-eval'` — and the playground is broken again, silently, in
 * production only. One constant, imported by both, is what removes that.
 *
 * ## Why it is not simply exported from `proxy.ts`
 *
 * `run-code.ts` is `'use client'`. Importing from `proxy.ts` would pull
 * `next/server` and `node:crypto` into the browser bundle for the sake of one
 * string. This module has no imports at all and is safe on both sides.
 */

/** Served from `public/js-runner.js`. */
export const JS_RUNNER_PATH = '/js-runner.js';

/**
 * The narrowest policy that lets a playground be a playground.
 *
 * `'unsafe-eval'` is granted here and NOWHERE else in the product — the pages
 * themselves get `'wasm-unsafe-eval'`, which permits Pyodide's WebAssembly and
 * nothing else (see `buildPublicCsp`).
 *
 * Everything else is `'none'` rather than left to `default-src 'self'`. This
 * thread has no legitimate need to fetch, connect, import a script or spawn a
 * nested worker, and denying it in the POLICY is categorically stronger than
 * denying it in the code: `public/js-runner.js` deletes `fetch`,
 * `XMLHttpRequest`, `importScripts`, `WebSocket` and `EventSource` at startup,
 * but that is a property of a script a clever snippet might find its way
 * around, while this is a property of the browser it cannot.
 */
export const JS_RUNNER_CSP = ["default-src 'none'", "script-src 'unsafe-eval'"].join('; ');
