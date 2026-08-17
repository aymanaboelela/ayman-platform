import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ZodType } from 'zod';
import { ApiRequestError, apiFetch } from './api';
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
  const response = await apiFetch(path, {
    headers: { accept: 'application/json', cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
  }

  return schema.parse(await response.json());
}

/**
 * `apiGetAuthed` for a page whose whole subject is ONE record.
 *
 * ⚠️ A 404 from the API is an ORDINARY OUTCOME — the row is gone, or the id in
 * the address bar was never valid — and without this it renders as a crash: the
 * throw above is unhandled inside a Server Component, which is a 500 with
 * `error.tsx` over it, so an admin opening a deleted quiz reads «حصل خطأ»
 * instead of «مش موجود».
 *
 * See the longer note on `adminGetOrNotFound` in `lib/admin-api.ts` — this is
 * the same correction for the other of the two admin fetch helpers, and
 * production's error log is what found it.
 *
 * ONLY 404 is translated; every other status still throws, because a 401 or a
 * 500 is a fault and dressing it up as a missing row is how a broken endpoint
 * becomes an invisible empty page.
 */
export async function apiGetAuthedOrNotFound<T>(path: string, schema: ZodType<T>): Promise<T> {
  const cookieStore = await cookies();
  const response = await apiFetch(path, {
    headers: { accept: 'application/json', cookie: cookieStore.toString() },
    cache: 'no-store',
  });

  if (response.status === 404) notFound();
  if (!response.ok) throw new ApiRequestError(response.status, path);

  return schema.parse(await response.json());
}

/**
 * A state-changing call that returns NO body.
 *
 * `apiSend` below always calls `response.json()`, which throws on a 204 —
 * there is nothing to parse. Rather than making those routes answer 200 with
 * a placeholder object purely to satisfy a client helper, this is the helper
 * for the shape they actually have. Marking a notification read is the first
 * caller: the client already knows what it marked, and an empty 200 would
 * invite something to start depending on a body that does not exist.
 *
 * Same two load-bearing headers as `apiSend`, for the same reasons: the
 * session cookie (a Server Action has no ambient cookie jar) and
 * `x-csrf-token` (`CsrfGuard` requires it on every state-changing method).
 */
export async function apiCommand(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
): Promise<void> {
  const cookieStore = await cookies();
  const response = await apiFetch(path, {
    method,
    headers: {
      accept: 'application/json',
      [CSRF_HEADER]: cookieStore.get(CSRF_COOKIE)?.value ?? 'server-action',
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
  }
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
  const response = await apiFetch(path, {
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
