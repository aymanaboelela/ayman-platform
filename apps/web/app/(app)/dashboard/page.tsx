import type { Metadata } from 'next';
import { BookOpen, GaugeCircle, Layers, Target } from 'lucide-react';
import { ProfileMeSchema, StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { getDashboard } from '@/lib/dashboard';
import { achievementsFor, earnedCount } from '@/lib/achievements';
import { firstName, hasOutstandingSteps, startHereSteps, summarise } from '@/lib/dashboard-view';
import { identityOf } from '@/lib/library';
import { getSession } from '@/lib/session';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { Achievements } from '@/components/dashboard/achievements';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { ExamsSection } from '@/components/dashboard/exams-section';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { StartHereCard } from '@/components/dashboard/start-here-card';
import { StatTile } from '@/components/dashboard/stat-tile';

export const metadata: Metadata = { title: copy.nav.dashboard };

const c = copy.dashboard;

/**
 * The student's home screen: who they are, what to do next, what they are
 * enrolled in, what they have earned, and how they are scoring.
 *
 * ## One primary action
 *
 * The page is organised around a rule an earlier version broke: exactly ONE
 * element is the primary action. Before, four stat tiles with accent-tinted
 * chips, a resume card and two dashed empty boxes all competed at equal weight,
 * and a brand-new student — four zeros and two empty states — was given nothing
 * to press at all.
 *
 * The top of the page is either the resume card or the first-run card, and
 * whichever it is owns the only accent-filled button on the screen.
 *
 * ## The band, and why it does not compete with that
 *
 * `.dash-hero` is ember, and ember is structure. Nowhere on it is pressable;
 * the resume card directly underneath is the only amber surface. A student who
 * has learned "orange is what you press" reads the band as the room and the
 * card as the door — which is the entire point of splitting the two hues.
 *
 * The one amber thing ON the band is the progress ring's arc, which is amber in
 * its OTHER sense: where you are. `LessonProgressBar`, the path map and the
 * runner's meter all use it that way.
 *
 * ## What this pass added, and the complaint it answers
 *
 * The screen was reported as «مصمطة … مافيش روح» — flat, and with nobody on it.
 * Three things were true and all three are fixed here:
 *
 *   · the student was NOWHERE on their own home screen. No portrait, no year,
 *     no school. The band now opens with all three (`DashboardHero`).
 *   · every course rendered as a grey rectangle, because almost none has an
 *     uploaded cover. They carry generated artwork now (`CourseArt`), which is
 *     most of the colour on the page.
 *   · nothing said what a student had ACHIEVED — every block on the page
 *     described what was outstanding. `Achievements` is the one that does not.
 *
 * ## Data
 *
 * Four authenticated/cached Server-Component reads with no dependency on each
 * other, so they are issued together — awaiting them in sequence would make the
 * page wait for the sum of four round-trips to render a greeting.
 * `getDashboard` and `getSession` are both `cache()`-wrapped, so the rail's
 * course list and the topbar's avatar (rendered from the layout, in their own
 * Suspense boundaries) share these exact requests rather than issuing more.
 *
 * `/api/taxonomy` is the one addition, and it is the same shared, unauthed read
 * `/library`, onboarding and the admin panel already make — it is what turns
 * the profile's `year` and `trackId` into the labels the band prints.
 */
export default async function DashboardPage() {
  const [dashboard, me, quizzes, taxonomy, session] = await Promise.all([
    getDashboard(),
    apiGetAuthed('/api/profile/me', ProfileMeSchema),
    apiGetAuthed('/api/me/quizzes', StudentQuizHistorySchema),
    /*
     * CACHED, and allowed to fail — see `lib/taxonomy.ts` for both.
     *
     * The first version of this line was a bare `apiGet('/api/taxonomy', …)`,
     * copied from `/library`. That page a student opens a few times a term;
     * this one they land on after every login and return to between lessons, so
     * the same call became a per-view request on the API's busiest path and the
     * rate limiter started answering 429 — which `apiGet` throws on, which took
     * the whole dashboard down with «This page couldn't load».
     *
     * All it decides is whether the band prints «الصف الثالث الثانوي» beside
     * the greeting. `identityOf(me, null)` renders the band without chips,
     * which is already the state a student who never chose a year produces.
     */
    getTaxonomyOrNull(),
    getSession(),
  ]);

  const { completedLessons, totalLessons, overallPercent, averageScore } = summarise(dashboard);
  const name = firstName(me.profile?.fullName);
  const hasCourses = dashboard.enrolledCourses.length > 0;

  const identity = identityOf(me, taxonomy);
  const badges = achievementsFor({
    dashboard,
    summary: quizzes.summary,
    completedLessons,
  });

  const steps = startHereSteps(dashboard);
  const showSteps = hasOutstandingSteps(steps);
  const resume = dashboard.continueWatching;
  const resumeCourse = resume
    ? dashboard.enrolledCourses.find((course) => course.id === resume.courseId)
    : undefined;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <DashboardHero
        // `session` is null only in the torn-session case `AccountMenu`
        // documents — `proxy.ts` has already redirected the navigation by then.
        // The profile's own name is the better fallback either way: it is what
        // the student typed during onboarding, while `session.name` can still
        // be whatever Google supplied.
        name={me.profile?.fullName ?? session?.name ?? ''}
        image={session?.image ?? null}
        greetingName={name}
        yearLabel={identity?.yearLabelAr ?? null}
        trackLabel={identity?.trackLabelAr ?? null}
        schoolName={me.profile?.schoolName ?? null}
        overallPercent={overallPercent}
      />

      {/*
        The hero slot. Resume wins it whenever there is something to resume —
        a returning student's one reason to be here — and the first-run card
        takes it otherwise. When BOTH apply (a student mid-course who has yet
        to sit a quiz) the steps card renders below in its `plain` tone, so
        the page still has exactly one accent-tinted surface.
      */}
      {resume ? (
        <section className="mb-6">
          <ContinueWatchingCard
            item={resume}
            // The resume target's own course, out of the payload already on
            // screen — see the card for why the artwork is not on
            // `ContinueWatchingSchema` itself, and why a miss is survivable.
            coverKey={resumeCourse?.coverKey ?? null}
            subjectNameAr={resumeCourse?.subjectNameAr ?? null}
          />
        </section>
      ) : null}

      {showSteps ? (
        <section className="mb-6">
          <StartHereCard steps={steps} tone={resume ? 'plain' : 'hero'} />
        </section>
      ) : null}

      {/*
        Four tiles, four hues on the wells — and the hues are the whole reason
        this row is legible at a glance now. Four ember wells in a row is one
        grey block with four numbers in it; the eye cannot tell them apart, so
        it reads none of them. See `.tile--hued` in `study.css` for why colour
        on a well does not damage "orange is what you press".

        «إجمالي تقدّمك» keeps the amber `accent` well instead, because that is
        the number the student is actually moving — the other three describe the
        shape of their library.
      */}
      <section className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          icon={<BookOpen className="size-5" />}
          value={dashboard.enrolledCourses.length}
          label={c.statCourses}
          hue={225}
        />
        <StatTile
          icon={<Layers className="size-5" />}
          value={completedLessons}
          suffix={totalLessons > 0 ? `/ ${totalLessons}` : undefined}
          label={c.statLessonsDone}
          meterPercent={totalLessons > 0 ? (completedLessons / totalLessons) * 100 : undefined}
          hue={165}
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
          hue={295}
        />
      </section>

      {/* «إنجازاتك» before «كورساتي», and the order is the argument: everything
          below this point is work outstanding, and a student should meet what
          they have already done first. It is also the block that has something
          to show on day one, when the course grid is an empty state. */}
      <div className="mb-8">
        <Achievements achievements={badges} earned={earnedCount(badges)} />
      </div>

      <section>
        {/* `.group-head` — the ember mark is what turns a page of stacked
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
              {copy.library.courseCount.replace('{n}', String(dashboard.enrolledCourses.length))}
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

            Ember-tinted rather than a dashed neutral box. An empty state is
            a container waiting to be filled, which is structure — and a
            dashed grey rectangle is indistinguishable from something that
            failed to load.
          */
          <div className="empty">
            <SpotIllustration name="courses" />
            <p className="empty__body">{c.noCoursesYet}</p>
          </div>
        )}
      </section>

      {/*
        «امتحاناتك» — full width, and the dashboard's ONLY account of marks.

        There was a second one: an «آخر النتائج» strip in a right-hand rail,
        five percentages with nothing to press. It went, and this replaced it
        rather than joining it. Both answered "how did I do", which on one
        screen is one question — and the strip answered it worse: no verdict,
        no sense of what is outstanding, and nowhere to go. `/results` is
        still one link away for the full history and the trend.

        Full width because every row ends in its own action — «راجع إجاباتك»,
        or «ادخل امتحان التحسين» on the one exam that still has a sitting
        waiting — and an action needs room beside a title and a verdict. In
        the 20rem rail it wrapped to three lines per row.

        Losing the rail also gives «كورساتي» the whole width, which is what
        the course cards wanted the moment they gained their cover art.
      */}
      <div className="mt-8">
        <ExamsSection quizzes={quizzes.quizzes} />
      </div>
    </main>
  );
}
