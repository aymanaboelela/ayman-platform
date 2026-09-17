import type { Metadata } from 'next';
import { LearningPathSchema, ProfileMeSchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { buildLibrary } from '@/lib/library';
import { IdentityStrip } from '@/components/library/identity-strip';
import { TrackCell, YearSection } from '@/components/library/library-grid';

const c = copy.library;

export const metadata: Metadata = { title: c.title };

/**
 * The signed-in student's course library — every published course, grouped by
 * year and track, with their own cell first.
 *
 * ## Why this route exists next to the public `/courses`
 *
 * They are two answers to two questions and only one of them can own a URL.
 * `/courses` sells the catalog to a stranger and is the page Google indexes;
 * it renders in the marketing chrome because that is who it is for. This one
 * renders inside the student shell, because clicking «الكورسات» in the rail
 * and being thrown out of the dashboard is the complaint that started this
 * work.
 *
 * A single `/courses` serving both was tried on paper and does not survive
 * contact with Cache Components: the public page is prerendered, a session
 * read makes it dynamic, and a `redirect()` decided after the first `await`
 * cannot change a status line that has already streamed — the same limitation
 * `(site)/courses/[slug]` documents at length. Two routes, each honest about
 * its audience, is the version that works.
 *
 * ## Four fetches, one round trip
 *
 * All four are independent and therefore parallel. The catalog is cached and
 * shared with the public page; the path and the profile are authed and
 * per-request; the taxonomy is the same shared read onboarding and the admin
 * panel already make. Nothing here is a new endpoint — see `lib/library.ts` for
 * why the join lives on this side.
 *
 * ⚠️ `getTaxonomyOrNull()`, NOT `apiGet('/api/taxonomy', …)`. This page read
 * the endpoint live on every view until it was found sharing ONE server-side
 * throttle bucket with every other route in the fleet — `lib/taxonomy.ts` has
 * the full account of why the tracker key collapses to a single IP in
 * production. There is still no `error.tsx` anywhere under `app/`, so the 429
 * `apiGet` throws is not contained by any boundary: a student clicking
 * «الكورسات» in the rail got Next's bare error page. `buildLibrary` takes a
 * null taxonomy and degrades the year headings; the grid itself is built from
 * the catalog and is unaffected.
 *
 * ⚠️ `getCatalogOrEmpty`, NOT `getCatalog`. This page is authed and therefore
 * dynamic, but a `'use cache'` function is still EVALUATED during `next build`
 * to fill its cache — and `getCatalog` throws when the API is unreachable,
 * which is true inside `docker build` and true in the CI job that builds
 * before running Playwright. It shipped as `getCatalog` and took the build
 * down with `ECONNREFUSED` on exactly that job. `(site)/courses/page.tsx`
 * documents the same trap; the `'minutes'` cache life on the fallback is what
 * stops one failed build caching an empty catalog for the rest of the day.
 */
export default async function LibraryPage() {
  const [catalog, path, me, taxonomy] = await Promise.all([
    getCatalogOrEmpty(),
    apiGetAuthed('/api/me/path', LearningPathSchema),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
    getTaxonomyOrNull(),
  ]);

  const view = buildLibrary({ courses: catalog.courses, path, me, taxonomy });

  // The «كورساتك» count. `view.yours` is a list of TRACK cells, not of
  // courses — `YearSection` gets a `courseCount` precomputed by
  // `buildLibrary` but this group has none, so it is summed here rather than
  // by widening the view model for one heading.
  const yoursCount = view.yours?.reduce((n, track) => n + track.courses.length, 0) ?? 0;

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-6 py-10 md:py-12">
      <header className="study-head">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="study-head__title">{c.title}</h1>
        <p className="study-head__lead">{c.subtitle}</p>
      </header>

      <IdentityStrip identity={view.identity} onboardingCompleted={me.onboardingCompleted} />

      {view.totalCourses === 0 ? (
        <p className="mt-8 rounded-lg border border-study-line bg-study-tint px-6 py-10 text-center text-fg-muted">
          {c.empty}
        </p>
      ) : (
        <div className="mt-10 flex flex-col gap-12">
          {view.yours === null ? null : (
            <section>
              {/* `.group-head` is the h2 level and only the h2 level — the
                  track cells inside carry a lighter marker (see
                  `library-grid.tsx`). Two identical heading objects nested one
                  inside the other would flatten the year → track hierarchy
                  this page exists to express. */}
              <div className="group-head">
                <span className="group-head__mark" aria-hidden="true" />
                <h2 className="group-head__title">{c.yoursTitle}</h2>
                {/* `__note` is a one-line gloss and `.group-head` does not
                    wrap, so it is held back on phones where the title, a
                    sentence and a count cannot share a row. The lead is a
                    gloss on the heading, not information the page depends
                    on — `restLead` below is a standalone paragraph for the
                    same reason. */}
                <span className="group-head__note hidden min-w-0 truncate sm:block">
                  {c.yoursLead}
                </span>
                {/* No «0 كورس» over the empty state directly beneath it —
                    the panel already says there is nothing, and a zero next
                    to it is the same fact in a second grammar. */}
                {yoursCount > 0 ? (
                  <span className="group-head__count">
                    {c.courseCount.replace('{n}', String(yoursCount))}
                  </span>
                ) : null}
              </div>

              {view.yours.length === 0 ? (
                <p className="rounded-lg border border-study-line bg-study-tint px-6 py-8 text-center text-fg-muted">
                  {c.yoursEmpty}
                </p>
              ) : (
                <div className="flex flex-col gap-8">
                  {view.yours.map((track) => (
                    <TrackCell group={track} key={track.key} alone={view.yours!.length === 1} />
                  ))}
                </div>
              )}
            </section>
          )}

          {view.rest.length === 0 ? null : (
            <div className="flex flex-col gap-12">
              {/* One lead for the whole run rather than one per year — it says
                  the same thing about every group under it, and repeating it
                  three times is how a page starts nagging. */}
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.restLead}</p>
              {view.rest.map((year) => (
                <YearSection group={year} key={year.year} />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
