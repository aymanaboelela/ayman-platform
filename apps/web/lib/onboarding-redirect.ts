import { ProfileMeSchema } from '@ayman/contracts';
import { apiGet } from './api';
import { safeNext, withNext } from './safe-next';

/**
 * Where to send a user immediately after LOGIN establishes a session, based on
 * whether onboarding is already complete and on where they were originally
 * headed. This is a client-side courtesy redirect scoped to the auth forms
 * themselves — Task 8's `proxy.ts` is the real enforcement layer for every
 * other protected route, running on every request rather than once right after
 * this one action.
 *
 * `next` is the path the gate interrupted (`proxy.ts` sets `?next=` when it
 * bounces an anonymous visitor; the course page's start button sets it when its
 * enroll POST comes back 401). Re-validated here with `safeNext` even though
 * every caller already did: this function turns its argument into a navigation,
 * so it owns that check rather than trusting it was done upstream.
 *
 * Onboarding always wins over `next` — an incomplete profile cannot be skipped
 * by deep-linking — but `next` rides along on the query string so
 * `OnboardingForm` can honour it the moment the profile is saved. That ordering
 * mirrors `decideRedirect`'s own precedence, and the two must not disagree.
 *
 * `apiGet` sends the request with default fetch credentials ("same-origin"), so
 * the session cookie the sign-in response just set is included automatically.
 */
export async function resolvePostLoginDestination(next?: string | null): Promise<string> {
  const safe = safeNext(next);

  try {
    const me = await apiGet('/api/profile/me', ProfileMeSchema);
    if (!me.onboardingCompleted) return withNext('/onboarding', safe);
    return safe ?? '/dashboard';
  } catch {
    // If the check itself fails for any reason, fail toward onboarding rather
    // than silently landing on a page that assumes it's done.
    return withNext('/onboarding', safe);
  }
}
