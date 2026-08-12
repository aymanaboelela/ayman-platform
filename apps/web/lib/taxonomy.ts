import { cacheLife, cacheTag } from 'next/cache';
import { TaxonomySchema, type Taxonomy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { tags } from '@/lib/cache-tags';

/**
 * The systems / years / tracks / subjects table, cached.
 *
 * ## Why this exists rather than another `apiGet('/api/taxonomy', …)`
 *
 * With `cacheComponents: true` a bare `fetch` from a Server Component is LIVE
 * on every render — `lib/catalog.ts` states the same rule. `/library`, the
 * onboarding wizard, `/profile` and `/settings/section` all called the
 * endpoint directly for a while, and that was survivable only while the pages
 * doing it were ones a student opens a few times a term.
 *
 * The dashboard is not one of those. It is the screen every student lands on
 * after logging in and returns to between every lesson, and adding an uncached
 * read there put a per-view request on the API's busiest path. It showed up
 * immediately: the Playwright suite started failing with `GET /api/taxonomy
 * failed with 429` on `/dashboard`, `/profile`, `/results` and `/playground`
 * alike — the rate limiter doing exactly its job, and a page 500 for the
 * student.
 *
 * That 429 is worse than it looks, and it is why the other four routes were
 * migrated here too. `lib/api.ts`'s server-side `apiGet` forwards no cookie,
 * so `apps/api`'s `request-identity.ts` falls through to `ip:${request.ip}` —
 * and in production Caddy proxies `/api/*` to `127.0.0.1:3300` while the web
 * container reaches the API as `http://api:3300` with no `X-Forwarded-For`.
 * Every server-side taxonomy read in the whole fleet therefore shares ONE
 * tracker key. `/library` and `/profile` are rail destinations a student
 * reopens all day and `/onboarding` runs on every fresh sign-up, so roughly
 * sixty views a minute across them was enough to exhaust a bucket shared by
 * every visitor. And `find apps/web/app -name "error*.tsx"` still returns
 * nothing: with no error boundary in the app tree, an `apiGet` throw is not
 * contained by the Suspense boundary and the student gets Next's bare error
 * page where they expected their courses.
 *
 * Caching is the right answer rather than raising the limit, because this data
 * is the definition of reference data: it changes when an admin edits the
 * taxonomy, which is roughly never, and it is identical for every student. A
 * shared cache entry leaks nothing — the endpoint is unauthenticated. (The
 * API-side budget was raised as well, to `CatalogController`'s constant, but
 * that is a floor under a mistake, not the fix.)
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
 *
 * ## Why the `cacheTag` is not optional
 *
 * `app/(admin)/admin/taxonomy/actions.ts` has always ended every write with
 * `updateTag(tags.taxonomy())`. Without the matching `cacheTag` here that call
 * was dead code — it expired a tag no cache entry carried — and the failure
 * mode of a mismatched tag is the silent one `lib/cache-tags.ts` opens by
 * warning about: nothing errors, the admin's edit simply does not appear until
 * the `'minutes'` life runs out on its own. That was tolerable while only the
 * dashboard's greeting chip read this. It is not tolerable now that
 * `/onboarding` and `/settings/section` render their year and governorate
 * SELECTS from it: an admin adding a governorate expects the next student to
 * be able to pick it, and `updateTag` (never `revalidateTag`) is what lets the
 * admin see their own write on the same request.
 *
 * The cost is honest and intended: the first read after an admin edit pays a
 * live API call. That is exactly one call per edit against a taxonomy that
 * changes roughly never, and `lib/cache-tags.test.ts` now fails the build if a
 * tag in the vocabulary has no loader claiming it.
 */
export async function getTaxonomyOrNull(): Promise<Taxonomy | null> {
  'use cache';
  cacheTag(tags.taxonomy());
  cacheLife('minutes');

  try {
    return await apiGet('/api/taxonomy', TaxonomySchema);
  } catch {
    return null;
  }
}

/**
 * The same read, UNCACHED, for the one caller that cannot live with a cached
 * failure.
 *
 * Reason (2) above — that a `'use cache'` body is evaluated during `next build`,
 * when the API is unreachable — has a consequence the note stops just short of:
 * the `null` it returns is not merely produced at build time, it is CACHED at
 * build time, and `cacheLife('minutes')` then serves that failure to every
 * visitor for the first minute of the process's life.
 *
 * For `/library`, `/profile` and `/settings/section` that is exactly the
 * inconvenience it was designed to be — a missing year label. For `/onboarding`
 * it is a dead end, because `proxy.ts` sends a student with no profile back
 * there from everywhere else: they cannot proceed and they cannot go anywhere
 * else. Playwright caught precisely this. CI builds, then runs the browser
 * suite against that build, so the very first student to register met the
 * "taxonomy unavailable" panel instead of the form, on a working API, on every
 * single run.
 *
 * So `/onboarding` reads the cache first and falls back to here only when it
 * comes back empty. The rate-limit protection this whole module exists for is
 * untouched on the happy path — a cache HIT never reaches this function — and
 * the extra live call happens only in the window where the alternative was
 * showing a new student a door with no handle.
 *
 * Still `OrNull`, and still no throw: with no `error.tsx` anywhere under
 * `app/`, an escaping error is Next's bare error page. A genuinely unreachable
 * API therefore still lands on `<TaxonomyUnavailable>` — which is the honest
 * screen for it, and now means what it says.
 */
export async function getTaxonomyLiveOrNull(): Promise<Taxonomy | null> {
  try {
    return await apiGet('/api/taxonomy', TaxonomySchema);
  } catch {
    return null;
  }
}
