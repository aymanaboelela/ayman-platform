import type { ZodType } from 'zod';
import { CSRF_HEADER, readCsrfToken } from './csrf';

/**
 * Lets a request outlive the page. Required for the final heartbeat on
 * tab-hide or unmount — `sendBeacon` cannot be used here because it cannot
 * set the CSRF header the API requires on every state-changing method.
 */
export interface ApiPostInit extends RequestInit {
  keepalive?: boolean;
}

/**
 * Server-side base URL. In the browser we always use a relative path so the
 * request stays same-origin; on the server there is no origin, so we need one.
 * This is the ONLY place an API host may appear.
 *
 * ⚠️ This file must NEVER import `next/headers` (or anything that does).
 * `apiPatch`/`apiDelete` below are imported by Client Components
 * (`onboarding-form.tsx`, `devices-list.tsx`), and `next/headers` cannot be
 * bundled into client code at all — Next fails the build the moment ANY
 * export from a module that imports it is reachable from a `'use client'`
 * file, even if the client component only uses an unrelated export. The
 * cookie-forwarding helpers (`apiSend`, `apiGetAuthed`) that Server
 * Components/Actions need live in `./api-server` instead, exactly so this
 * file can stay importable from the browser.
 */
const SERVER_BASE = process.env.API_ORIGIN ?? 'http://localhost:3300';

export function resolve(path: string): string {
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
 * POST and validate, browser-only. The player's progress client (Task 9) is
 * the reason this exists as its own helper rather than reusing `apiPatch`:
 * the heartbeat's final flush on tab-hide needs `keepalive: true`, which
 * `apiPatch`/`apiDelete` have no callers that need, and the response body
 * here IS re-validated against the shared schema (`apiPatch` deliberately
 * does not — see its own comment) because a heartbeat response drives what
 * the UI shows next, not just success/failure.
 */
export async function apiPost<T>(
  path: string,
  schema: ZodType<T>,
  body?: unknown,
  init?: ApiPostInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    method: 'POST',
    credentials: 'same-origin',
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      [CSRF_HEADER]: readCsrfToken(),
      ...init?.headers,
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
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

/** PUT, browser-only — identical shape to `apiPatch`, for the one HTTP verb
 *  that didn't otherwise have a browser-side caller yet (the quiz builder's
 *  settings form PUTs the whole settings object, matching the API's own
 *  idempotent-upsert semantics for that route). */
export async function apiPut(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(resolve(path), {
    method: 'PUT',
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
 * to string-match. No cookie forwarding — every current caller (the public
 * catalog) is a public endpoint; see `./api-server` for the authenticated
 * equivalent.
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
