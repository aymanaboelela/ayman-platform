/**
 * The site's own origin, in a module that imports nothing.
 *
 * ## Why this is its own file
 *
 * It lived in `jsonld.ts`, which was fine while nothing there needed anything
 * from `metadata.ts`. Gating the site DESCRIPTION for tenants put
 * `SITE_DESCRIPTION` in `metadata.ts` and a read of it in `jsonld.ts` — and
 * `metadata.ts` already read `SITE_URL` from `jsonld.ts`. That closes a cycle.
 *
 * A cycle between two modules is usually survivable. This one is not, because
 * both sides use their import at MODULE SCOPE rather than inside a function:
 * `metadata.ts` evaluates `metadataBase: new URL(SITE_URL)` while the other
 * half is still initialising, so `SITE_URL` is `undefined` and
 * `new URL(undefined)` throws before a single line of any page runs. Nine test
 * files stopped collecting — `proxy.test.ts`, the four `lib/agents/*`, both
 * route tests, `jsonld.test.ts` and a preset's — none of which touch SEO, all
 * of which import something that imports one of the two.
 *
 * The value is a leaf: one `process.env` read and a `.replace`. Keeping it
 * where both sides reach it without reaching THROUGH each other is what makes
 * the cycle impossible rather than merely absent today.
 *
 * ⚠️ `NEXT_PUBLIC_APP_URL` is inlined at BUILD time, so the origin is baked
 * into the image. That is already true of the whole web image — it is
 * per-instructor by construction — and it is why a container cannot be
 * re-pointed at another domain by changing the runtime environment.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3200').replace(
  /\/$/,
  '',
);
