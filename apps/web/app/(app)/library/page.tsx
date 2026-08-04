import type { Metadata } from 'next';
import { LearningPathSchema, ProfileMeSchema, TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { apiGetAuthed } from '@/lib/api-server';
import { getCatalogOrEmpty } from '@/lib/catalog';
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
    apiGet('/api/taxonomy', TaxonomySchema),
  ]);

  const view = buildLibrary({ courses: catalog.courses, path, me, taxonomy });

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <header className="mb-6">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
      </header>

      <IdentityStrip identity={view.identity} onboardingCompleted={me.onboardingCompleted} />

      {view.totalCourses === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-10 text-center text-fg-muted">
          {c.empty}
        </p>
      ) : (
        <div className="mt-10 flex flex-col gap-12">
          {view.yours === null ? null : (
            <section>
              <div className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
                <h2 className="text-[length:var(--fs-title-3)] font-medium text-fg">
                  {c.yoursTitle}
                </h2>
                <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.yoursLead}</span>
              </div>

              {view.yours.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-8 text-center text-fg-muted">
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
