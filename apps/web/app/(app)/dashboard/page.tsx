import type { Metadata } from 'next';
import { ProfileMeSchema, StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { apiGetAuthed } from '@/lib/api-server';
import { getDashboard } from '@/lib/dashboard';
import { achievementsFor, earnedCount } from '@/lib/achievements';
import { firstName, hasOutstandingSteps, startHereSteps, summarise } from '@/lib/dashboard-view';
import { identityOf } from '@/lib/library';
import { getMasteryOrNull } from '@/lib/mastery';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { getSession } from '@/lib/session';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { Achievements } from '@/components/dashboard/achievements';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { ExamsSection } from '@/components/dashboard/exams-section';
import { MasteryCard } from '@/components/dashboard/mastery-card';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { InstructorMessageCard } from '@/components/dashboard/instructor-message-card';
import { StartHereCard } from '@/components/dashboard/start-here-card';
import { WhatsappChannelCard } from '@/components/dashboard/whatsapp-channel-card';

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
  const [dashboard, me, quizzes, taxonomy, session, mastery, settings] = await Promise.all([
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
  ]);

  /*
   * `totalLessons` is deliberately not taken. It was the denominator on the
   * «دروس خلصتها» tile («12 / 40») and the tile's meter; the band prints the
   * count alone, because a fraction and a percentage of the same thing
   * («إجمالي تقدّمك», the ring) side by side is the duplication this pass
   * removed. `summarise` still computes it — `/results` and `/profile` use it.
   */
  const { completedLessons, overallPercent, averageScore } = summarise(dashboard);
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
      {mastery ? (
        <section className="mb-8">
          <MasteryCard mastery={mastery} />
        </section>
      ) : null}

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

      {/*
        «إنجازاتك», last — and this is a REVERSAL of where the rebuild put it.

        It used to sit above «كورساتي», on the argument that everything below
        it described work outstanding, so a student should meet what they had
        already done first. That was right for a page with no other positive
        block on it, and it is no longer that page: the mastery card's
        «متمكّن في» line and its all-clear state carry that job at the TOP now,
        where a student actually starts reading.

        What the old position cost was worse than what it bought. A rewards
        strip between "fix this" and "your courses" interrupts the only run of
        the page that is about acting. The order now reads: what to do now →
        what to fix → your work → your marks → what you have earned.
      */}
      <div className="mt-8">
        <Achievements achievements={badges} earned={earnedCount(badges)} />
      </div>
    </main>
  );
}
