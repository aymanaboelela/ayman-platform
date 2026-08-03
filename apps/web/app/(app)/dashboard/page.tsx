import Link from 'next/link';
import type { Metadata } from 'next';
import { BookOpen, GaugeCircle, Layers, Target } from 'lucide-react';
import { ProfileMeSchema, copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { getDashboard } from '@/lib/dashboard';
import { firstName, hasOutstandingSteps, startHereSteps, summarise } from '@/lib/dashboard-view';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { RecentScores } from '@/components/dashboard/recent-scores';
import { StartHereCard } from '@/components/dashboard/start-here-card';
import { StatTile } from '@/components/dashboard/stat-tile';

export const metadata: Metadata = { title: copy.nav.dashboard };

const c = copy.dashboard;

/** Where the aside's shortcuts point. Data-driven so the list is one edit. */
const QUICK_LINKS = [
  { href: '/courses', label: c.linkCourses },
  { href: '/essentials', label: c.linkEssentials },
  { href: '/settings/devices', label: c.linkDevices },
] as const;

/**
 * The student's home screen: who they are, what to do next, what they are
 * enrolled in, and how they are scoring.
 *
 * ## One primary action
 *
 * The rebuild is organised around a single rule the previous version broke:
 * exactly ONE element on the page is the primary action. Before, four stat
 * tiles with accent-tinted icon chips, a resume card and two dashed empty
 * boxes all competed at equal weight, and a brand-new student — four zeros and
 * two empty states — was given nothing to press at all.
 *
 * Now the top of the page is either the resume card or the first-run card, and
 * whichever it is owns the only accent-filled button on the screen. The stat
 * tiles went quiet to make room (see `stat-tile.tsx`), and the two dashed boxes
 * became one designed object.
 *
 * ## Data
 *
 * Both requests are authenticated Server-Component fetches with no dependency
 * on each other, so they are issued together — awaiting them in sequence would
 * make the page wait for the sum of two round-trips to render a greeting.
 * `getDashboard` is `cache()`-wrapped, so the rail's course list (rendered
 * from the layout, in its own Suspense boundary) shares this exact request
 * rather than issuing a second one.
 */
export default async function DashboardPage() {
  const [dashboard, me] = await Promise.all([
    getDashboard(),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
  ]);

  const { completedLessons, totalLessons, overallPercent, averageScore } = summarise(dashboard);
  const name = firstName(me.profile?.fullName);
  const hasCourses = dashboard.enrolledCourses.length > 0;

  const steps = startHereSteps(dashboard);
  const showSteps = hasOutstandingSteps(steps);
  const resume = dashboard.continueWatching;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="eyebrow mb-2 text-fg-muted">{c.eyebrow}</p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">
          {name ? c.greeting.replace('{name}', name) : c.greetingFallback}
        </h1>
        <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{c.subtitle}</p>
      </header>

      {/*
        The hero slot. Resume wins it whenever there is something to resume —
        a returning student's one reason to be here — and the first-run card
        takes it otherwise. When BOTH apply (a student mid-course who has yet
        to sit a quiz) the steps card renders below in its `plain` tone, so
        the page still has exactly one accent-tinted surface.
      */}
      {resume ? (
        <section className="mb-6">
          <ContinueWatchingCard item={resume} />
        </section>
      ) : null}

      {showSteps ? (
        <section className="mb-6">
          <StartHereCard steps={steps} tone={resume ? 'plain' : 'hero'} />
        </section>
      ) : null}

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
          meterPercent={totalLessons > 0 ? (completedLessons / totalLessons) * 100 : undefined}
        />
        <StatTile
          icon={<GaugeCircle className="size-4" />}
          value={overallPercent}
          suffix="%"
          label={c.statOverall}
          meterPercent={overallPercent}
        />
        <StatTile
          icon={<Target className="size-4" />}
          value={averageScore ?? c.statNoScores}
          suffix={averageScore === null ? undefined : '%'}
          label={c.statAverage}
        />
      </section>

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
            /*
              Deliberately quiet, and deliberately NOT a second call to action:
              a student with no courses is already looking at the first-run
              card above, whose step 1 is this exact link with an accent
              button on it. Two competing "اختار كورس" buttons on one screen
              is the pattern this rebuild exists to remove.
            */
            <p className="rounded-lg border border-dashed border-line bg-surface-2 px-5 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
              {c.noCoursesYet}
            </p>
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
