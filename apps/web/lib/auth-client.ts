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
}

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

  constructor(status: number, body: AuthErrorBody) {
    super(body.message ?? `auth request failed with ${status}`);
    this.status = status;
    this.code = body.code;
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
  email: string;
  name: string;
}

export function signUpWithEmail(input: {
  name: string;
  email: string;
  password: string;
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
): Promise<{ url?: string; redirect: boolean }> {
  return post('/api/auth/sign-in/social', { provider, callbackURL });
}
