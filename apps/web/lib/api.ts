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
