import { cache } from 'react';
import { headers } from 'next/headers';
import { z } from 'zod';
import { bound, resolve } from './api';

const SessionSchema = z.object({
  id: z.string(),
  /**
   * `.nullable()` since the phone became the account's identity — an email is
   * now genuinely optional, and the API sends `null` both when the student
   * skipped it and when the stored value is the synthesised
   * `…@phone.invalid` placeholder (`SessionController` nulls that out so it
   * can never reach a screen).
   *
   * Every consumer therefore has to have an answer for "no email". That is the
   * point of nulling it at the API rather than filtering at each render site:
   * this line is what makes the compiler ask them.
   */
  email: z.string().nullable(),
  /** E.164. Null only for an account that has not given one yet — see `proxy.ts`. */
  phoneNumber: z.string().nullable(),
  /** Set by the identity provider on a social sign-up, by the form otherwise. */
  name: z.string(),
  /**
   * `.nullable()`, not `.optional()`: the API always sends the key and sends
   * an explicit `null` when there is no avatar (email/password accounts, and
   * Google accounts with no profile photo). Treating "absent" and "null" as
   * one state here would hide an API contract change instead of failing on it.
   */
  image: z.string().nullable(),
  role: z.string(),
  permissions: z.array(z.string()),
});

export type SessionUser = z.infer<typeof SessionSchema>;

/**
 * Reads the caller's session from the API, forwarding the incoming cookie.
 * Server Components only — `headers()` makes the caller dynamic, which is
 * correct here: no admin page may ever be prerendered or cached.
 *
 * The API host is NOT named here: `resolve()` from `./api` is the single
 * place it may appear (single-origin constraint 1).
 *
 * Returns null on 401 so callers can redirect; any other failure throws,
 * because "the API is down" must not render as "you are logged out".
 *
 * Wrapped in React's `cache()`, so every call within a single request render
 * shares ONE round-trip. That is not a micro-optimisation: `(admin)/layout.tsx`
 * and `(admin)/admin/page.tsx` both call it on the same render, and the
 * signed-in header renders its admin link from a second, Suspense-wrapped
 * component. `cache()` is per-request, so nothing leaks between users —
 * `fetch` itself stays `no-store`, which is what keeps a revoked session from
 * being served from a shared cache across requests.
 */
export const getSession = cache(async function getSession(): Promise<SessionUser | null> {
  const incoming = await headers();
  const cookie = incoming.get('cookie');

  /*
   * ⚠️ `bound(...)` — without it this had no timeout at all, and this is the
   * single worst place on the site for that.
   *
   * `getSession()` is awaited by `proxy.ts` on every protected request and on
   * the first line of `(admin)/layout.tsx`. Node's `fetch` has no meaningful
   * default ceiling (undici's `headersTimeout` is five minutes; an open but
   * silent socket hits nothing), so an API that stopped answering held every
   * signed-in request open indefinitely — no redirect, no error boundary, no
   * log line, just a blank tab. `lib/api.ts` has capped this at 15s since it
   * was written; this call simply never went through it.
   *
   * `apiFetch` still is not usable here: it turns a non-2xx into
   * `ApiRequestError`, and the 401 below is a NORMAL outcome that must stay a
   * plain status check — wrapping it would make "not signed in" throw.
   */
  const response = await fetch(resolve('/api/session'), {
    ...bound({
      headers: cookie ? { cookie, accept: 'application/json' } : { accept: 'application/json' },
      cache: 'no-store',
    }),
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`GET /api/session failed with ${response.status}`);
  }

  return SessionSchema.parse(await response.json());
});

/** UX-level check only. The API guard is the authorization decision. */
export function can(session: SessionUser | null, permission: string): boolean {
  return session?.permissions.includes(permission) ?? false;
}

/**
 * The line rendered under someone's name to say WHICH account this is — in the
 * account menu, the admin header, the onboarding greeting.
 *
 * Email first, then phone. Not because the email matters more, but because
 * when a student has given one it is the string they recognise as "their
 * account"; a phone-only student sees their number, which is the only
 * identifier they ever had.
 *
 * `null` when neither exists, which is a real state and not a bug: a Google
 * sign-up has an email but no phone yet, and — in the other direction — an
 * admin created by `create-admin.ts` has no phone at all. Callers render
 * nothing rather than an empty line.
 *
 * Both values are Latin/LTR strings inside an RTL page, so every caller sets
 * `dir="ltr"` on the element that shows this.
 */
export function accountIdentityLabel(user: {
  email: string | null;
  phoneNumber: string | null;
}): string | null {
  return user.email ?? user.phoneNumber ?? null;
}
