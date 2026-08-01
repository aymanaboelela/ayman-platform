import Link from 'next/link';
import type { Metadata } from 'next';
import { BookOpen, GaugeCircle, Layers, Target } from 'lucide-react';
import { DashboardSchema, ProfileMeSchema, copy, type Dashboard } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { RecentScores } from '@/components/dashboard/recent-scores';
import { StatTile } from '@/components/dashboard/stat-tile';

export const metadata: Metadata = { title: copy.nav.dashboard };

const c = copy.dashboard;

/** Where the sidebar's shortcuts point. Data-driven so the list is one edit. */
const QUICK_LINKS = [
  { href: '/courses', label: c.linkCourses },
  { href: '/essentials', label: c.linkEssentials },
  { href: '/settings/devices', label: c.linkDevices },
] as const;

/**
 * Everything the four stat tiles show, derived from the ONE dashboard payload
 * the API already returns. No second endpoint and no extra columns: the totals
 * are sums over `enrolledCourses`, and the average is over `recentScores`.
 *
 * Overall progress is `completed / total` across every course, NOT the mean of
 * the per-course percentages. A student two lessons into a 40-lesson course and
 * finished with a 2-lesson one is 10% done, not 52% — averaging the percentages
 * lets a tiny course drag the headline number around.
 */
function summarise(dashboard: Dashboard) {
  const completedLessons = dashboard.enrolledCourses.reduce((n, x) => n + x.completedLessons, 0);
  const totalLessons = dashboard.enrolledCourses.reduce((n, x) => n + x.totalLessons, 0);
  const overallPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

  const averageScore =
    dashboard.recentScores.length === 0
      ? null
      : Math.round(
          dashboard.recentScores.reduce((n, x) => n + x.scorePercent, 0) /
            dashboard.recentScores.length,
        );

  return { completedLessons, totalLessons, overallPercent, averageScore };
}

/** First word of the full name — "أهلًا أحمد محمود إبراهيم" greets nobody. */
function firstName(fullName: string | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

/**
 * The student's home screen: who they are, where they stopped, what they are
 * enrolled in, and how they are scoring.
 *
 * Both requests are authenticated Server-Component fetches with no dependency
 * on each other, so they are issued together — awaiting them in sequence would
 * make the page wait for the sum of two round-trips to render a greeting.
 */
export default async function DashboardPage() {
  const [dashboard, me] = await Promise.all([
    apiGetAuthed('/api/me/dashboard', DashboardSchema),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
  ]);

  const { completedLessons, totalLessons, overallPercent, averageScore } = summarise(dashboard);
  const name = firstName(me.profile?.fullName);
  const hasCourses = dashboard.enrolledCourses.length > 0;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <header className="mb-8">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">
          {name ? c.greeting.replace('{name}', name) : c.greetingFallback}
        </h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          icon={<BookOpen className="size-4" />}
          value={dashboard.enrolledCourses.length}
          label={c.statCourses}
        />
        <StatTile
          icon={<Layers className="size-4" />}
          value={completedLessons}
          suffix={totalLessons > 0 ? `/ ${totalLessons}` : undefined}
          label={c.statLessonsDone}
        />
        <StatTile
          icon={<GaugeCircle className="size-4" />}
          value={overallPercent}
          suffix="%"
          label={c.statOverall}
        />
        <StatTile
          icon={<Target className="size-4" />}
          value={averageScore ?? c.statNoScores}
          suffix={averageScore === null ? undefined : '%'}
          label={c.statAverage}
        />
      </section>

      {dashboard.continueWatching ? (
        <section className="mb-8">
          <ContinueWatchingCard item={dashboard.continueWatching} />
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium text-fg">
            {c.myCourses}
          </h2>

          {hasCourses ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {dashboard.enrolledCourses.map((course) => (
                <EnrolledCourseCard key={course.id} course={course} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-10 text-center">
              <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.emptyTitle}</p>
              <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
                {c.emptyBody}
              </p>
              <Link
                href="/courses"
                className={cn(
                  'mt-5 inline-flex h-10 items-center rounded-sm bg-accent px-4',
                  'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                  'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
                )}
              >
                {c.browseCourses}
              </Link>
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section>
            <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium text-fg">
              {c.recentScores}
            </h2>
            <RecentScores scores={dashboard.recentScores} />
          </section>

          <section>
            <h2 className="mb-4 text-[length:var(--fs-title-3)] font-medium text-fg">
              {c.quickLinks}
            </h2>
            <ul className="overflow-hidden rounded-lg border border-line bg-surface-2">
              {QUICK_LINKS.map((link) => (
                <li key={link.href} className="border-b border-line-subtle last:border-b-0">
                  <Link
                    href={link.href}
                    className={cn(
                      'block px-4 py-3 text-[length:var(--fs-text-sm)] text-fg',
                      'transition-colors duration-[160ms] ease-out hover:bg-surface-3',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
