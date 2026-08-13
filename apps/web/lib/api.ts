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
  /**
   * Next's own error identifier, set BY HAND on the one error the UI needs to
   * recognise across the server/client boundary. See `UPSTREAM_TIMEOUT_DIGEST`.
   */
  digest?: string;

  constructor(status: number, path: string) {
    super(`${path} failed with ${status}`);
    this.status = status;
  }
}

/**
 * The one error the error boundary is allowed to recognise in PRODUCTION.
 *
 * ⚠️ A digest is normally Next's, not ours. It hashes the message and stack of
 * a server error, ships only that opaque string to the browser, and keeps the
 * real error on the server — which is exactly right, and is also why an
 * error boundary cannot normally tell "the upstream timed out" from "a page
 * threw", and has to say the weaker of the two things to everyone.
 *
 * Next respects a digest that is already set rather than generating one over
 * it — `create-error-handler.js`, "If the error already has a digest, respect
 * the original digest, so it won't get re-generated" (next 16.2.11). So
 * stamping this constant on the timeout path, and only there, buys the boundary
 * one bit of information across the boundary and leaks nothing: it is a literal
 * in this repo, identical for every student and every request, and it describes
 * a condition rather than a stack.
 *
 * That sameness is also its cost, and `ErrorState` accounts for it — a constant
 * is useless as a reference number, so the «رقم المشكلة» line is suppressed for
 * this digest instead of printing a value that means nothing to whoever is
 * asked to look it up.
 */
export const UPSTREAM_TIMEOUT_DIGEST = 'AYMAN_UPSTREAM_TIMEOUT';

/**
 * How long a SERVER-side API call may take before the page gives up on it.
 *
 * ⚠️ Without this there is no ceiling at all, and "no ceiling" is what the
 * student experiences as a page that loads forever.
 *
 * `fetch` has no default timeout in Node — undici's `headersTimeout` is five
 * minutes, and a socket that is open but silent hits neither. Every one of
 * these helpers is awaited inside a Server Component, so a single unanswered
 * call holds the whole RSC render open; the browser has already committed the
 * route and is sitting on its `loading.tsx`, which has no timeout either and
 * no way to learn that anything is wrong. The skeleton just stays up. Reported
 * as «بضغط على حاجة تقعد تتحمل loading كده بس».
 *
 * Fifteen seconds is chosen against the BUILD, not against the reader — a page
 * this slow is already a failure to anyone waiting on it, but `next build`
 * prerenders the course pages through these same helpers against an API that
 * has just started, and a ceiling tight enough to be honest about reader
 * patience would make deploys flaky. What matters is that the number is finite:
 * past it the call throws, the error boundary paints, and the reader is TOLD.
 */
const SERVER_TIMEOUT_MS = 15_000;

/**
 * Bounds a server-side request, and leaves browser-side ones exactly as they
 * were.
 *
 * The browser is deliberately excluded. A hanging fetch there is the student's
 * own connection, the browser surfaces it on its own, and every browser-side
 * caller here is a form submit or a heartbeat whose failure is already handled
 * locally — nothing about it can strand a page render.
 *
 * `AbortSignal.any` rather than overwriting: the heartbeat passes its own
 * signal, and silently dropping a caller's cancellation to add ours would be a
 * leak dressed up as a timeout.
 */
function bound(init?: RequestInit): RequestInit | undefined {
  if (typeof window !== 'undefined') return init;
  const timeout = AbortSignal.timeout(SERVER_TIMEOUT_MS);
  return {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  };
}

/**
 * Runs a bounded request and reports a timeout as a status rather than as a
 * bare `DOMException` nobody upstream can branch on.
 *
 * 504 is the honest code: something upstream of us did not answer in time. It
 * arrives at the error boundary as an `ApiRequestError` like any other, so the
 * one place that decides what to show the student keeps one shape to read.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(resolve(path), bound(init));
  } catch (cause) {
    if (cause instanceof Error && (cause.name === 'TimeoutError' || cause.name === 'AbortError')) {
      const timeout = new ApiRequestError(504, path);
      // Survives to the browser, where the error boundary reads it. See the
      // constant for why this is safe to do and why it is done nowhere else.
      timeout.digest = UPSTREAM_TIMEOUT_DIGEST;
      throw timeout;
    }
    throw cause;
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
  const response = await apiFetch(path, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return schema.parse(await response.json());
}

/**
 * Fetch and validate with a hand-written narrowing function instead of a Zod
 * schema.
 *
 * The reason it exists is a BUNDLING one, not a fetching one. `apiGet` takes a
 * `ZodType`, and a `ZodType` is a value: reaching one drags 62 KB gzip of Zod
 * into whatever imported it. المساعد's launcher probe is the one caller that
 * cannot pay that — it is imported statically by a widget mounted on every
 * route in `(site)`, `(app)` and `(auth)`, so its schema would land in the
 * `<head>` of every prerendered page to validate two booleans and a count. See
 * `components/assistant/assistant-summary.ts`, and
 * `@ayman/contracts/assistant/summary` for the contract with no Zod in it.
 *
 * `narrow` throws on a shape it does not recognise, exactly as `schema.parse`
 * does, so both helpers fail identically: a contract drift is a rejected
 * promise here rather than an `undefined` three components later. Anything
 * bigger than a handful of primitives belongs in `apiGet` with a real schema —
 * hand-written narrowing does not scale, and is not meant to.
 */
export async function apiGetNarrow<T>(
  path: string,
  narrow: (value: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return narrow(await response.json());
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
 * PUT with schema validation, browser-only — the one caller that actually
 * NEEDS the parsed response body back (the quiz autosave hook reads
 * `serverTime`/`deadlineAt`/`answeredCount` off every save to re-anchor the
 * timer and update the navigator), unlike `apiPut`'s fire-and-forget callers.
 */
export async function apiPutTyped<T>(
  path: string,
  schema: ZodType<T>,
  body?: unknown,
  init?: ApiPostInit,
): Promise<T> {
  const response = await fetch(resolve(path), {
    method: 'PUT',
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
 * POST that returns `204 No Content`, browser-only.
 *
 * `apiPost` parses the response against a schema and would throw on an empty
 * body; `apiPatch` returns `unknown` the caller then ignores. Neither fits a
 * route whose whole contract is "it worked". المساعد's read-marker is the
 * first such caller — it fires when the thread comes on screen and nothing
 * waits on it.
 */
export async function apiPostVoid(path: string, body?: unknown): Promise<void> {
  const response = await fetch(resolve(path), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      [CSRF_HEADER]: readCsrfToken(),
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
  }
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
  const response = await apiFetch(path, {
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiRequestError(response.status, path);
  return schema.parse(await response.json());
}
