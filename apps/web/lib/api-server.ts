import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ZodType } from 'zod';
import { ApiRequestError, apiFetch } from './api';
import { forwardClientIp } from './client-ip';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf';
import { UPSTREAM_BUSY_DIGEST } from './upstream-digest';

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
    headers: {
      accept: 'application/json',
      cookie: cookieStore.toString(),
      ...forwardClientIp(await headers()),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    // The body rides along, for the page that has to say WHY: a 403 on an
    // exam carries the refusal's reason (`code`, or the bare `message` of a
    // `ForbiddenException('needs_month_grant')`), and «الامتحان مش ضمن
    // اشتراكك» is a different sentence from «اشتراكك خلص». A body that will
    // not parse is not worth failing over. See `refusalReason`.
    throw new ApiRequestError(
      response.status,
      path,
      await response.json().catch(() => undefined),
    );
  }

  return schema.parse(await response.json());
}

/**
 * The machine-readable reason on an API refusal, from whichever field the
 * thrower used: `new ForbiddenException({ code: 'quiz_closed' })` arrives as
 * `code`, `new ForbiddenException('needs_month_grant')` as `message` (the API's
 * exception filter passes both through). `null` when the body says nothing a
 * page could branch on.
 */
export function refusalReason(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { code, message } = payload as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && code !== '') return code;
  if (typeof message === 'string' && /^[a-z_]+$/.test(message)) return message;
  return null;
}

/**
 * The part of an API error body that describes the FAILURE, without the parts
 * that describe the request.
 *
 * The exception filter stamps every error body with a fresh `requestId` and
 * `timestamp`, and `apiSend` used to put the raw body into its message. When
 * that message is thrown from a render, Next's digest is a hash of it — so
 * every occurrence of one failure got its own digest and its own row:
 * `/admin/errors` showed five separate rows for one student's paper in sixteen
 * seconds, after the exam window closed. Keeping only `statusCode`, `message`,
 * `code` and `details` makes one failure one digest, and one row.
 */
function stableDetail(payload: unknown, raw: string): string {
  if (typeof payload !== 'object' || payload === null) return raw.slice(0, 300);
  const { statusCode, message, code, details } = payload as Record<string, unknown>;
  return JSON.stringify({ statusCode, message, code, details }).slice(0, 300);
}

/**
 * What `apiSend` throws — the same «METHOD path failed with NNN: {…}» message
 * it always threw, so every caller that string-matches «failed with 404» keeps
 * working, plus the two things a page needs to answer a refusal properly
 * instead of pattern-matching text.
 */
export class ApiSendError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
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
    headers: {
      accept: 'application/json',
      cookie: cookieStore.toString(),
      ...forwardClientIp(await headers()),
    },
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
      ...forwardClientIp(await headers()),
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
      ...forwardClientIp(await headers()),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    // The API's message is safe to surface — the global exception filter
    // already strips stack traces and connection strings.
    const detail = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(detail);
    } catch {
      payload = undefined;
    }
    const failed = new ApiSendError(
      `${method} ${path} failed with ${response.status}: ${stableDetail(payload, detail)}`,
      response.status,
      payload,
    );
    // Same bit `ApiRequestError` carries for a throttle, so a page whose render
    // is a write (the exam runner's `resume`) also waits it out by itself.
    if (response.status === 429) (failed as ApiSendError & { digest?: string }).digest = UPSTREAM_BUSY_DIGEST;
    throw failed;
  }

  return schema.parse(await response.json());
}
