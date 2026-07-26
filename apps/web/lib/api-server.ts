import { cookies } from 'next/headers';
import type { ZodType } from 'zod';
import { ApiRequestError, resolve } from './api';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf';

/**
 * Cookie-forwarding helpers, split out of `./api.ts` on purpose: this module
 * imports `next/headers`, which cannot be bundled into client code at all —
 * every export reachable from a `'use client'` file has to come from a
 * module that never imports it, even transitively. `./api.ts` is imported by
 * `onboarding-form.tsx` and `devices-list.tsx` (Client Components), so the
 * two authenticated-server-context helpers live here instead. Anything in
 * this file is Server Component / Server Action only.
 */

/**
 * Authenticated GET from a Server Component — the admin course list/editor
 * pages need this. `apiGet` (in `./api.ts`) deliberately does not forward
 * cookies: every one of its callers (taxonomy, the public catalog) is a
 * public endpoint. The session cookie is forwarded explicitly here for the
 * same reason `apiSend` forwards it below: a Server Component render has no
 * ambient browser cookie jar.
 */
export async function apiGetAuthed<T>(path: string, schema: ZodType<T>): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(resolve(path), {
    headers: { accept: 'application/json', cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
  }

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
