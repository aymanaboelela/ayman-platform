import Link from 'next/link';
import type { Metadata } from 'next';
import { DashboardSchema, copy } from '@ayman/contracts';
import { Card, CardBody, cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { RecentScores } from '@/components/dashboard/recent-scores';

export const metadata: Metadata = { title: copy.nav.dashboard };

/**
 * The real student dashboard: continue-watching, enrolled courses with real
 * percentages, and the recent-scores rail. Replaces Plan 2's placeholder
 * (see git history) — that task only needed a real, protected rendering
 * destination for `proxy.ts`'s redirect matrix; this is the content Plan 2
 * always deferred to Plan 4.
 */
export default async function DashboardPage() {
  const dashboard = await apiGetAuthed('/api/me/dashboard', DashboardSchema);

  return (
    <main className="mx-auto max-w-[var(--w-shell)] px-6 py-10">
      <p className="eyebrow mb-2">{copy.dashboard.eyebrow}</p>
      <h1 className="mb-8 text-[length:var(--fs-title-1)] font-semibold">
        {copy.dashboard.title}
      </h1>

      {dashboard.continueWatching ? (
        <section className="mb-10">
          <ContinueWatchingCard item={dashboard.continueWatching} />
        </section>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium">
          {copy.dashboard.myCourses}
        </h2>

        {dashboard.enrolledCourses.length === 0 ? (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-fg-muted">{copy.dashboard.noCoursesYet}</p>
              <Link
                href="/courses"
                className={cn(
                  'rounded-md border border-line-strong px-4 py-2',
                  'text-[length:var(--fs-text-sm)] font-medium text-accent-text',
                  'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                )}
              >
                {copy.dashboard.browseCourses}
              </Link>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.enrolledCourses.map((course) => (
              <EnrolledCourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium">
          {copy.dashboard.recentScores}
        </h2>
        <RecentScores scores={dashboard.recentScores} />
      </section>
    </main>
  );
}
