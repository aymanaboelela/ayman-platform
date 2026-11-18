import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { ProfileMeSchema, StudentQuizHistorySchema, copy } from '@ayman/contracts';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { apiGetAuthed } from '@/lib/api-server';
import { RetiredCourseNotice } from '@/components/app/retired-course';
import { getCatalogOrEmpty } from '@/lib/catalog';
import { getDashboard } from '@/lib/dashboard';
import { bandExam, getStudentExamsOrEmpty } from '@/lib/exams';
import { getEntitlements } from '@/lib/entitlements';
import { achievementsFor, earnedCount, highestTier } from '@/lib/achievements';
import {
  firstName,
  hasOutstandingSteps,
  recommendedCourses,
  startHereSteps,
  summarise,
} from '@/lib/dashboard-view';
import { identityOf } from '@/lib/library';
import { getMasteryOrNull } from '@/lib/mastery';
import { getMyBookOrdersOrEmpty } from '@/lib/my-book-orders';
import { bookCoverIndex, bookOrdersForHome } from '@/lib/book-order-track';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { getBookCatalogForStudent } from '@/lib/books';
import { getSession } from '@/lib/session';
import { bannersFor, getPromoBanners } from '@/lib/promo-banners';
import { canOpenDashboard, landingForStaff } from '@/lib/dashboard-access';
import { getTaxonomyOrNull } from '@/lib/taxonomy';
import { xpFor } from '@/lib/xp';
import { Achievements } from '@/components/dashboard/achievements';
import { ContinueWatchingCard } from '@/components/dashboard/continue-watching-card';
import { DashboardHero } from '@/components/dashboard/dashboard-hero';
import { EnrolledCourseCard } from '@/components/dashboard/enrolled-course-card';
import { ExamCountdownBand } from '@/components/dashboard/exam-countdown-band';
import { ExamsSection } from '@/components/dashboard/exams-section';
import { MonthlyExamsSection } from '@/components/dashboard/monthly-exams-section';
import { MonthNewsBand } from '@/components/dashboard/month-news-band';
import { BooksSection } from '@/components/dashboard/books-section';
import { MyBookOrdersSection } from '@/components/dashboard/my-book-orders-section';
import { MasteryCard } from '@/components/dashboard/mastery-card';
import { PendingExamsCard } from '@/components/dashboard/pending-exams-card';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { NextUpBlock } from '@/components/dashboard/next-up-block';
import { PromoBannerStrip } from '@/components/dashboard/promo-banner-strip';
import { InstructorMessageCard } from '@/components/dashboard/instructor-message-card';
import { HonorBoardCard } from '@/components/dashboard/honor-board-card';
import { StartHereCard } from '@/components/dashboard/start-here-card';
import { GuardianCodeCard } from '@/components/dashboard/guardian-code-card';
import { WhatsappChannelCard } from '@/components/dashboard/whatsapp-channel-card';
import { FacebookGroupCard } from '@/components/dashboard/facebook-group-card';
import { CourseGroupCard } from '@/components/player/course-group-card';
import { TodayStrip } from '@/components/engagement/today-strip';
import { EssayHomeCard } from '@/components/essay/essay-home-card';
import { LibraryCourseCard } from '@/components/library/library-course-card';
import { StudyTiles } from '@/components/dashboard/study-tiles';
import { HomeHero } from '@/components/dashboard/home-hero';
import { HomeReach } from '@/components/dashboard/home-reach';
import { IS_AYMAN } from '@/lib/tenant';
import '@/components/dashboard/home-cinema.css';

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
 * ## Why there is no stat row in this column any more
 *
 * There was one — XP, learning time, badges — sitting under «تكمل من مكانك»,
 * which on a phone is below the fold and on a desktop is a screen away from
 * the band that introduces the student. «عاوز تنقل السكشن ده أعلى». It is on
 * the band now, and it absorbed the band's own row of small inline counts on
 * the way: two shapes stating the same kind of fact became one. `statFigures`
 * in `stats-row.tsx` carries that argument in full.
 *
 * The tiles did NOT move into the aside beside «إنجازاتك», even though the two
 * are about the same thing. Three side-by-side figures need a row, and in the
 * aside's 23rem column three `.tile`s stack into a tower of single numbers.
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
  // Per request before anything is read — `getBookCatalogForStudent` must
  // never be filled at build time (see its note).
  await connection();
  /*
   * ⚠️ طالب بس — عملية حقيقية: صبري عمل حساب مساعد («سهام») بصلاحيات محدودة
   * من `/admin/roles`، وكراشت هنا بالظبط، كود عطل 2315818922. المساعد مش
   * طالب — `enrollment:read`/`profile:read`/إلخ مش من حاجته، فمفيش سبب يحطّهم
   * ليه، ومن غيرهم كل نداء من الـ٩ اللي تحت كان بيترمي 403 غير ملتقط.
   *
   * تسع نداءات على طول الصفحة، كل واحد يتصلح لوحده كان عدد كبير وسطحي —
   * فحص واحد هنا، على نفس `getSession()` اللي الصفحة أصلًا بتعمله تحت
   * (مـ`cache()`، فده مش نداء إضافي)، بيقفل الباب كله مرة واحدة.
   *
   * بالصلاحيات مش بالرول (`canOpenDashboard`): الفحص الأول كان
   * `role !== 'student'`، فرجّع المالك نفسه لـ/admin — وهو عنده كل الصلاحيات
   * واشتراكات وتاريخ اختبارات حقيقي — و«الصفحة كطالب» ماكانتش بتوديه حتة.
   * المساعد اللي ناقصه صلاحية من اللي الصفحة محتاجاها لسه بيتوجّه لـ/admin.
   */
  const earlySession = await getSession();
  if (!canOpenDashboard(earlySession)) redirect(landingForStaff(earlySession));

  const [
    dashboard,
    me,
    quizzes,
    taxonomy,
    session,
    mastery,
    settings,
    catalog,
    bookCatalog,
    myBookOrders,
    studentExams,
    features,
    promoBanners,
  ] = await Promise.all([
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
     * `getBookCatalogForStudent` rather than `getBookShippingRates`, which is a
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
    getBookCatalogForStudent(),
    /*
     * «كتبي» — this student's own book orders, for the section above the shop.
     *
     * ⚠️ The TENTH parallel call on this page, and the one that had to be
     * written not to matter. `getMyBookOrdersOrEmpty` catches its own failure
     * and returns `[]` — the same value a student who has never ordered a book
     * produces — and `<MyBookOrdersSection>` renders NOTHING for `[]`. So a 429
     * from the `short` throttle (10/second, which this page's own comments have
     * been counting down since the sixth call) degrades to the dashboard
     * looking exactly as it did last week, which is the standard this page
     * holds every added read to. It has been taken down once already by one
     * that did not.
     *
     * `cache()` and NOT `'use cache'`: it is authenticated and per-student, and
     * takes no arguments, so a shared cache entry would have nothing to key on
     * and would serve the first student's delivery address to everyone after
     * them. Same split, and the same reasoning, as `getMasteryOrNull` above
     * against `getTaxonomyOrNull`.
     */
    getMyBookOrdersOrEmpty(),
    /*
     * «امتحانات الشهر» — the scheduled exams of every course this student is
     * enrolled in, for the countdown band under the hero and the shelf down in
     * the main column.
     *
     * ⚠️ The ELEVENTH entry in this array and the SEVENTH PER-VIEW request —
     * the count these comments have been keeping since `getMasteryOrNull`,
     * against the `short` throttle of 10 per second. It clears the same bar
     * every read since the sixth has had to clear: `getStudentExamsOrEmpty`
     * catches its own failure and returns `{ exams: [] }`, which is the SAME
     * value a student with no scheduled exam produces, and both components
     * render nothing at all for it. A 429 therefore degrades to a dashboard
     * that looks exactly as it did last week, rather than to «This page
     * couldn't load» — which is what an added read that threw did to this page
     * once already.
     *
     * `cache()` and NOT `'use cache'`: authenticated, per-student, and it takes
     * no arguments, so a shared entry would have nothing to key on and would
     * serve the first student's marks to everyone after them. Same split, same
     * reasoning, as `getMasteryOrNull` and `getMyBookOrdersOrEmpty` above,
     * against `getTaxonomyOrNull`.
     */
    getStudentExamsOrEmpty(),
    /* مش طلب تامن: `'use cache'` على تاج واحد، ونص الحاجات اللي فوق
       بتقراها جوّاها أصلًا. الكلام ده كله في `lib/entitlements.ts`. */
    getEntitlements(),
    /*
     * «البانرات الترويجية». Not a per-view request either: `'use cache'` on
     * one tag, shared by every student, and it checks the entitlement itself
     * before asking (a stack without the feature never calls the route). It
     * fails soft to `[]`, which renders nothing — see `lib/promo-banners.ts`.
     */
    getPromoBanners(),
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

  /*
   * The ONE monthly exam the band gets — `open` if there is one, else the
   * soonest `upcoming`, else nothing. `bandExam` documents why `open` outranks
   * a nearer `upcoming` and why a `closed` exam can never be picked.
   *
   * Read once here rather than inside the band, because the page needs the
   * answer too: see the `<NextUpBlock>` render below.
   */
  const monthlyExam = bandExam(studentExams.exams);

  const steps = startHereSteps(dashboard);
  const showSteps = hasOutstandingSteps(steps);
  const resume = dashboard.continueWatching;
  const resumeCourse = resume
    ? dashboard.enrolledCourses.find((course) => course.id === resume.courseId)
    : undefined;

  /*
   * «Cinema» — the approved Home2 board, his stack only. New look ships to him
   * first; every other stack renders this page exactly as before (the old
   * band, the separate resume card, the stand-alone channel/group cards).
   * Everything that differs is a branch on this one flag, and the styles are
   * scoped under `.home-cinema` in `home-cinema.css`.
   */
  const cinema = IS_AYMAN;
  const heroProps = {
    // `session` is null only in the torn-session case `AccountMenu`
    // documents — `proxy.ts` has already redirected the navigation by
    // then. The profile's own name is the better fallback either way.
    name: me.profile?.fullName ?? session?.name ?? '',
    image: session?.image ?? null,
    greetingName: name,
    yearLabel: identity?.yearLabelAr ?? null,
    trackLabel: identity?.trackLabelAr ?? null,
    schoolName: me.profile?.schoolName ?? null,
    overallPercent,
    courseCount: dashboard.enrolledCourses.length,
    completedLessons,
    averageScore,
    xp,
    learningSeconds,
    badgesEarned: earnedCount(badges),
    badgeTier: highestTier(badges),
    courses: dashboard.enrolledCourses,
  };
  const groups = dashboard.enrolledCourses.flatMap((course) =>
    course.whatsappGroupUrl
      ? [{ courseId: course.id, courseTitle: course.title, url: course.whatsappGroupUrl }]
      : [],
  );
  /*
   * «كتبي» on the home — only the orders still on their way (plus a just-
   * arrived or just-refused one for a few days). The rule and its numbers are
   * in `bookOrdersForHome`; the full history stays on `/store/orders`. `[]`
   * renders nothing, so a student with no book coming sees the page exactly
   * as before. "Now" is the exams read's `serverTime` — the API's clock when
   * it answered, this machine's when it did not (see `getStudentExamsOrEmpty`)
   * — rather than a `Date.now()` in render, which React's purity rule rejects
   * and which would be a second clock on a page that already has one.
   */
  const homeBookOrders = bookOrdersForHome(myBookOrders, Date.parse(studentExams.serverTime));
  const bookCovers = bookCoverIndex(bookCatalog);
  const supportHref = waMeHref(settings.contact.whatsapp);
  const booksBlock = (
    <>
      <MyBookOrdersSection orders={homeBookOrders} supportHref={supportHref} covers={bookCovers} />
      <BooksSection
        books={bookCatalog.shelves
          .flatMap((shelf) => [...shelf.first, ...shelf.second, ...shelf.full])
          .slice(0, 6)}
      />
    </>
  );

  return (
    /*
      ## The 2026-11 order — «المنصة للطالب زحمة أوي»

      The page was sixteen blocks in two columns, six metres of scroll on a
      phone, and the owner approved a mock-up of this order before it was
      built. One column for the student's own work, top to bottom in the order
      it is asked for:

        1. the band (who, how far) and, right under it, «نكمّل من مكانك» —
           a returning student's one reason to be here
        2. «امتحان الشهر» — DATED, so it outranks everything standing; asked
           for by name: «عاوز دي تبقى فوق»
        3. the open month, «ناقصك كده وخلاص», anything addressed to them
        4. «كورساتي» three across, then courses in their track
        5. exams and results beside today's habits and the study tiles
        6. books, then the ways to reach us, then what is ABOUT them

      «نصيحة اليوم» is gone: it was the same sentence for every student and
      the lightest thing on a page that was too heavy. Everything else kept its
      component and its gate; only its place changed.
    */
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-8 md:px-6 md:py-10">
      <div className={cinema ? 'dash-flow home-cinema' : 'dash-flow'}>
        {/* «Cinema»: the poster band carries «نكمّل من مكانك» inside it. */}
        {cinema ? <HomeHero {...heroProps} resume={resume} /> : <DashboardHero {...heroProps} />}

        {/* «الكورس ده خلص دوره في رحلتك» — under the greeting, until «تمام،
            فهمت». Nothing on the ordinary day. */}
        <RetiredCourseNotice retired={dashboard.retiredCourses ?? []} />

        {/*
          «نكمّل من مكانك», straight under the band — the band says how far,
          this says where to press. When there is nothing to resume the
          first-run card takes the slot; when both apply (mid-course, no quiz
          sat yet) the steps card follows in its `plain` tone so the page keeps
          one accent-tinted surface.
        */}
        {resume && !cinema ? (
          <ContinueWatchingCard
            item={resume}
            coverKey={resumeCourse?.coverKey ?? null}
            subjectNameAr={resumeCourse?.subjectNameAr ?? null}
          />
        ) : null}
        {showSteps ? <StartHereCard steps={steps} tone={resume ? 'plain' : 'hero'} /> : null}

        {/*
          «امتحان الشهر» — the one thing that outranks «ناقصك كده وخلاص»,
          because it is DATED: a window opens and shuts, `attemptAllowance` is
          1, and a student who scrolls past it gets no second sitting. Absent
          outside the two phases where it is still ahead of them.
        */}
        <ExamCountdownBand
          exam={monthlyExam}
          serverTime={studentExams.serverTime}
          variant={cinema ? 'cinema' : 'band'}
        />

        {/* «شهر جديد اتفتح» — under the exam (which shuts today; a month stays
            open), above «ناقصك» (money before progress). `quiet` while an exam
            is open so the screen keeps one amber action. Renders nothing for
            almost everyone. */}
        <MonthNewsBand offers={dashboard.monthOffers} quiet={monthlyExam?.phase === 'open'} />

        {/* «ناقصك كده وخلاص». Stands down while a monthly exam is OPEN — the
            exam band carries «نبدأ الامتحان» in amber then, and every row here
            ends in an amber pill of its own. */}
        {monthlyExam?.phase === 'open' ? null : (
          <NextUpBlock
            dashboard={dashboard}
            percent={overallPercent}
            greetingName={name}
            showRing={false}
          />
        )}

        {/* «سؤال مقالي اليوم» — under «ناقصك» on both homes: it is today's own
            task, and the one daily thing somebody marks by hand. Its own
            Suspense boundary, so the read never holds the page back. */}
        {features.dailyEssay ? (
          <Suspense fallback={null}>
            <EssayHomeCard />
          </Suspense>
        ) : null}

        {/*
          «Cinema»: the book box, right under «ناقصك النهارده». The shop and the
          old «كتبي» left this home on purpose («شيل قسم الكتب»), but a book
          that is PAID FOR and on its way is not the shop: «الطالب لما يكون
          شاري كتاب، يبقى في … بوكس» — so it comes back for exactly the
          students who have one coming, and is absent for everyone else. No
          «اطلب كتاب تاني» under it: that link is selling, and selling is what
          left.
        */}
        {cinema ? (
          <MyBookOrdersSection
            orders={homeBookOrders}
            supportHref={supportHref}
            covers={bookCovers}
            showOrderAnother={false}
          />
        ) : null}

        {/* Addressed to THIS student, and gone once read / after two weeks —
            so above every standing block while they exist. Each is gated on
            its feature: a card whose door is switched off is a dead button. */}
        {features.assistant && !cinema ? <InstructorMessageCard /> : null}
        {features.honorBoard && dashboard.honorBoard ? (
          <HonorBoardCard standing={dashboard.honorBoard} />
        ) : null}
        {features.promoBanners ? (
          <PromoBannerStrip banners={bannersFor(promoBanners, me.profile?.year ?? null)} />
        ) : null}

        {/*
          «كورساتي» — three across from `lg`, two from `sm`. It used to be one
          wide card a row in a column beside an aside, so four courses were a
          screen and a half; across the full width the same four are one row
          and a bit. ONE grid, no «المكتملة» tab — a course published as it
          goes is "finished" only until next week's lecture.
        */}
        <section>
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
            <div className="dash-shelf grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {dashboard.enrolledCourses.map((course) => (
                <EnrolledCourseCard
                  key={course.id}
                  course={course}
                  shippingRates={bookCatalog.shippingRates}
                  instapay={settings.contact.instapay}
                  vodafoneCash={settings.contact.vodafoneCash}
                  variant={cinema ? 'poster' : 'card'}
                />
              ))}
            </div>
          ) : (
            // Quiet on purpose: the first-run card above already carries this
            // exact link with the accent button on it.
            <div className="empty">
              <SpotIllustration name="courses" />
              <p className="empty__body">{c.noCoursesYet}</p>
            </div>
          )}
        </section>

        {/* «كورسات في مسارك» — the same object in its other state, directly
            under. Absent when there is nothing in their cell left to join. */}
        {recommended.length > 0 && !cinema ? (
          <section>
            <div className="group-head">
              <span className="group-head__mark" aria-hidden="true" />
              <h2 className="group-head__title">{c.recommended}</h2>
              <Link href="/library" className="group-head__count hover:text-accent-text">
                {c.recommendedSeeAll}
              </Link>
            </div>
            <ul className="dash-shelf grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recommended.map((course) => (
                <LibraryCourseCard course={course} key={course.id} />
              ))}
            </ul>
          </section>
        ) : null}

        {/*
          Marks beside habits. The month's papers above every quiz ever sat
          (the smaller, more consequential list first); on the other side the
          day's habits, the study tiles and the exams still waiting. Every
          exam row ends in its own chip, so that side gets the wider track.
        */}
        {cinema ? (
          /*
           * «الحاجات دي مش مترتبة». On his stack this row is two things side by
           * side, the board's pair: the latest results and the study tools.
           * The rest of what sat here repeated something else on the page or
           * in the menu — the exams still waiting are in «ناقصك النهارده», the
           * month's closed papers and every result are on /results, the
           * day's habits («النهارده») are the study tools themselves, and the
           * courses to join are in «الكورسات».
           */
          <div className="home-duo">
            <ExamsSection quizzes={quizzes.quizzes} />
            <StudyTiles features={features} title={copy.dashboard.studyTilesTitle} />
          </div>
        ) : (
        <div className="dash-pair">
          <div className="dash-pair__main space-y-8">
            <MonthlyExamsSection exams={studentExams.exams} />
            <ExamsSection quizzes={quizzes.quizzes} />
          </div>
          <div className="dash-pair__side space-y-6">
            <PendingExamsCard exams={dashboard.pendingExams} />
            <Suspense fallback={null}>
              <TodayStrip features={features} />
            </Suspense>
            <StudyTiles features={features} title={copy.dashboard.studyTilesTitle} />
          </div>
        </div>
        )}

        {cinema ? (
          /* «Cinema»: «معانا على طول» beside the books — first in the DOM, so
             on a phone the cohort group and the channel come before the shop
             («لازم يبقوا باينين»). */
          /* The books, «كتبي», the guardian code, «نقوّي النقط دي» and the
             badges left the home page («شيل قسم الكتب … حطه في السايد منيو»):
             they live in the side menu (المتجر · طلباتي · بروفايلي · نتائجي ·
             أوسمتي). What stays is how to reach us. The one exception is a
             book still on its way, whose box sits under «ناقصك» above. */
          <HomeReach
            groups={groups}
            channelHref={settings.contact.whatsappChannel}
            facebookHref={settings.contact.facebookGroup}
          />
        ) : (
          <>
            {/* «كتبي» above the shop: what you already bought outranks what you
                might buy. Both absent when there is nothing to show. */}
            {booksBlock}

            {/* The ways to reach us and each other — the channel nobody can reply
                into, the Facebook group, and one card per course cohort that HAS a
                group (titled per course, or two identical buttons). */}
            <div className="dash-cards">
              <WhatsappChannelCard href={settings.contact.whatsappChannel} variant="aside" flush />
              <FacebookGroupCard href={settings.contact.facebookGroup} />
              {dashboard.enrolledCourses
                .filter((course) => course.whatsappGroupUrl !== null)
                .map((course) => (
                  <CourseGroupCard key={course.id} url={course.whatsappGroupUrl} courseTitle={course.title} />
                ))}
            </div>
          </>
        )}

        {/* What is ABOUT them rather than their work: the code they hand a
            parent, the topics to strengthen, the markers earned. Last, and
            kept — the guardian code lives nowhere else on the platform. */}
        {cinema ? null : (
        <div className="dash-cards">
          {me.profile?.guardianCode ? <GuardianCodeCard code={me.profile.guardianCode} /> : null}
          {mastery ? <MasteryCard mastery={mastery} /> : null}
          <Achievements achievements={badges} earned={earnedCount(badges)} variant="aside" />
        </div>
        )}
      </div>
    </main>
  );
}
