/**
 * Which stack this API IS — the server-side half of `apps/web/lib/tenant.ts`.
 *
 * ## Why the API needs its own copy
 *
 * `TENANT_KEY` was already read in `scripts/seed-data/tenant-contact.ts`, and
 * that covered the settings row. What it did not cover is every OTHER place
 * the API puts a name into something a student reads — and running a second
 * instructor's stack for real turned up two that matter far more than a page
 * title, because neither is on a page anyone proof-reads:
 *
 *   · the assistant's written answers, which tell a student who teaches this
 *     subject and who the «أكلّم» button reaches;
 *   · the WhatsApp test message, which signs itself with a platform name and
 *     goes out from the tenant's own number.
 *
 * The web's module cannot be imported here — it is `@/lib/*` inside the Next
 * app and reads `process.env` under Next's build-time inlining. The rule is
 * the same, stated twice, rather than a package existing to hold six lines.
 *
 * ## Fail closed
 *
 * `IS_AYMAN` is true only for the literal key `ayman` or no key at all. A
 * typo, an empty string, a half-written compose file — all inherit NOTHING. A
 * stack that forgets a variable says «المنصة»; the opposite default puts a
 * stranger's name in an answer a student acts on.
 */
export const TENANT_KEY = (process.env.TENANT_KEY ?? '').trim() || 'ayman';

/** True only on Ayman's own stack. */
export const IS_AYMAN = TENANT_KEY === 'ayman';

const TENANT_DISPLAY_NAME = (process.env.TENANT_DISPLAY_NAME ?? '').trim();

/**
 * The name to print: his, on his stack; the deployment's own, anywhere else.
 *
 * `fallback` is passed in rather than imported so this file stays free of
 * `@ayman/contracts` — the copy table is a web-and-API shared dependency and
 * this module is read from scripts that must boot without it.
 *
 * A non-Ayman stack with no `TENANT_DISPLAY_NAME` gets `'المنصة'`. Generic is
 * a bug report someone files; his name on a stranger's platform is not.
 */
export function tenantName(fallback: string): string {
  if (IS_AYMAN) return fallback;
  return TENANT_DISPLAY_NAME || 'المنصة';
}
