import type { SearchParams } from 'nuqs/server';
import { z } from 'zod';
import { LessonAnalyticsRowSchema } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGet } from '@/lib/admin-api';
import { AnalyticsNav } from '../analytics-nav';
import { FilterBar } from '../filter-bar';
import { lessonsCache } from '../search-params';
import { LessonsTable } from './lessons-table';

const c = copy.analytics;

const CourseOptionSchema = z.object({ id: z.string(), title: z.string() });

export const metadata = { title: c.navLessons };

/** Every lesson in one table, so the one where attention falls off a cliff is
 *  visible by scanning a column rather than by opening thirty screens. */
export default async function LessonAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = lessonsCache.parse(await searchParams);
  const params = new URLSearchParams();
  if (query.courseId) params.set('courseId', query.courseId);
  const suffix = params.toString() ? `?${params.toString()}` : '';

  const [rows, courses] = await Promise.all([
    adminGet(`/api/admin/analytics/lessons${suffix}`, z.array(LessonAnalyticsRowSchema)),
    adminGet('/api/admin/courses', z.array(CourseOptionSchema)),
  ]);

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="mb-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.lessonsTitle}</h1>
      </header>

      <AnalyticsNav />
      <FilterBar
        courses={courses}
        showWindow={false}
        exportHref="/api/admin/analytics/export/lessons.csv"
      />

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-10 text-center text-fg-muted">
          {c.noData}
        </p>
      ) : (
        <LessonsTable rows={rows} />
      )}
    </div>
  );
}
