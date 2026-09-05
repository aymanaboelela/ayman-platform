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
import { getBookCatalogOrEmpty } from '@/lib/books';
import { getSession } from '@/lib/session';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { xpFor } from '@/lib/xp';
import { Achievements } from '@/components/dashboard/achievements';
import { AsideBlock } from '@/components/dashboard/aside-block';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { ExamsSection } from '@/components/dashboard/exams-section';
import { BooksSection } from '@/components/dashboard/books-section';
import { MasteryCard } from '@/components/dashboard/mastery-card';
import { PendingExamsCard } from '@/components/dashboard/pending-exams-card';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { NextUpBlock } from '@/components/dashboard/next-up-block';
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
  const [dashboard, me, quizzes, taxonomy, session, mastery, settings, catalog, bookCatalog] =
    await Promise.all([
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
    /*
     * The book catalogue: the delivery fee «اطلب الكتاب» quotes on an enrolled
     * course's card, AND the covers «الكتب» renders at the foot of the page.
     *
     * `getBookCatalogOrEmpty` rather than `getBookShippingCents`, which is a
     * wrapper that reads exactly this and throws the shelves away. Calling both
     * would not cost a second request — they share one `'use cache'` entry on
     * one coarse tag — but it would mean two names for one value on one page,
     * and the wrapper exists for the three surfaces that genuinely want only
     * the number.
     *
     * Not a ninth per-view request against the `short` throttle this page's own
     * comments keep counting: cached, and shared with `/books` and every course
     * page.
     */
    getBookCatalogOrEmpty(),
  ]);

  /*
   * `totalLessons` is deliberately not taken. It was the denominator on the
   * «دروس خلصتها» tile («12 / 40») and the tile's meter; the band prints the
   * count alone, because a fraction and a percentage of the same thing
   * («إجمالي تقدّمك», the ring) side by side is the duplication this pass
   * removed. `summarise` still computes it — `/results` and `/profile` use it.
   */
  const { completedLessons, overallPercent, averageScore, learningSeconds } = summarise(dashboard);
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
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
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
        // «مواعيد المحاضرات» — the band picks the courses that carry a
        // `scheduleNote` out of this itself (`scheduleLines`), rather than the
        // page pre-filtering, so the rule sits next to the markup that depends
        // on it. Passing the array costs nothing: it is the same one the cards
        // below already render from.
        courses={dashboard.enrolledCourses}
      />

      {/* «ناقصك كده وتخلص» — the band above states the percentage, this states
          what to do about it. Directly under the hero because those two are one
          thought: «عاوز يبقى فيه حاجة تحت… أعرف اللي ناقصني وأضبطها».
          `showRing={false}` — the band's own 104px ring is right there, and a
          second ring with the same number in it reads as a second measurement.
          At 100% this is where the celebration lands. */}
      <NextUpBlock
        dashboard={dashboard}
        percent={overallPercent}
        greetingName={name}
        showRing={false}
      />

      {/*
        FULL WIDTH, above the split — and only when something is actually
        waiting, which is most days not at all.

        A message from the instructor addressed to this student by name
        outranks every standing block on the page for as long as it is unread,
        and it stops existing the moment they read it. Putting it in the aside
        with the other "not your own work" blocks would be the one case where
        that grouping is wrong: it IS addressed to them.
      */}
      <InstructorMessageCard />

      {/*
        ## Two columns, and what decides which side a block goes to

        Reported with a screenshot of a dashboard that was one long ribbon of
        full-width rows: «إنت بتهدسلي كله تحت بعض… أنا عايز يبقى حاجات على
        الجنب وحاجات في النص». Every block had the same width and therefore the
        same weight, so «قناة الواتساب» and «نصيحة اليوم» — neither of which is
        the student's own work — sat between the resume card and their courses
        at exactly the size of the thing they were interrupting.

        The rule the split encodes: **the main column is the student's work**
        (what to resume, what they are enrolled in, what to take next, how they
        did, the book) **and the aside is everything about them or around them**
        (the channel, the tip, their markers, their weak topics).

        `.dash-split` is a grid only from 80rem — a measured threshold, not a
        guess; see the rule in `study.css` for the four widths it was taken
        from. Below it the two columns stack in DOM order, which is why the
        aside is written second even though CSS pins it to column 2 explicitly:
        on a phone «كورساتي» must not be under four cards of side matter.

        ⚠️ Every grid inside the main column is sized against that, and the
        breakpoints look one step too high on purpose. `xl:grid-cols-1` on the
        course grid is not a typo — at `xl` (1280) the split has just switched
        on and the main track is 592px, so two course cards there are 284px
        each. They go back to two across at `2xl`, where the track is 752px.
        Tailwind's breakpoints are VIEWPORT widths and this column is 296px of
        rail plus an aside away from being one.
      */}
      <div className="dash-split">
        <div className="dash-split__main space-y-8">
          {/*
            The hero slot. Resume wins it whenever there is something to resume
            — a returning student's one reason to be here — and the first-run
            card takes it otherwise. When BOTH apply (a student mid-course who
            has yet to sit a quiz) the steps card renders below in its `plain`
            tone, so the page still has exactly one accent-tinted surface.
          */}
          {resume ? (
            <section>
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
            <section>
              <StartHereCard steps={steps} tone={resume ? 'plain' : 'hero'} />
            </section>
          ) : null}

          {/* XP, learning hours, badges earned. Stays in the MAIN column and
              not with «إنجازاتك» in the aside, even though the two are about
              the same thing: three side-by-side figures need a row, and in a
              23rem column the three `.tile`s stack into a 400px tower of
              single numbers. */}
          <StatsRow xp={xp} learningSeconds={learningSeconds} badgesEarned={earnedCount(badges)} />

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
                  {copy.library.courseCount.replace(
                    '{n}',
                    String(dashboard.enrolledCourses.length),
                  )}
                </span>
              ) : null}
            </div>

            {/*
              ⚠️ ONE GRID. There were two tabs here — «الدورات الحالية» and
              «المكتملة» — and they are gone by name: «ميبقاش كلمة مكتمل دي
              أصلاً، لا، يبقوا جنب بعض».

              He is right, and the reason is worth keeping because the tabs
              looked like a reasonable idea. This platform's courses are
              PUBLISHED AS THEY GO — new lectures land in a course all term —
              so "finished" is a state a course leaves again the following
              week. A tab called «المكتملة» promises an archive, and what it
              actually held was courses that happen to have no unwatched
              lecture TODAY. Worse, it hid them: a student with two courses saw
              one card and an empty half of the screen (that is the screenshot
              this changed on), because the other course was behind a tab whose
              own label said it was done with.

              The state has not gone anywhere — every card still carries its own
              meter, its lesson count and «خلّصت اللي نزل» when that is true.
              The card says it, per course, instead of a filter deciding for
              the student which of their courses they are allowed to see.
            */}
            {hasCourses ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {dashboard.enrolledCourses.map((course) => (
                  <EnrolledCourseCard
                    key={course.id}
                    course={course}
                    shippingCents={bookCatalog.shippingCents}
                    vodafoneCash={settings.contact.vodafoneCash}
                  />
                ))}
              </div>
            ) : (
              /*
                Deliberately quiet, and deliberately NOT a second call to
                action: a student with no courses is already looking at the
                first-run card above, whose step 1 is this exact link with an
                accent button on it. Two competing "اختار كورس" buttons on one
                screen is the pattern this rebuild exists to remove.
              */
              <div className="empty">
                <SpotIllustration name="courses" />
                <p className="empty__body">{c.noCoursesYet}</p>
              </div>
            )}
          </section>

          {/*
            «كورسات في مسارك» — every published course in this student's own
            (year, track) cell they have not enrolled in yet. Absent entirely
            when there is nothing to show: no identity, or already enrolled in
            everything their track offers — see `recommendedCourses`.

            Directly under «كورساتي» and in the same column, which is the
            answer to «كورسات اللي المفروض لازم يشترك فيها… طيب هو مشترك خلاص
            يبقى قدامه يتفرج عليه»: the two lists are the same object in two
            states, so they belong one under the other where the difference is
            legible. A card up there carries a meter and «نكمّل»; a card down
            here carries a price and «اشترك».
          */}
          {recommended.length > 0 ? (
            <section>
              <div className="group-head">
                <span className="group-head__mark" aria-hidden="true" />
                <h2 className="group-head__title">{c.recommended}</h2>
                <Link href="/library" className="group-head__count hover:text-accent-text">
                  {c.recommendedSeeAll}
                </Link>
              </div>
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {recommended.map((course) => (
                  <LibraryCourseCard course={course} key={course.id} />
                ))}
              </ul>
            </section>
          ) : null}

          {/*
            «امتحاناتك» — the dashboard's ONLY account of marks.

            There was a second one: an «آخر النتائج» strip in a right-hand rail,
            five percentages with nothing to press. It went, and this replaced
            it rather than joining it. Both answered "how did I do", which on
            one screen is one question — and the strip answered it worse: no
            verdict, no sense of what is outstanding, and nowhere to go.
            `/results` is still one link away for the full history.

            In the MAIN column, not the aside, because every row ends in its
            own action — «راجع إجاباتك», or «ادخل امتحان التحسين» — and an
            action needs room beside a title and a verdict. In a 23rem column
            it wraps to three lines per row; that measurement is why the old
            rail was dropped in the first place and it has not changed.
          */}
          <ExamsSection quizzes={quizzes.quizzes} />

          {/*
            «الكتب», last in the column and deliberately so. Everything above it
            is the student's own work, and a shop placed among those competes
            with them. Down here it is what a student finds when they have
            finished reading their own screen, which is the moment «فيه كتاب
            مطبوع كمان» is worth reading.

            The catalogue is ALREADY in hand: the same cached response feeds the
            per-course «اطلب الكتاب» button, so this section costs no extra
            request. Shelves are flattened because the grouping `/books` uses
            (subject, then term) renders as a heading above a heading above two
            covers when one subject is on sale.

            SIX, not four. The section shows the first two as wide cards and
            puts the remainder in the compact «كتب تانية» row underneath — with
            a cap of four there was at most one book in that row, which is a
            heading over a single chip.
          */}
          <BooksSection
            books={bookCatalog.shelves
              .flatMap((shelf) => [...shelf.first, ...shelf.second, ...shelf.full])
              .slice(0, 6)}
          />
        </div>

        <aside className="dash-split__side mt-8 space-y-4 lg:mt-0">
          {/*
            «قناة الواتساب» first in the column — «حطها في جنب في بوكس لوحدها
            فوق كده بشكل حلو». It keeps the top of the aside because it is the
            one block on the whole page whose job is to reach a student who is
            NOT on the platform; everything else here describes someone already
            looking at it. Green rather than amber, and the reason is in the
            component: the page's one amber action is the resume card, and this
            button leaves the product.
          */}
          <WhatsappChannelCard href={settings.contact.whatsappChannel} variant="aside" flush />

          {/*
            «امتحانات في انتظارك» — a course genuinely finished with its exam
            sitting untouched. Not a duplicate of «امتحاناتك» in the main
            column: that section is every exam a student HAS sat, this is the
            ones they have not. Absent entirely when nothing is waiting, which
            is most days — which is also why it is safe this high in the
            column.
          */}
          {dashboard.pendingExams.length > 0 ? (
            /* No banner: this one renders only when something is actually
               waiting, and a decorative header over an alert makes it read as
               standing furniture. */
            <AsideBlock>
              <PendingExamsCard exams={dashboard.pendingExams} />
            </AsideBlock>
          ) : null}

          {/*
            «ذاكر ده» — the only block on the page that names a CAUSE rather
            than a quantity, and the reason the aside exists at all rather than
            being three decorative cards.

            `null` when the read failed, and the card is simply absent then —
            see `lib/mastery.ts`. This is an enhancement to a screen that was
            complete without it, and this page has been taken down once already
            by an added read that threw.
          */}
          {mastery ? (
            <AsideBlock art="mastery">
              <MasteryCard mastery={mastery} />
            </AsideBlock>
          ) : null}

          {/*
            «إنجازاتك» — the one block that reports what a student has DONE
            rather than what is left. Every other thing on this page describes
            an outstanding quantity, which is the right emphasis for a study
            tool and is also relentless.
          */}
          <Achievements achievements={badges} earned={earnedCount(badges)} variant="aside" />

          {/* «نصيحة اليوم», last: it is the lightest thing on the screen and
              it is the same for every student on a given day. */}
          <TipOfDayCard />
        </aside>
      </div>
    </main>
  );
}
