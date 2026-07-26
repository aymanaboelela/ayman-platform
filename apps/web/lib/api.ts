import { cookies } from 'next/headers';
import type { ZodType } from 'zod';
import { CSRF_COOKIE, CSRF_HEADER, readCsrfToken } from './csrf';

/**
 * Server-side base URL. In the browser we always use a relative path so the
 * request stays same-origin; on the server there is no origin, so we need one.
 * This is the ONLY place an API host may appear.
 */
const SERVER_BASE = process.env.API_ORIGIN ?? 'http://localhost:3300';

function resolve(path: string): string {
  if (!path.startsWith('/api/')) {
    throw new Error(`API paths must start with /api/ — got "${path}"`);
  }
  return typeof window === 'undefined' ? `${SERVER_BASE}${path}` : path;
}

/**
 * Carries the response status so a caller can branch on it (e.g. 409 for a
 * phone already registered to another profile) without ever surfacing the
 * raw API error text — same principle as `AuthRequestError` in
 * `auth-client.ts`.
 */
export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`${path} failed with ${status}`);
    this.status = status;
  }
}

/**
 * Fetch and validate. Parsing the response against the shared schema means a
 * backend contract change surfaces as a loud error here rather than as
 * `undefined` deep inside a component.
 */
export async function apiGet<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return schema.parse(await response.json());
}

/**
 * PATCH with a JSON body, browser-only (every current caller is a client
 * component submitting a form) — same-origin credentials carry the session
 * cookie automatically, exactly like `auth-client.ts`'s `post` helper.
 * The response body's exact shape isn't re-validated against a contract: the
 * only thing callers need is success/failure, mirroring `ProfileMeSchema`'s
 * own choice to leave `profile` as `z.unknown()` rather than re-declare the
 * full server-side row on the client.
 *
 * Carries `x-csrf-token` (Task 8, S9) — `apps/api`'s `CsrfGuard` rejects
 * every state-changing method without it.
 */
export async function apiPatch(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(resolve(path), {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      [CSRF_HEADER]: readCsrfToken(),
    },
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
  }

  return payload;
}

/**
 * DELETE, browser-only, no body — same CSRF header requirement as
 * `apiPatch`. Used by the أجهزتي page to revoke a device.
 * A `204 No Content` response has no JSON body, so this never attempts to
 * parse one on success — only on a non-OK response, where the API DOES send
 * a JSON error body.
 */
export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(resolve(path), {
    method: 'DELETE',
    credentials: 'same-origin',
    headers: { accept: 'application/json', [CSRF_HEADER]: readCsrfToken() },
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
  }
}

/**
 * 404 is a legitimate answer for a course slug, so it must not be an
 * exception — `notFound()` in a page needs `null`, not a thrown Error it has
 * to string-match.
 */
export async function apiGetOrNull<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T | null> {
  const response = await fetch(resolve(path), {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiRequestError(response.status, path);
  return schema.parse(await response.json());
}

/**
 * Authenticated, state-changing calls from Server Actions.
 *
 * Two things are load-bearing here:
 *  1. The session cookie is forwarded explicitly. A Server Action runs on the
 *     Node server, which has no ambient cookie jar — omitting this is why an
 *     admin action would return 401 while the same request works from the
 *     browser.
 *  2. `x-csrf-token` is sent because `CsrfGuard` (Plan 2) requires the header
 *     on every state-changing method. This request carries NO `Origin` and NO
 *     `Sec-Fetch-Site` (it is server-to-server) — the guard treats an ABSENT
 *     `Sec-Fetch-Site` the same as `same-origin`.
 */
export async function apiSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  schema: ZodType<T>,
  body?: unknown,
): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(resolve(path), {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      [CSRF_HEADER]: cookieStore.get(CSRF_COOKIE)?.value ?? 'server-action',
      cookie: cookieStore.toString(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    // The API's message is safe to surface — the global exception filter
    // already strips stack traces and connection strings.
    const detail = await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}: ${detail.slice(0, 300)}`);
  }

  return schema.parse(await response.json());
}
