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
 * ## ⚠️ IT DOES NOT CURRENTLY WORK IN THE BROWSER. MEASURE BEFORE YOU BELIEVE IT.
 *
 * Everything above is what this file is FOR. What it actually achieves on the
 * client, as of 2026-08-12, is nothing: the landing page still reports both
 * violations. Left undocumented this reads as a working guard, and the next
 * person to touch Zod will assume the client is jitless. It is not.
 *
 * The cause is not ordering. `z.config()` is never in the browser bundle at
 * all. Measured on the production build, `jitless:!0` appears **zero** times
 * across all 37 chunks the landing page loads — Turbopack sees a module whose
 * exports are all re-exports, forwards `import { z } from
 * '@ayman/contracts/zod'` straight through to `'zod'`, and never evaluates this
 * file. Adding `"./src/zod.ts"` to the package's `sideEffects` was tried and
 * did not change that.
 *
 * The ordering constraint below is real and is why the cheap fixes cannot work
 * either — Zod reads the flag and runs the probe when a schema is CONSTRUCTED,
 * not when one first parses:
 *
 *     const jit = !core.globalConfig.jitless;
 *     const fastEnabled = jit && allowsEval.value;   // probes right here
 *
 * Schemas are built at module scope, so they are constructed the moment their
 * chunk evaluates, and anything running during hydration is late by definition.
 * A `<ZodRuntimeConfig/>` at the root of the app layout was tried; so was an
 * `instrumentation-client.ts`, which Turbopack compiled and then never loaded
 * under this repo's `turbopack.root`; so was routing all 56 of `apps/web`'s
 * direct `'zod'` imports through here. Seven attempts, one symptom, and none of
 * them diagnosable by reading the source — the only honest check is to grep the
 * BUILT bundle for the call.
 *
 * What is left that would actually work is `pnpm patch zod`, making
 * `allowsEval` return false under a browser global. That was judged not worth
 * it: a permanent patch on a core dependency, re-applied on every Zod upgrade,
 * to remove two entries from a Report-Only policy that blocks nothing. If the
 * policy is ever switched to enforcing, revisit — the JIT dies there anyway, so
 * the only change is that the reports stop being cosmetic.
 *
 * Keeping the indirection: it costs nothing, it is where the fix belongs the
 * day Turbopack stops forwarding it or someone takes the patch route, and the
 * call is correct on its own terms.
 *
 * ## ⚠️ Browser only, and that is the point
 *
 * `jitless` is a module-level global on Zod, and the API shares this package.
 * Nothing blocks `new Function` in the Node runtime, where the JIT is a
 * straight speed-up on every request that validates a body — so the guard is
 * what keeps the server on the compiled path. Do not lift the call out of it.
 *
 * ## Why `package.json`'s `sideEffects` lists this file
 *
 * `sideEffects` was added to this package so bundlers may drop the modules a
 * `'use client'` file does not actually reach. The honest value is not `false`:
 * the `z.config()` call below runs on IMPORT, which is precisely the thing
 * `sideEffects: false` promises does not happen. Every other module under
 * `src/` is declarations only — verified, not assumed — so the array holds the
 * stylesheet glob and `"./src/zod.ts"`, and stops there.
 *
 * ⚠️ That entry is about the DECLARATION being truthful, not about making the
 * guard fire. The section above records that it was tried for that purpose and
 * changed nothing, because Turbopack forwards this module's re-export straight
 * through to `'zod'` and never evaluates the file at all. Do not read the entry
 * as protection; read it as the accurate answer to "does importing this module
 * run code?", which a bundler is entitled to rely on.
 *
 * New schema files in this package must import `z` from here too; importing
 * `'zod'` directly still compiles and still works, it just re-opens the hole
 * for whatever that file constructs.
 */
/*
  ⚠️ IMPORT THIS AS `@ayman/contracts/zod`, NEVER AS `./zod` OR `../zod`.

  This package is `"type": "module"`, and apps/api consumes its SUBPATHS as
  TypeScript SOURCE at runtime — `@ayman/contracts/admin/media` resolves through
  the exports map straight to `src/admin/media.ts`, which Node then type-strips
  and executes. Under Node's ESM resolver a relative specifier must name a real
  file, so `from './zod'` throws ERR_MODULE_NOT_FOUND the moment the API boots.

  It is a nasty failure because nothing local catches it: `tsc` resolves it,
  vitest resolves it, `next build` resolves it, and all 1725 tests pass. The
  first thing that fails is `node dist/main`, in CI, on the Playwright job —
  which is exactly how it was found (every shard red, "Process from
  config.webServer was not able to start").

  The extensionless relative imports in `index.ts` survive only because the API
  never loads that barrel at RUNTIME — it imports the root for types, which are
  erased. Anything reachable from a subpath has no such cover.

  `@ayman/contracts/zod` is a self-reference through this package's own exports
  map, the same mechanism `@ayman/contracts/copy` already uses, and it resolves
  identically under Node, Turbopack and vitest.
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

/*
  ⚠️ NOTHING ELSE MAY BE EXPORTED FROM THIS FILE. `zod-exports-only-z.spec.ts`
  enforces it, and this is the measurement behind that test.

  `z` is a re-export, and Turbopack forwards it straight through to the `zod`
  package — so this module's compiled export table in the client bundle is
  `e.s([])`, empty, on every build. Its module id is derived from the FILE
  PATH, which means the same number identifies it in every build forever.

  Turbopack's client runtime keeps the FIRST factory registered for a module id
  and silently discards every later one. So a browser holding any chunk from
  the previous deploy has this id pinned to the export-less factory, and a
  chunk from the NEW deploy that imports a NEW export from here is handed that
  module's sealed, empty exports object instead.

  `partialWithoutDefaults` was added here on 2026-08-18 and did exactly that:
  the admin course page died at 03:26 with `(0 , t.partialWithoutDefaults) is
  not a function`, thrown at module evaluation of `content.ts`. Reproduced in a
  browser against a build of the deployed commit by registering the previous
  build's factory for this id first — same message, same runtime frames. It
  lives in `./partial.ts` now: a NEW path is a NEW id, and no client can
  already hold one of those.
*/
