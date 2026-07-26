import { ProfileMeSchema } from '@ayman/contracts';
import { apiGet } from './api';

/**
 * Where to send a user immediately after LOGIN establishes a session,
 * based on whether onboarding is already complete. This is a client-side
 * courtesy redirect scoped to the auth forms themselves — Task 8's
 * `proxy.ts` is the real enforcement layer for every other protected route,
 * running on every request rather than once right after this one action.
 *
 * `apiGet` sends the request with default fetch credentials
 * ("same-origin"), so the session cookie the sign-in response just set is
 * included automatically.
 */
export async function resolvePostLoginDestination(): Promise<string> {
  try {
    const me = await apiGet('/api/profile/me', ProfileMeSchema);
    return me.onboardingCompleted ? '/' : '/onboarding';
  } catch {
    // If the check itself fails for any reason, fail toward onboarding
    // rather than silently landing on a page that assumes it's done.
    return '/onboarding';
  }
}
