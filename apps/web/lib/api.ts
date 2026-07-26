import type { ZodType } from 'zod';

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
 */
export async function apiPatch(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(resolve(path), {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw new ApiRequestError(response.status, path);
  }

  return payload;
}
