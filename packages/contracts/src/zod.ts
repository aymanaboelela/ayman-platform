/**
 * The ONE place this package imports Zod from. Every schema module here pulls
 * `z` through this file rather than from `'zod'` directly, and that indirection
 * is load-bearing rather than stylistic.
 *
 * ## What it fixes
 *
 * Zod 4 compiles its validators into real functions with `new Function` and
 * runs those instead of walking the schema. The web app's `script-src` is
 * `'self' 'unsafe-inline' 'wasm-unsafe-eval'` (see `apps/web/proxy.ts`), where
 * the narrow `wasm-` keyword is deliberate: WebAssembly compiles, `eval` and
 * `new Function` do not. So on every page load the browser reported two
 * `script-src` violations — one from Zod's `try { new Function("") }` probe in
 * `allowsEval`, one from `Doc.compile()` — and they were the only two entries
 * in the Issues panel, sitting on top of a Report-Only policy whose whole job
 * is to make real breakage visible. A report that is permanently two lines of
 * known noise is a report nobody reads, which is the exact failure the
 * report-only soak exists to prevent. Under the enforcing policy that soak is
 * heading towards, the JIT is blocked outright and Zod falls back to the
 * interpreted path anyway — so turning it off costs the client nothing it was
 * going to keep.
 *
 * ## ⚠️ Why this is a MODULE and not a call in the app
 *
 * Zod reads the flag and runs the probe when a schema is CONSTRUCTED, not when
 * one first parses:
 *
 *     const jit = !core.globalConfig.jitless;
 *     const fastEnabled = jit && allowsEval.value;   // probes right here
 *
 * Schemas in this package are built at module scope, so they are constructed
 * the moment their chunk evaluates. Anything that runs during hydration is too
 * late by definition — a `<ZodRuntimeConfig/>` mounted at the root of the app
 * layout was tried first and the violations survived it untouched, and so did
 * an `instrumentation-client.ts`, which Turbopack compiled but never loaded on
 * the page under this repo's `turbopack.root`. ES module evaluation order is
 * the only guarantee that actually holds: a module's dependencies are evaluated
 * before its own body, so importing `z` from here means the config below has
 * already run by the time the first `z.object()` in the importing file is
 * reached. There is no ordering left to get wrong.
 *
 * ## ⚠️ Browser only, and that is the point
 *
 * `jitless` is a module-level global on Zod, and the API shares this package.
 * Nothing blocks `new Function` in the Node runtime, where the JIT is a
 * straight speed-up on every request that validates a body — so the guard is
 * what keeps the server on the compiled path. Do not lift the call out of it.
 *
 * New schema files in this package must import `z` from here too; importing
 * `'zod'` directly still compiles and still works, it just re-opens the hole
 * for whatever that file constructs.
 */
import { z } from "zod";

/*
  `'window' in globalThis`, not `typeof window !== 'undefined'`.

  This package is consumed by apps/api (Node) as well as apps/web, so its
  tsconfig pulls no DOM lib — and with no DOM lib `window` is not a declared
  name, which makes the bare `typeof window` guard a compile ERROR here
  (TS2304) rather than the safe idiom it is inside the web app. `globalThis`
  is in the ES2020 lib the base config already provides, and the `in` test
  asks the same runtime question without naming an undeclared global.

  Identical behaviour: true in a browser, false under Node and in the Next
  server runtime — which is the whole point of the guard, since the JIT is a
  straight win on the server and only the browser's CSP objects to it.
*/
if ("window" in globalThis) {
  z.config({ jitless: true });
}

export { z };
