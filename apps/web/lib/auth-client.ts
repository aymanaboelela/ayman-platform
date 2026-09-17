/**
 * Thin, hand-rolled wrapper around Better Auth's REST routes, mirroring
 * `lib/api.ts`'s own minimalism rather than adding the `better-auth` client
 * SDK as a new apps/web dependency for what is, from the browser's side,
 * three plain JSON POSTs.
 *
 * Every path is a same-origin `/api/auth/...` request. `next.config.ts`'s
 * rewrite forwards it to the API origin server-side — the browser itself
 * never sees `localhost:3300` (Global Constraint #1). This is also why
 * `Set-Cookie` from a successful sign-in/sign-up lands as a normal
 * same-origin cookie: from the browser's point of view it never left
 * `localhost:3200`.
 */

interface AuthErrorBody {
  code?: string;
  message?: string;
  /** Only ever set alongside `code: 'ACCOUNT_BANNED'` — see `BANNED_ACCOUNT_CODE`. */
  reason?: string;
}

/**
 * The one error code the login UI is allowed to branch on, and the reasoning
 * for the exception belongs next to it.
 *
 * `login-security.hook.ts` on the API returns this ONLY after the submitted
 * password has verified. So by the time a browser can see it, the person at
 * the keyboard has already proved they hold the account's credentials, and
 * telling them their account is suspended reveals nothing they could not
 * establish anyway. Every other failure mode — unknown email, wrong password,
 * soft-locked account — is still byte-identical (S1) and still renders the
 * same generic string.
 *
 * Do not reuse this code for anything that can be triggered without a correct
 * password; that would turn it back into the account-enumeration oracle the
 * rest of this flow exists to prevent.
 */
export const BANNED_ACCOUNT_CODE = 'ACCOUNT_BANNED';

/**
 * «الرقم ده ليه حساب بالفعل» — returned by `/sign-up/email` only.
 *
 * Kept beside `BANNED_ACCOUNT_CODE` because the two are the only codes this
 * client inspects, and both are documented exceptions to "never distinguish a
 * failure in the UI". The rule exists to stop the LOGIN form leaking whether an
 * account exists; a sign-up form answers that by refusing, whatever it prints,
 * so vagueness there only hides the reason from the student who needs it. See
 * `PHONE_TAKEN_ERROR` in the API's `login-security.hook.ts`.
 */
export const PHONE_TAKEN_CODE = 'PHONE_ALREADY_REGISTERED';

/**
 * Carries the raw status/code for logging or future branching, but callers
 * in this codebase must NOT surface `.message` to the user — it can be a
 * library-specific string. The one exception, `sign-in/email`, is already
 * generic by construction: Task 3's `login-security.hook.ts` intercepts
 * every failure mode (unknown email, wrong password, locked account) and
 * responds with the identical `{ code: 'INVALID_CREDENTIALS', message:
 * 'Invalid email or password' }` body before Better Auth's own handler ever
 * runs — but the UI still renders its own copy-sourced generic string rather
 * than this one, so the message a user sees is never coupled to whatever
 * literal the API happens to send.
 */
export class AuthRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  /**
   * The admin's stated ban reason, when `code === BANNED_ACCOUNT_CODE`.
   *
   * Carried separately from `message` precisely because the rule above still
   * holds for `message` — that one is a library string and stays unrendered.
   * This field is operator-authored Arabic written to be read by the student,
   * and it is the whole point of showing them anything at all.
   */
  readonly reason?: string;

  constructor(status: number, body: AuthErrorBody) {
    super(body.message ?? `auth request failed with ${status}`);
    this.status = status;
    this.code = body.code;
    this.reason = body.reason;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    // Same-origin fetch already sends cookies by default in every current
    // browser, but this is stated explicitly rather than relied on
    // implicitly — the whole point of this file is that auth depends on
    // that cookie.
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AuthRequestError(response.status, (payload ?? {}) as AuthErrorBody);
  }

  return payload as T;
}

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
  phoneNumber?: string | null;
}

/**
 * Creates the account. Phone-first, but still posted to `/sign-up/email` — and
 * that is not a leftover.
 *
 * Better Auth's phone-number plugin exposes no `/sign-up/phone-number` at all.
 * Its only account-creating path is `/phone-number/verify` with
 * `signUpOnVerification`, which cannot be reached without a valid OTP and
 * creates a user with no password. Since this platform has no way to deliver a
 * code yet (see `auth.config.ts`'s `sendOTP`), registration goes through the
 * email route carrying `phoneNumber` as an extra field — Better Auth's
 * `parseUserInput` merges plugin schema fields, and `phoneNumber` does not set
 * `input: false`, so it is written to the user row.
 *
 * `email` is optional here in the same sense it is optional to the student:
 * when they leave it blank, the caller substitutes a placeholder derived from
 * the phone, because the column cannot be null.
 */
export function signUpWithPhone(input: {
  name: string;
  /**
   * Omitted when the student gave none. The column is genuinely nullable; the
   * throwaway address Better Auth's route validator insists on is minted and
   * stripped entirely server-side, so nothing in the browser ever handles a
   * fake address.
   */
  email?: string;
  password: string;
  phoneNumber: string;
}): Promise<{ token: string; user: AuthUser }> {
  return post('/api/auth/sign-up/email', input);
}

export function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<{ token: string; user: AuthUser }> {
  return post('/api/auth/sign-in/email', input);
}

/**
 * The phone half of the one «رقم الموبايل أو الإيميل» field.
 *
 * `phoneNumber` must already be E.164 — `resolveLoginIdentifier` normalises it
 * before this is called. The server re-normalises anyway
 * (`createAuthBeforeHook`), because the client is not the guarantee, but
 * sending the raw string would be relying on that fallback rather than on the
 * contract.
 */
export function signInWithPhone(input: {
  phoneNumber: string;
  password: string;
}): Promise<{ token: string; user: AuthUser }> {
  return post('/api/auth/sign-in/phone-number', input);
}

/**
 * Ends the session server-side. Better Auth clears its own cookie on the
 * response, so there is nothing to delete here — and nothing this module
 * COULD delete anyway: the session cookie is `HttpOnly`, so `document.cookie`
 * cannot see or remove it. A client-side "log out" that only navigates away
 * leaves a fully valid session behind on a shared machine, which is the whole
 * reason this is a real request rather than a `router.push('/')`.
 *
 * The caller must then perform a FULL page navigation (`window.location`), not
 * a client-side route change: every authenticated Server Component render is
 * cached per-session in the router cache, and a soft navigation would keep
 * serving the previous user's dashboard until that cache expired.
 */
export function signOut(): Promise<unknown> {
  return post('/api/auth/sign-out', {});
}

/** Google is the only provider the UI offers. Apple's API-side wiring still
 * exists in `auth.config.ts` but is inert (it registers only when the four
 * `APPLE_*` env vars are set), so widening this union is all it would take to
 * bring the button back. */
export type SocialProvider = 'google';

/**
 * Returns the provider's authorize URL rather than redirecting itself —
 * `/sign-in/social` is a fetch, not a full navigation, so Better Auth hands
 * back `{ url, redirect }` and the caller performs `window.location.href =
 * url` (see `components/auth/auth-providers.tsx`).
 *
 * The full round-trip only works once `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
 * are set on the API and the matching redirect URI is registered in the Google
 * Cloud console — see `docs/runbooks/google-sign-in.md`. Without them Better
 * Auth never registers the provider and this request 400s.
 */
export function signInWithSocial(
  provider: SocialProvider,
  callbackURL: string,
  /**
   * Where Better Auth sends the visitor when the round trip FAILS.
   *
   * ⚠️ Not optional in practice, and omitting it is why Google sign-in was a
   * dead end. Better Auth resolves the error destination as
   * `state.errorURL ?? options.onAPIError?.errorURL ?? `${baseURL}/error``
   * (`api/routes/callback.mjs:32,55`). With nothing set here, that last
   * fallback wins — and `baseURL` is the API's, so a refused sign-in landed
   * the student on `/api/auth/error?error=account_not_linked`: the library's
   * own bare English page, on an API path, with no nav, no Arabic and no way
   * back to the form they started from.
   *
   * The failure arrives as a REDIRECT from Google, long after
   * `handleGoogleClick` has navigated away, so no `catch` in this app can ever
   * see it. A destination we control is the only mechanism available.
   */
  errorCallbackURL: string,
): Promise<{ url?: string; redirect: boolean }> {
  return post('/api/auth/sign-in/social', { provider, callbackURL, errorCallbackURL });
}
