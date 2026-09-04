import type { SearchParams } from 'nuqs/server';
import { listResponse } from '@ayman/contracts/admin/list';
import { AdminStudentRowSchema } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { can, getSession } from '@/lib/session';
import { StudentsTable } from './students-table';
import { studentsCache } from './search-params';

const ResponseSchema = listResponse(AdminStudentRowSchema);

export const metadata = { title: copy.admin.nav.students };

/**
 * Not cached (`adminGet` is `cache: 'no-store'`) — an admin list must always
 * reflect the last write. The URL is the only state: filtering by
 * governorate + year, copying the link, and opening it in another session
 * renders the same server-filtered list (Task 9's whole point).
 */
export default async function StudentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // In Next 16 `searchParams` is a Promise; the cache parses the resolved
  // value and makes the same values readable from nested Server Components.
  const query = studentsCache.parse(await searchParams);

  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('perPage', String(query.perPage));
  params.set('sort', query.sort);
  params.set('dir', query.dir);
  if (query.q) params.set('q', query.q);
  for (const code of query.governorate) params.append('governorate', code);
  for (const year of query.year) params.append('year', String(year));
  for (const track of query.track) params.append('track', track);

  /**
   * ⚠️ `getTaxonomyOrNull()`, NOT `apiGet('/api/taxonomy', …)`.
   *
   * Every student-facing page was migrated to this loader after an uncached
   * taxonomy read took four of them down at once; the five admin pages were
   * left behind, and on 2026-09-04 this one collected the bill. `/admin/students`
   * logged the same Server-Component digest seven times between 14:34 and 14:41 —
   * the minutes after the 14:21 CI run finished and Dokploy restarted the
   * container — and then stopped on its own. Nothing was wrong with the data:
   * `/api/admin/students` and `/api/taxonomy` both answered 200 with the full
   * 446 rows twenty minutes later.
   *
   * What is special about a restart is that every `'use cache'` entry is cold, so
   * every render does its live reads at once. `lib/api.ts`'s `apiGet` forwards no
   * cookie, so all of them share ONE rate-limit identity for the whole fleet (see
   * the long note in `lib/taxonomy.ts`), and `apiGet` THROWS on a non-2xx — with
   * no `error.tsx` under `app/`, that throw is the admin's whole page.
   *
   * `adminGet` below is deliberately still live and still throwing: an admin list
   * that shows a cached row is indistinguishable from a lost write. It is also
   * not the read that fails, because it DOES forward the cookie and therefore
   * gets its own identity — one admin, not the fleet.
   *
   * Taxonomy is reference data. It changes when an admin edits it, which the
   * loader's `cacheTag` already handles, and the only thing this page does with
   * it is turn codes into filter labels — so `null` costs an empty filter
   * dropdown for up to a minute, not a broken screen.
   */
  const [data, taxonomy] = await Promise.all([
    adminGet(`/api/admin/students?${params.toString()}`, ResponseSchema),
    getTaxonomyOrNull(),
  ]);

  const governorateOptions = (taxonomy?.governorates ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ value: g.code, label: g.nameAr }));

  const trackOptions = (taxonomy?.systems ?? [])
    .flatMap((system) => system.tracks)
    .map((track) => ({ value: track.id, label: track.labelAr }));

  const yearLabelByNumber = new Map<number, string>();
  for (const system of taxonomy?.systems ?? []) {
    for (const year of system.years) {
      if (!yearLabelByNumber.has(year.year)) yearLabelByNumber.set(year.year, year.labelAr);
    }
  }
  const yearOptions = [...yearLabelByNumber.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, label]) => ({ value: String(year), label }));

  return (
    <>
      <h1 className="mb-4 text-[length:var(--fs-title-2)] font-semibold text-fg">
        {copy.admin.nav.students}
      </h1>
      <StudentsTable
        rows={data.rows}
        rowCount={data.rowCount}
        query={query}
        governorateOptions={governorateOptions}
        trackOptions={trackOptions}
        yearOptions={yearOptions}
        canDelete={can(await getSession(), 'student:delete')}
      />
    </>
  );
}
