import type { Metadata } from 'next';
import Link from 'next/link';
import { ProfileMeSchema, StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getDashboard } from '@/lib/dashboard';
import { achievementsFor, earnedCount } from '@/lib/achievements';
import {
  firstName,
  hasOutstandingSteps,
  recommendedCourses,
  startHereSteps,
  summarise,
} from '@/lib/dashboard-view';
import { identityOf } from '@/lib/library';
import { getMasteryOrNull } from '@/lib/mastery';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { getSession } from '@/lib/session';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { xpFor } from '@/lib/xp';
import { Achievements } from '@/components/dashboard/achievements';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { EnrolledCoursesTabs } from '@/components/dashboard/enrolled-courses-tabs';
import { ExamsSection } from '@/components/dashboard/exams-section';
import { MasteryCard } from '@/components/dashboard/mastery-card';
import { PendingExamsCard } from '@/components/dashboard/pending-exams-card';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { StatsRow } from '@/components/dashboard/stats-row';
import { InstructorMessageCard } from '@/components/dashboard/instructor-message-card';
import { StartHereCard } from '@/components/dashboard/start-here-card';
import { TipOfDayCard } from '@/components/dashboard/tip-of-day-card';
import { WhatsappChannelCard } from '@/components/dashboard/whatsapp-channel-card';
import { LibraryCourseCard } from '@/components/library/library-course-card';

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
  const [dashboard, me, quizzes, taxonomy, session, mastery, settings, catalog] = await Promise.all([
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
    /*
     * CACHED PER REQUEST and allowed to fail — see `lib/mastery.ts` for both,
     * and in particular for why it is React's `cache()` rather than the
     * `'use cache'` the taxonomy read directly above uses. The two files look
     * alike and the difference is load-bearing: taxonomy is unauthenticated
     * and identical for every student, this is one student's own marks.
     *
     * It makes this page's SIXTH parallel API call, against the `short`
     * throttle of 10 per second. That is headroom, not comfort — which is
     * exactly why the card, and not the page, is what degrades.
     */
    getMasteryOrNull(),
    /*
     * The WhatsApp channel URL, for the band at the top.
     *
     * It does NOT make this a seventh per-view request: `'use cache'` +
     * `cacheLife('hours')` means the API is asked once an hour for the whole
     * site, and every dashboard render in between is served from the cache.
     * That distinction is the entire reason the taxonomy read above was moved
     * onto the same helper after the rate limiter started answering 429.
     *
     * `…OrDefaults` rather than `getPublicSettings()`: a settings read that
     * throws must not take the home screen down for a band that is decoration
     * to a student mid-course. It returns an empty contact block instead, and
     * the card renders nothing.
     */
    getPublicSettingsOrDefaults(),
    /*
     * The public catalog, `'use cache'` + `cacheLife('minutes')` and allowed
     * to fail — see `getCatalogOrEmpty`. Feeds the «كورسات في مسارك» rail
     * below; a miss here means that rail is simply absent, same as a student
     * with no identity yet, never a broken dashboard.
     */
    getCatalogOrEmpty(),
  ]);

  /*
   * `totalLessons` is deliberately not taken. It was the denominator on the
   * «دروس خلصتها» tile («12 / 40») and the tile's meter; the band prints the
   * count alone, because a fraction and a percentage of the same thing
   * («إجمالي تقدّمك», the ring) side by side is the duplication this pass
   * removed. `summarise` still computes it — `/results` and `/profile` use it.
   */
  const { completedLessons, overallPercent, averageScore, learningHours } = summarise(dashboard);
  const name = firstName(me.profile?.fullName);
  const hasCourses = dashboard.enrolledCourses.length > 0;

  const identity = identityOf(me, taxonomy);
  const recommended = recommendedCourses({
    courses: catalog.courses,
    identity,
    enrolledCourseIds: new Set(dashboard.enrolledCourses.map((course) => course.id)),
  });
  const badges = achievementsFor({
    dashboard,
    summary: quizzes.summary,
    completedLessons,
  });

  /*
   * XP — computed live, from data already on this page. No fetch, no store:
   * see `lib/xp.ts` for why. `completedCourseCount` reuses the exact
   * `completedLessons >= totalLessons` predicate `achievementsFor`'s own
   * «كورس كامل» marker uses (see that file's own note on why NOT
   * `course.progressPercent` — a separately-written column observed stuck
   * stale on a real account) — the ring, this count and the badge all have
   * to agree on what "finished" means, or XP and the achievement it should
   * unlock alongside would disagree with each other.
   */
  const completedCourseCount = dashboard.enrolledCourses.filter(
    (course) => course.totalLessons > 0 && course.completedLessons >= course.totalLessons,
  ).length;
  const xp = xpFor({
    completedLessons,
    passedQuizCount: quizzes.summary.passedCount,
    completedCourseCount,
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
        courseCount={dashboard.enrolledCourses.length}
        completedLessons={completedLessons}
        averageScore={averageScore}
      />

      {/*
        FIRST, above even the channel band — and only when something is
        actually waiting, which is most days not at all.

        A message from the instructor addressed to this student by name
        outranks every standing block on the page for as long as it is unread,
        and it stops existing the moment they read it. See the component for
        why it is a card at all when the message is already in the widget.
      */}
      <InstructorMessageCard />

      {/*
        ABOVE the hero slot, and the only block on the page that points off it.
        See the component for why it is green rather than amber, and why it
        does not compete with the one primary action below.
      */}
      <WhatsappChannelCard href={settings.contact.whatsappChannel} />

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
        XP, learning hours, badges earned — three `.tile`s, and «نصيحة اليوم»
        beside them. Stacked rather than laid out with `.dash-split`: unlike
        the mastery/courses pair below, neither block here is the page's
        primary content, so the simpler single-column stack every other
        section on this page already uses is the right call — see
        `StatsRow`/`TipOfDayCard` for what each figure is built from.
      */}
      <div className="mb-4">
        <StatsRow xp={xp} learningHours={learningHours} badgesEarned={earnedCount(badges)} />
      </div>
      <div className="mb-6">
        <TipOfDayCard />
      </div>

      {/*
        «إنجازاتك», moved UP to sit beside the stats row rather than dead last
        at the foot of the page.

        It used to close the page on the argument that a rewards strip between
        "fix this" and "your courses" would interrupt the only run of the page
        that is about acting — which was right when nothing above it said
        anything positive either. That is no longer true: the stats row three
        lines up already opens with a count of what has been EARNED (XP,
        hours, badges), so grouping «إنجازاتك» with it rather than with
        «امتحاناتك» at the bottom keeps every "what you have done" block in one
        place instead of splitting it across the top and the foot of the page.
      */}
      <div className="mb-8">
        <Achievements achievements={badges} earned={earnedCount(badges)} />
      </div>

      {/*
        «امتحانات في انتظارك» — a course that is genuinely finished with its
        exam sitting there untouched. See `PendingExamsCard` for why this is
        not a duplicate of «امتحاناتك» below: that section is every exam a
        student HAS sat, this is the exams they have not. Absent entirely when
        there is nothing waiting, which is most days.
      */}
      {dashboard.pendingExams.length > 0 ? (
        <div className="mb-8">
          <PendingExamsCard exams={dashboard.pendingExams} />
        </div>
      ) : null}

      {/*
        «ذاكر ده» — the page's answer to "what should I work on", and the only
        block on it that names a CAUSE rather than a quantity.

        It takes the row four `StatTile`s used to occupy. Those went for two
        reasons. The first is arithmetic: «إجمالي تقدّمك» was `overallPercent`,
        the same number `DashboardHero`'s ring draws six inches above it — one
        figure, printed twice. The second is that `/results`, `/profile` and
        `/quizzes/[lessonId]` ALL open with that identical four-tile row, so
        the home screen looked like the three report screens. The component is
        untouched and still serves those three; only this usage is gone, and
        the three figures worth keeping now sit on the band.

        `null` when the read failed, and the card is simply absent then — see
        `lib/mastery.ts`. This is an enhancement to a screen that was complete
        without it, and this page has been taken down once already by an added
        read that threw.
      */}
      {/*
        «ذاكر ده» beside «كورساتي» rather than stacked above it, from `lg` up
        — see `.dash-split` in study.css. Below `lg` (and whenever mastery
        failed to load) they fall back to the plain single-column stack.
      */}
      <div className={mastery ? 'dash-split mb-8' : 'mb-8'}>
        {mastery ? (
          <section className="dash-split__side">
            <MasteryCard mastery={mastery} />
          </section>
        ) : null}

        <section className={mastery ? 'dash-split__main' : undefined}>
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
            <EnrolledCoursesTabs
              courses={dashboard.enrolledCourses}
              vodafoneCash={settings.contact.vodafoneCash}
            />
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
      </div>

      {/*
        «كورسات في مسارك» — every published course in this student's own
        (year, track) cell they have not enrolled in yet. Absent entirely
        when there is nothing to show: no identity, or already enrolled in
        everything their track offers — see `recommendedCourses`.

        Full width and right under «كورساتي», not tucked into a rail: this is
        the page's answer to "what am I missing", and a student is meant to
        see it without scrolling past marks and achievements first.
      */}
      {recommended.length > 0 ? (
        <div className="mb-8">
          <div className="group-head">
            <span className="group-head__mark" aria-hidden="true" />
            <h2 className="group-head__title">{c.recommended}</h2>
            <Link href="/library" className="group-head__count hover:text-accent-text">
              {c.recommendedSeeAll}
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recommended.map((course) => (
              <LibraryCourseCard course={course} key={course.id} />
            ))}
          </ul>
        </div>
      ) : null}

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
