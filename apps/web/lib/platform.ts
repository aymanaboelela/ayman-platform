/**
 * Detects whether the current client is an Apple platform (iPhone, iPad, or
 * macOS) — the sole gate for whether the "Sign in with Apple" button
 * renders. Google renders everywhere; Apple is conditional on this check.
 *
 * A pure string-in/boolean-out function on purpose: it takes a
 * User-Agent value as an argument rather than reading `navigator` itself, so
 * it is trivially unit-testable with plain strings and needs no DOM/jsdom
 * environment. The React-facing wrapper that actually reads
 * `navigator.userAgent` and handles the SSR/hydration boundary lives
 * alongside the component that needs it (`components/auth/apple-button.tsx`)
 * — this module only owns the UA-parsing decision.
 *
 * Modern iPadOS (13+) reports its User-Agent identically to macOS Safari —
 * `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...` with NO "iPad"
 * substring anywhere, by Apple's own design (their default
 * "Request Desktop Website" behaviour on iPad). A check that only looks for
 * literal "iPad" would silently misclassify every modern iPad as non-Apple.
 * That's fine to miss here in the sense that this helper's job is only
 * "is this an Apple device" — real macOS and an iPad-in-desktop-mode both
 * legitimately answer "yes", so the same "Macintosh" branch correctly
 * covers both without needing to tell them apart.
 *
 * Also deliberately BROWSER-agnostic, not just OS-agnostic within "Apple":
 * macOS Chrome's UA also contains "Macintosh" (browsers don't rewrite the OS
 * token), so it classifies as an Apple platform exactly like macOS Safari —
 * the button is about the underlying device, not which browser is open.
 */
const APPLE_UA_PATTERN = /iPhone|iPad|iPod|Macintosh/;

export function isApplePlatform(userAgent: string | undefined | null): boolean {
  if (!userAgent) return false;
  return APPLE_UA_PATTERN.test(userAgent);
}
