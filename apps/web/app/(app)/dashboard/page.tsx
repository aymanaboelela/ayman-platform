import Link from 'next/link';
import type { Metadata } from 'next';
import { BookOpen, GaugeCircle, Layers, Target } from 'lucide-react';
import { ProfileMeSchema, StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { getDashboard } from '@/lib/dashboard';
import { firstName, hasOutstandingSteps, startHereSteps, summarise } from '@/lib/dashboard-view';
import { ChevronForward } from '@/components/player/icons';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { ExamsSection } from '@/components/dashboard/exams-section';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { RecentScores } from '@/components/dashboard/recent-scores';
import { StartHereCard } from '@/components/dashboard/start-here-card';
import { StatTile } from '@/components/dashboard/stat-tile';

export const metadata: Metadata = { title: copy.nav.dashboard };

const c = copy.dashboard;

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
 * whichever it is owns the only accent-filled button on the screen.
 *
 * ## The stage, and why it does not compete with that
 *
 * The greeting sits on the page's one `.stage` — the violet band described in
 * `study.css`. This is the screen a student opens every single day, and it was
 * the flattest thing in the product: an eyebrow, a name, a sentence, all in
 * neutral on neutral. A band gives the page a top edge to start from.
 *
 * It does not steal the primary action because it is the WRONG COLOUR to be
 * one. Violet is structure here and nowhere is it pressable; the resume card
 * directly underneath is the only amber surface. A student who has learned
 * "orange is what you press" reads the band as the room and the card as the
 * door — which is the entire point of splitting the two hues.
 *
 * Exactly one stage per page: a second band would make neither the top of
 * anything.
 *
 * ## Data
 *
 * All three requests are authenticated Server-Component fetches with no
 * dependency on each other, so they are issued together — awaiting them in
 * sequence would make the page wait for the sum of three round-trips to render
 * a greeting.
 * `getDashboard` is `cache()`-wrapped, so the rail's course list (rendered
 * from the layout, in its own Suspense boundary) shares this exact request
 * rather than issuing a second one.
 */
export default async function DashboardPage() {
  const [dashboard, me, quizzes] = await Promise.all([
    getDashboard(),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
    apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema),
  ]);

  const { completedLessons, totalLessons, overallPercent, averageScore } = summarise(dashboard);
  const name = firstName(me.profile?.fullName);
  const hasCourses = dashboard.enrolledCourses.length > 0;

  const steps = startHereSteps(dashboard);
  const showSteps = hasOutstandingSteps(steps);
  const resume = dashboard.continueWatching;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      {/* Still a `<header>`, as it was before the band: inside `<main>` it maps
          to no landmark at all, so this is pure document semantics and cannot
          collide with the site banner the shell already owns. */}
      <header className="stage mb-6">
        <div className="stage__body">
          <p className="stage__eyebrow">{c.eyebrow}</p>
          <h1 className="stage__title">
            {name ? c.greeting.replace('{name}', name) : c.greetingFallback}
          </h1>
          <p className="stage__sub">{c.subtitle}</p>
        </div>
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

      {/*
        Three violet wells and one amber. The amber is on «إجمالي تقدّمك»
        because that is the number the student is actually moving — the other
        three describe the shape of their library, which is structure, which is
        violet. Four accent wells was the previous version of this row and it
        is why the tiles shouted louder than the resume card above them.
      */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          icon={<BookOpen className="size-5" />}
          value={dashboard.enrolledCourses.length}
          label={c.statCourses}
        />
        <StatTile
          icon={<Layers className="size-5" />}
          value={completedLessons}
          suffix={totalLessons > 0 ? `/ ${totalLessons}` : undefined}
          label={c.statLessonsDone}
          meterPercent={totalLessons > 0 ? (completedLessons / totalLessons) * 100 : undefined}
        />
        <StatTile
          icon={<GaugeCircle className="size-5" />}
          value={overallPercent}
          suffix="%"
          label={c.statOverall}
          meterPercent={overallPercent}
          accent
        />
        <StatTile
          icon={<Target className="size-5" />}
          value={averageScore ?? c.statNoScores}
          suffix={averageScore === null ? undefined : '%'}
          label={c.statAverage}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section>
          {/* `.group-head` — the violet mark is what turns a page of stacked
              lists into a page of named sections. The count is
              `copy.library.courseCount`, the one «{n} كورس» string in the
              table; the dashboard has no count string of its own and adding a
              duplicate would mean two keys that must be translated the same
              way forever. */}
          <div className="group-head">
            <span className="group-head__mark" aria-hidden="true" />
            <h2 className="group-head__title">{c.myCourses}</h2>
            {hasCourses ? (
              <span className="group-head__count">
                {copy.library.courseCount.replace(
                  '{n}',
                  String(dashboard.enrolledCourses.length),
                )}
              </span>
            ) : null}
          </div>

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

              Violet-tinted rather than a dashed neutral box. An empty state is
              a container waiting to be filled, which is structure — and a
              dashed grey rectangle is indistinguishable from something that
              failed to load.
            */
            <p className="rounded-lg border border-study-line bg-study-tint px-5 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
              {c.noCoursesYet}
            </p>
          )}
        </section>

        {/*
          The "روابط سريعة" list that used to sit under the scores is gone.

          It was three links — كل الكورسات, مسار التأسيس, أجهزتي — and the rail
          this slice introduced now carries all three permanently, on every
          screen. Keeping both left the dashboard restating the navigation
          that is already four inches to the right of it, which is how a page
          ends up feeling busy without carrying more information.

          `scoresAll` in the copy table is likewise unused for now; it is the
          "see every result" link this aside will grow once /results has
          per-attempt filtering. It is left in place rather than deleted so
          the wording is already settled when it does.
        */}
        <aside>
          <section>
            {/* No count on this one: the card underneath is capped at five and
                already says «آخر خمس نتائج» over the strip. A number here
                would be the same fact a third time. */}
            <div className="group-head">
              <span className="group-head__mark" aria-hidden="true" />
              <h2 className="group-head__title">{c.recentScores}</h2>
            </div>

            <RecentScores scores={dashboard.recentScores} />
            <Link
              href="/results"
              className={cn(
                'mt-3 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)]',
                'text-accent-text transition-colors duration-[160ms] ease-out hover:underline',
              )}
            >
              {c.scoresAll}
              <ChevronForward />
            </Link>
          </section>
        </aside>
      </div>

      {/*
        Full width, and below the grid rather than inside the rail.

        Every row here ends in its own action — «راجع إجاباتك», or «ادخل امتحان
        التحسين» on the one exam that still has a sitting waiting — and an
        action needs room to sit beside a title and a verdict. In the 20rem
        rail it would have wrapped to three lines per row.

        This deliberately does NOT replace «آخر النتائج» above it: that strip
        answers "how am I trending" across attempts, and this answers "which
        exams are outstanding, and what do I press". Two questions, two
        objects.
      */}
      <div className="mt-8">
        <ExamsSection quizzes={quizzes.quizzes} />
      </div>
    </main>
  );
}
