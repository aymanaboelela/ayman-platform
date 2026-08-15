import { headers } from 'next/headers';
import type { ZodType } from 'zod';
import { CSRF_COOKIE, CSRF_HEADER } from './csrf';
import { resolve } from './api';

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
  const response = await fetch(resolve(path), {
    headers: await authHeaders(),
    cache: 'no-store',
  });
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
  const response = await fetch(resolve(path), {
    method,
    headers: await authHeaders({
      'content-type': 'application/json',
      [CSRF_HEADER]: await csrfFromCookie(),
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

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

  const response = await fetch(resolve(path), {
    method,
    headers: await authHeaders({
      'content-type': 'application/json',
      [CSRF_HEADER]: csrf,
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

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
