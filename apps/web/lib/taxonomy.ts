import { cacheLife } from 'next/cache';
import { TaxonomySchema, type Taxonomy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';

/**
 * The systems / years / tracks / subjects table, cached.
 *
 * ## Why this exists rather than another `apiGet('/api/taxonomy', …)`
 *
 * With `cacheComponents: true` a bare `fetch` from a Server Component is LIVE
 * on every render — `lib/catalog.ts` states the same rule. `/library` and the
 * onboarding wizard have always called the endpoint directly, and that was
 * survivable while the only pages doing it were ones a student opens a few
 * times a term.
 *
 * The dashboard is not one of those. It is the screen every student lands on
 * after logging in and returns to between every lesson, and adding an uncached
 * read there put a per-view request on the API's busiest path. It showed up
 * immediately: the Playwright suite started failing with `GET /api/taxonomy
 * failed with 429` on `/dashboard`, `/profile`, `/results` and `/playground`
 * alike — the rate limiter doing exactly its job, and a page 500 for the
 * student.
 *
 * Caching is the right answer rather than raising the limit, because this data
 * is the definition of reference data: it changes when an admin edits the
 * taxonomy, which is roughly never, and it is identical for every student. A
 * shared cache entry leaks nothing — the endpoint is unauthenticated.
 *
 * ## Why it returns `null` instead of throwing
 *
 * Two reasons, and the second is the one that bites.
 *
 * 1. Nothing this feeds is load-bearing. It turns a stored `year` and `trackId`
 *    into labels; a caller that has no taxonomy simply prints no label.
 *    `/library` already renders that state for a student who never chose a
 *    year, and the dashboard band handles it the same way.
 * 2. A `'use cache'` function is EVALUATED during `next build` to fill its
 *    cache, and `apiGet` throws when the API is unreachable — which is true
 *    inside `docker build` and true in the CI job that builds before running
 *    Playwright. `getCatalogOrEmpty` documents this trap after it took the
 *    build down once with ECONNREFUSED. The `try` has to be INSIDE the cached
 *    body: an error thrown while a cached function executes reaches the caller
 *    as an opaque digest that React re-throws during render, so a `try/catch`
 *    at the call site never sees it.
 *
 * `cacheLife('minutes')` rather than `'hours'` for the same reason
 * `getCatalogOrEmpty` uses it: this function caches its own failures, and one
 * API restart must not blank every student's year label for the rest of the
 * day.
 */
export async function getTaxonomyOrNull(): Promise<Taxonomy | null> {
  'use cache';
  cacheLife('minutes');

  try {
    return await apiGet('/api/taxonomy', TaxonomySchema);
  } catch {
    return null;
  }
}
