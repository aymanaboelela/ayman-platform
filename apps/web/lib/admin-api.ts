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

export async function adminGet<T>(path: string, schema: ZodType<T>): Promise<T> {
  const response = await fetch(resolve(path), {
    headers: await authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return schema.parse(await response.json());
}

export async function adminSend<T>(
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  schema: ZodType<T>,
): Promise<T> {
  const incoming = await headers();
  // Double-submit: the value comes from the __Host-csrf cookie the browser
  // sent us. A cross-site form POST cannot read that cookie, and cannot set a
  // custom header either — which is the second, independent half of the guard.
  const csrf = incoming
    .get('cookie')
    ?.split('; ')
    .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`))
    ?.slice(CSRF_COOKIE.length + 1);

  const response = await fetch(resolve(path), {
    method,
    headers: await authHeaders({
      'content-type': 'application/json',
      [CSRF_HEADER]: csrf ?? 'server-action',
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${method} ${path} failed with ${response.status}: ${detail.slice(0, 200)}`);
  }

  return schema.parse(await response.json());
}
