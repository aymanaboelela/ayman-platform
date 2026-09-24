import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ZodType } from 'zod';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf';
import { bound, resolve } from './api';

/**
 * Server-only, cookie-forwarding, and deliberately `cache: 'no-store'`. Admin
 * screens must always show the current database state; a cached admin read is
 * indistinguishable from a lost write.
 *
 * The API guard re-authorises every one of these calls. This helper carries no
 * authorization logic of its own — it only forwards the session cookie.
 *
 * ⚠️ This module imports `next/headers` and can therefore never be reachable
 * from a `'use client'` file, not even through an unused export. It is also
 * why the public `'use cache'` loaders in `./settings.ts` do NOT use it: a
 * cached function may not read cookies or headers at all.
 *
 * The API host is not named here — `resolve()` from `./api` is the one place
 * it may appear.
 */
async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const incoming = await headers();
  const cookie = incoming.get('cookie');
  return {
    accept: 'application/json',
    ...(cookie ? { cookie } : {}),
    ...extra,
  };
}

/**
 * A failed admin write, with the status still attached.
 *
 * Both helpers below used to throw a bare `Error` whose message was
 * `POST /api/… failed with 409: {"message":"…"}`. Every Server Action then did
 * `error instanceof Error ? error.message : 'unknown'`, which is how an
 * internal route, an HTTP status and a raw JSON body ended up rendered inside
 * the Arabic RTL admin UI.
 *
 * `extends Error` and the same `message`, so every existing caller keeps
 * working unchanged — this only ADDS the two fields a caller needs in order to
 * say something better. New actions should branch on `status` and render their
 * own copy; see `students/actions.ts` for the shape.
 */
export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The parsed response body when it was JSON, else null. */
    readonly payload: unknown,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function adminGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(
    resolve(path),
    bound({ headers: await authHeaders(), cache: 'no-store' }),
  );
  /*
   * `AdminApiError`, not a bare `Error`, and for the reason that class's own
   * banner already gives for writes: a caller that needs to tell «forbidden»
   * from «broken» cannot do it by parsing a message string.
   *
   * ⚠️ This is load-bearing on a page that reads several routes at once. A
   * panel the operator's ROLE was never meant to reach answers 403, and with
   * no status on the throw the page cannot render that one panel as «not
   * yours» — so the whole screen dies instead. Measured on both instructor
   * stacks: `/admin/students/{id}` returned 200 while `…/subscriptions` and
   * `…/conversation` returned 403, and the page showed «حصلت مشكلة» empty.
   */
  if (!response.ok) {
    throw new AdminApiError(`GET ${path} failed with ${response.status}`, response.status, null);
  }
  return schema.parse(await response.json());
}

/**
 * `adminGet` for a panel the CURRENT OPERATOR may not be allowed to see.
 *
 * Returns `null` on 403 and rethrows everything else. 403 is the one status
 * here that is not a fault: `ROLE_PERMISSIONS` in the API gives `owner` a
 * curated set on purpose — money and conversations are grantable rather than
 * default — so an instructor opening a student hits it BY DESIGN, every time.
 *
 * ⚠️ `null` means «not yours to see», never «empty». The caller renders a
 * panel that says so; falling back to the empty state would tell an
 * instructor their student has no subscription and has never written, which
 * is a lie the page cannot tell apart from the truth.
 */
export async function adminGetOrForbidden<T>(
  path: string,
  schema: ZodType<T>,
): Promise<T | null> {
  try {
    return await adminGet(path, schema);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 403) return null;
    throw error;
  }

/**
 * `adminGet` for a page whose whole subject is ONE record — a student, a
 * lesson, a thread — where the API answering 404 means the thing is not there,
 * which is an ordinary outcome and not a fault.
 *
 * ⚠️ WITHOUT THIS, "does not exist" RENDERS AS A CRASH. `adminGet` throws a
 * plain `Error` on every non-2xx, and an unhandled throw inside a Server
 * Component is a 500 with `error.tsx` over it — so an admin who opens a record
 * that has been deleted, or one the endpoint legitimately does not serve, reads
 * «حصل خطأ» instead of «مش موجود» and cannot tell the two apart.
 *
 * It is not hypothetical. Production's own error log recorded it twice on
 * 2026-08-16, both on `/admin/analytics/students/:id`: that route resolves a
 * student through a roster CTE joining `users` on `role = \'student\'`, so it
 * 404s for any account that is not one — an admin, a content author, a student
 * who has not finished onboarding. `/admin/students/:id` already wraps the same
 * call in a `try` for exactly this reason (see the note there); this is that
 * lesson applied to the pages where the record IS the page and there is nothing
 * to render beside it.
 *
 * ONLY 404 is translated. Every other status still throws, because a 401 or a
 * 500 is a fault and must not be dressed up as a missing row — that is how a
 * broken endpoint becomes an invisible empty page.
 */
}

/**
 * `adminGet` that answers `null` instead of throwing when the record is not
 * there — for a page that has something better to render than the 404 page.
 *
 * `adminGetOrNotFound` below is the right default and this is the exception:
 * reach for it only when "missing" has a MEANING the screen can act on, e.g.
 * an account that exists but holds no student record, where the useful answer
 * names the account and points at the page that does serve it.
 *
 * Same rule about the status: only 404 becomes `null`. Everything else throws.
 */
export async function adminGetOrNull<T>(path: string, schema: ZodType<T>): Promise<T | null> {
  const response = await fetch(
    resolve(path),
    bound({ headers: await authHeaders(), cache: 'no-store' }),
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return schema.parse(await response.json());
}

export async function adminGetOrNotFound<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(
    resolve(path),
    bound({ headers: await authHeaders(), cache: 'no-store' }),
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return schema.parse(await response.json());
}

/**
 * The CSRF header value for a Server Action, read off the incoming cookie.
 *
 * Double-submit: the value comes from the `__Host-csrf` cookie the browser
 * sent us. A cross-site form POST cannot read that cookie, and cannot set a
 * custom header either — which is the second, independent half of the guard.
 */
async function csrfFromCookie(): Promise<string> {
  const incoming = await headers();
  return (
    incoming
      .get('cookie')
      ?.split('; ')
      .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`))
      ?.slice(CSRF_COOKIE.length + 1) ?? 'server-action'
  );
}

/**
 * A write whose route answers `204 No Content`, from a Server Action.
 *
 * ⚠️ `adminSend` below CANNOT be used for these, and the failure is nasty
 * rather than loud: it ends with `schema.parse(await response.json())`, and
 * `.json()` on an empty body throws `SyntaxError` — AFTER the API has already
 * done the work. المساعد's reply route shipped that way, so pressing «ابعت
 * الرد» wrote the reply, notified the student, and then told the instructor it
 * had failed and kept his text in the box. He pressed it again.
 *
 * Every other `adminSend` caller answers with JSON, which is why nothing had
 * hit this before. Split rather than made conditional: "this route returns a
 * body" and "this route does not" are different contracts, and a helper that
 * quietly tolerates both stops telling you which one you are calling — the
 * same reasoning behind `apiPostVoid` on the client side.
 */
export async function adminSendVoid(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<void> {
  const response = await fetch(
    resolve(path),
    bound({
      method,
      headers: await authHeaders({
        'content-type': 'application/json',
        [CSRF_HEADER]: await csrfFromCookie(),
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    }),
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new AdminApiError(
      `${method} ${path} failed with ${response.status}: ${detail.slice(0, 200)}`,
      response.status,
      parseJson(detail),
    );
  }
  // No body read at all. There is nothing to parse and nothing to return.
}

export async function adminSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const csrf = await csrfFromCookie();

  const response = await fetch(
    resolve(path),
    bound({
      method,
      headers: await authHeaders({ 'content-type': 'application/json', [CSRF_HEADER]: csrf }),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    }),
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new AdminApiError(
      `${method} ${path} failed with ${response.status}: ${detail.slice(0, 200)}`,
      response.status,
      parseJson(detail),
    );
  }

  return schema.parse(await response.json());
}
