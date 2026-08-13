import type { SearchParams } from 'nuqs/server';
import { z } from 'zod';
import { StudentAnalyticsRowSchema } from '@ayman/contracts/admin/analytics';
import { listResponse } from '@ayman/contracts/admin/list';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { AnalyticsNav } from '../analytics-nav';
import { FilterBar } from '../filter-bar';
import { studentsAnalyticsCache } from '../search-params';
import { StudentsAnalyticsTable } from './students-analytics-table';

const c = copy.analytics;

const ResponseSchema = listResponse(StudentAnalyticsRowSchema);
const CourseOptionSchema = z.object({ id: z.string(), title: z.string() });

export const metadata = { title: c.navStudents };

/** Every student's rollup, one row each. The URL is the only state, so a
 *  filtered view is a link someone can send. */
export default async function StudentAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = studentsAnalyticsCache.parse(await searchParams);

  const params = new URLSearchParams({
    page: String(query.page),
    perPage: String(query.perPage),
    sort: query.sort,
    dir: query.dir,
  });
  if (query.q) params.set('q', query.q);
  if (query.courseId) params.set('courseId', query.courseId);
  for (const year of query.year) params.append('year', String(year));

  const [data, courses] = await Promise.all([
    adminGet(`/api/admin/analytics/students?${params.toString()}`, ResponseSchema),
    adminGet('/api/admin/courses', z.array(CourseOptionSchema)),
  ]);

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="mb-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.studentsTitle}</h1>
      </header>

      <AnalyticsNav />
      <FilterBar
        courses={courses}
        showWindow={false}
        exportHref="/api/admin/analytics/export/students.csv"
      />

      <StudentsAnalyticsTable rows={data.rows} rowCount={data.rowCount} />
    </div>
  );
}
