import { headers } from 'next/headers';
import { z } from 'zod';
import { resolve } from './api';

const SessionSchema = z.object({
  id: z.string(),
  email: z.string(),
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
 */
export async function getSession(): Promise<SessionUser | null> {
  const incoming = await headers();
  const cookie = incoming.get('cookie');

  const response = await fetch(resolve('/api/session'), {
    headers: cookie ? { cookie, accept: 'application/json' } : { accept: 'application/json' },
    cache: 'no-store',
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`GET /api/session failed with ${response.status}`);
  }

  return SessionSchema.parse(await response.json());
}

/** UX-level check only. The API guard is the authorization decision. */
export function can(session: SessionUser | null, permission: string): boolean {
  return session?.permissions.includes(permission) ?? false;
}
