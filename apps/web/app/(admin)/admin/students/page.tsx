import type { SearchParams } from 'nuqs/server';
import { listResponse } from '@ayman/contracts/admin/list';
import { AdminStudentRowSchema } from '@ayman/contracts/admin/students';
import { TaxonomySchema, copy } from '@ayman/contracts';
import { apiGet } from '@/lib/api';
import { adminGet } from '@/lib/admin-api';
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

  const [data, taxonomy] = await Promise.all([
    adminGet(`/api/admin/students?${params.toString()}`, ResponseSchema),
    apiGet('/api/taxonomy', TaxonomySchema),
  ]);

  const governorateOptions = taxonomy.governorates
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ value: g.code, label: g.nameAr }));

  const trackOptions = taxonomy.systems
    .flatMap((system) => system.tracks)
    .map((track) => ({ value: track.id, label: track.labelAr }));

  const yearLabelByNumber = new Map<number, string>();
  for (const system of taxonomy.systems) {
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
      />
    </>
  );
}
