import { cache } from 'react';
import { DashboardSchema, type Dashboard } from '@ayman/contracts';
import { apiGetAuthed } from './api-server';

/**
 * `GET /api/me/dashboard`, shared across one render.
 *
 * Two components need this payload on the dashboard route: the page itself,
 * and the rail's course list. Without `cache()` that is two round-trips to the
 * same endpoint on the same request for identical data.
 *
 * `cache()` is per-request, so nothing leaks between users, and the underlying
 * `fetch` in `apiGetAuthed` stays `no-store` — a revoked enrolment must never
 * be served from a shared cache.
 *
 * Server Components / Server Actions only: `apiGetAuthed` reads `cookies()`.
 */
export const getDashboard = cache(async function getDashboard(): Promise<Dashboard> {
  return apiGetAuthed('/api/me/dashboard', DashboardSchema);
});
