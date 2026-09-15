/**
 * Which stack this build IS — the one switch every piece of Ayman's personal
 * identity hangs off.
 *
 * ## Why a module and not a dozen `process.env` reads
 *
 * `TENANT_KEY` was already being read in three places by the time the second
 * instructor's stack was first booted locally (`lib/tenant-contact.ts:47`,
 * `lib/home-blocks.ts:190`, the API's `seed-data/tenant-contact.ts`), and each
 * one closed its own leak. What that pattern could not do is close the leaks
 * nobody had thought to look for — and running a non-`ayman` stack for real
 * found four in the first screenful: his photograph in the hero, the dragon
 * behind it, his name in the nav, and his face as the favicon.
 *
 * So the rule is stated once, here, and imported. A new asset, a new
 * hardcoded name or a new personal image then has ONE obvious thing to ask.
 *
 * ## Fail closed
 *
 * `IS_AYMAN` is true only for the literal key `ayman` or no key at all. Every
 * other value — a typo, an empty string, a half-written compose file —
 * inherits NOTHING. A stack that forgets a variable renders a page missing a
 * photograph; the opposite default renders a stranger's face on somebody
 * else's domain, and that is the failure that cannot be taken back.
 *
 * ## Build time, not request time
 *
 * Read at module load, because that is when `next build` prerenders. The web
 * image is already per-instructor (`NEXT_PUBLIC_APP_URL` is inlined into it),
 * so this costs nothing that was not already true — see the long note in
 * `lib/tenant-contact.ts` for why the prerender is the thing that matters.
 */
export const TENANT_KEY = (process.env.TENANT_KEY ?? '').trim() || 'ayman';

/** True only on Ayman's own stack. Anything else inherits none of his identity. */
export const IS_AYMAN = TENANT_KEY === 'ayman';

/**
 * The instructor's name, for a stack that is not his.
 *
 * Empty on Ayman's stack ON PURPOSE: his name lives in `copy/ar.ts` with all
 * the surrounding copy that is written around it, and a second source for it
 * would be a second thing to keep in step. Call `tenantName(fallback)` rather
 * than reading this.
 */
const TENANT_DISPLAY_NAME = (process.env.TENANT_DISPLAY_NAME ?? '').trim();

/**
 * The name to print: his, on his stack; the deployment's own, anywhere else.
 *
 * `fallback` is whatever the copy table says — passed in rather than imported
 * so this module stays free of `@ayman/contracts` and can be read from the
 * edge, from `metadata`, and from a client component alike.
 *
 * A non-Ayman stack that has not set `TENANT_DISPLAY_NAME` gets `'المنصة'`,
 * not his name. Generic is a bug report; his name on a stranger's domain is
 * not.
 */
export function tenantName(fallback: string): string {
  if (IS_AYMAN) return fallback;
  return TENANT_DISPLAY_NAME || 'المنصة';
}

/**
 * Gate a value that is personally Ayman's — a photograph of him, a video with
 * his likeness in it, a credential from his CV.
 *
 * Returns the value on his stack and `undefined` everywhere else, so the call
 * site's existing "no asset" branch does the work. Every consumer of
 * `getBrandAsset` already had one of those, which is why gating there was a
 * one-line change rather than a rewrite.
 */
export function aymanOnly<T>(value: T): T | undefined {
  return IS_AYMAN ? value : undefined;
}
