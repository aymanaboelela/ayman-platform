import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RetiredCoursesSchema } from '@ayman/contracts/path';
import { RetiredCoursePage } from '@/components/app/retired-course';
import { ArrowRight, Clock, Layers, Play } from 'lucide-react';
import { LearningPathSchema, copy } from '@ayman/contracts';
import { z } from '@ayman/contracts/zod';
import { apiGetAuthed } from '@/lib/api-server';
import { getCourse } from '@/lib/catalog';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { buildCourseOutline } from '@/lib/course-outline';
import { courseBookCtaVisible } from '@/lib/course-book';
import { getBookShippingRates } from '@/lib/books';
import { bandExam, getStudentExamsOrEmpty } from '@/lib/exams';
import { CourseArt } from '@/components/course-art';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { isolateLtrRuns } from '@/components/dashboard/ltr-runs';
import { LtrRatio } from '@/components/ltr-ratio';
import { CourseOutlineView } from '@/components/library/course-outline';
import { CourseCertificatesLink, CourseExamCard, CourseLinks } from '@/components/library/course-side';
import { MonthOfferCard } from '@/components/player/month-offer-card';
import { activeSalePrice } from '@ayman/contracts/sale';
import { TermOfferCard, type TermOffer } from '@/components/player/term-offer-card';
import { CourseStartButton } from '@/components/site/course-start-button';
import { formatDuration } from '@/components/site/course-card';
import { RichText } from '@/components/content/rich-text';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { StudentExternalBookSummarySchema } from '@ayman/contracts/quiz/external-books';
import { ExternalBooksSection } from '@/components/library/external-books-section';
import '@/components/library/course-page.css';

const c = copy.library;

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourse(slug);
  // `privateRouteMetadata` regardless: this is the signed-in view of a course,
  // and the PUBLIC `/courses/[slug]` is the one that carries the real title,
  // the canonical and the JSON-LD. Two indexable pages for one course would
  // split its ranking between them.
  if (course) return { ...privateRouteMetadata, title: course.title };
  // A retired course's old link renders «الكورس ده خلص دوره في رحلتك», and
  // the tab must not say «مش موجود» above it.
  const retired = await apiGetAuthed('/api/me/retired-courses', RetiredCoursesSchema).catch(() => null);
  const isRetired = retired?.courses.some((entry) => entry.slug === safeDecode(slug)) ?? false;
  return { ...privateRouteMetadata, title: isRetired ? copy.retiredCourse.pageTitle : copy.course.notFound };
}

/**
 * A course, as the student studying it sees it: the outline with every lesson
 * in the state the progression gate actually enforces, and a lock that says
 * what it is waiting for.
 *
 * ## Why this is not `(site)/courses/[slug]`
 *
 * Same reason `/library` is not `/courses` — one URL cannot serve both a
 * cached, indexable sales page and a per-student, per-request outline. The
 * public page renders one HTML document for every visitor (that is what makes
 * `CourseStartButton` branch on click rather than on render); this one is
 * different for every student on every request, because that is what a gate
 * means. Nothing about the public page changes.
 *
 * ## The shape
 *
 * The page opens on a `.stage` carrying the back link, the identity line, the
 * title, the two facts, and the cover — since «Cinema» a night band with the
 * poster filling its inline-end half (`components/library/course-page.css`).
 * It replaces a bare `<h1>` over a grey meta line, which is the single biggest
 * reason the signed-in area read as black and white while the marketing page
 * did not. The colour rule holds through the rest of the page: ember is
 * structure (the band, the unit headers, the kind icons), amber is the one
 * thing to press (resume, and every open lesson's chip).
 *
 * ## The two fetches
 *
 * `getCourse` is the shared, hours-cached catalog detail — the same call the
 * public page makes, so this route adds no load to the API for the part that
 * is identical for everyone. `/api/me/path` is the per-student half. They are
 * parallel, and the join is `buildCourseOutline`, which is unit-tested.
 */
/**
 * Five seconds, not the thirty `next.config.ts` gives every other dynamic route.
 *
 * This is the outline, and the outline is where a lesson is drawn as locked or
 * open. Two things unlock one: finishing the lesson before it, and passing its
 * quiz. The first calls `router.refresh()` (`components/player/lesson-nav.tsx`);
 * the second cannot, because the submit happens on the attempt route and
 * refreshing THAT re-posts `resume` — see `quiz-runner.tsx`. So a passing grade
 * would leave the next lesson drawn as locked for up to half a minute, on the
 * screen the student goes to precisely in order to see it open.
 *
 * Five seconds keeps almost all of the win — the complaint is a student
 * bouncing between the outline and a lesson, which is a two-second round trip —
 * while making the gate feel immediate. Not `0`: this page is a real read, and
 * it is one of the two most revisited screens in the app.
 */
export const unstable_dynamicStaleTime = 5;

/** `/api/payments/courses/:id/months/mine` — نفس شكل الرد اللي
 *  `subscribe-panel.tsx` بيقراه، متكرر هنا لأنه سطرين مش عقد مشترك. */
const OwnedMonthsSchema = z.object({
  ownedMonthIds: z.uuid().array(),
  coversAll: z.boolean().default(false),
  pending: z.boolean().default(false),
  ownedTermIds: z.uuid().array().default([]),
  coversAllTerms: z.boolean().default(false),
});

export default async function LibraryCoursePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  const [course, path, { contact }] = await Promise.all([
    getCourse(slug),
    apiGetAuthed('/api/me/path', LearningPathSchema),
    getPublicSettingsOrDefaults(),
  ]);

  /*
   * An ARCHIVED course is out of the catalog, so `getCourse` is null — but a
   * student who was in it and opens an old link (a bookmark, a notification,
   * the lesson player redirecting here) is told why, not handed a 404.
   */
  if (!course) {
    const retired = await apiGetAuthed('/api/me/retired-courses', RetiredCoursesSchema).catch(() => null);
    const decoded = safeDecode(slug);
    if (retired?.courses.some((entry) => entry.slug === decoded)) {
      return (
        <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-10 md:px-6 md:py-16">
          <RetiredCoursePage />
        </main>
      );
    }
    notFound();
  }

  const pathCourse = path.courses.find((entry) => entry.id === course.id) ?? null;
  const outline = buildCourseOutline({ course, path: pathCourse });

  /*
   * «محاضرات شهر ٢ بتتجهّز» — للطالب اللي دفع في شهر لسه فاضي.
   *
   * الـoutline متجمّع بالأقسام مش بالشهور، فالشهر الفاضي مالوش ولا صف يتعرض.
   * من غير السطر ده اللي دفع «شهر ٢» بيفتح الصفحة دي ويلاقي محاضرات شهر ١
   * مقفولة وخلاص — مفيش أي ذكر للحاجة اللي هو دافع فيها. الشكل ده مش «لسه
   * بيتجهّز»، الشكل ده «الفلوس راحت».
   *
   * سلسلة تانية بعد الـ`Promise.all` عن قصد: محتاجة `course.id` اللي لسه
   * متأكدين منه فوق، والشهور بتيجي مع `course` أصلًا — فدي مكالمة واحدة
   * زيادة وبس.
   *
   * وبتفشل بهدوء: `[]` معناها مفيش سطر، وهو نفس اللي بيحصل للطالب اللي مالوش
   * شهور فاضية. سطر طمأنة ضايع أرخص من صفحة بتقع.
   */
  const hasBook = courseBookCtaVisible(course);
  const [ownership, externalBooks, studentExams, shippingRates] = await Promise.all([
    apiGetAuthed(
      `/api/payments/courses/${course.id}/months/mine`,
      OwnedMonthsSchema,
    ).catch(() => null),
    outline.enrolled
      ? apiGetAuthed(
          `/api/me/external-books/courses/${course.id}`,
          z.array(StudentExternalBookSummarySchema),
        ).catch(() => [])
      : Promise.resolve([]),
    // «امتحان الشهر» — never throws, and answers an empty list on a stack
    // without monthly exams, so the card simply does not render there.
    outline.enrolled ? getStudentExamsOrEmpty() : Promise.resolve(null),
    // `'use cache'` on one coarse tag (`lib/books.ts`), so this is shared
    // with every other page that quotes delivery — not a per-view request.
    hasBook ? getBookShippingRates() : Promise.resolve(null),
  ]);
  const ownedMonthIds = new Set(ownership?.ownedMonthIds ?? []);

  // `course.months` هي المفتوحة للبيع بس، وبتشيل عدد المحاضرات المنشورة.
  const emptyOwnedMonths = course.months
    .filter((month) => ownedMonthIds.has(month.id) && month.lessonCount === 0)
    .map((month) => month.title);

  /*
   * «شهور جديدة اتفتحت» — الشهور المفتوحة اللي الطالب لسه ماخدهاش، وده الباب
   * الوحيد ليها: الـproxy بيرجّع الطالب المشترك من صفحة الكورس لهنا، والقفل
   * بتاع الشهر بيتعرض على محاضرة بس — فشهر اتفتح ولسه مفيهوش محاضرات مالوش
   * أي زرار في أي حتة.
   *
   * مفيش عرض لو القراية وقعت (مش هنبيع شهر يمكن يكون معاه)، ولا لو اشتراكه
   * شامل كل الشهور (ترم، سنة، «٣ شهور»)، ولا لو الطالب مش مشترك أصلًا — ده
   * عنده زرار الاشتراك فوق.
   */
  const offerMonths =
    ownership && !ownership.coversAll && outline.enrolled
      ? course.months.filter((month) => !ownedMonthIds.has(month.id))
      : [];
  const monthOffer =
    offerMonths.length > 0
      ? {
          months: offerMonths.map((month) => ({
            id: month.id,
            title: month.title,
            lessonCount: month.lessonCount,
            priceCents: month.priceCents,
          })),
          pending: ownership?.pending ?? false,
        }
      : null;

  /*
   * «الترم التاني اتفتح» — the month card's twin, for a student who already
   * holds a term. `coversAll` hides the month card from them (a term opens
   * every month), so without this a «الترم الأول» student had no way at all
   * to the term opened next: it is booked before its first lecture exists, so
   * there is no padlock to press.
   *
   * Term holders only. A month buyer still reaches every term from the plan
   * grid, and a course-wide subscriber already has every term.
   */
  const offerTerms =
    ownership && outline.enrolled && !ownership.coversAllTerms && ownership.ownedTermIds.length > 0
      ? course.terms.filter((term) => !ownership.ownedTermIds.includes(term.id))
      : [];
  const termOffer: TermOffer | null =
    offerTerms.length > 0
      ? {
          terms: offerTerms.map((term) => ({
            id: term.id,
            title: term.title,
            priceCents:
              activeSalePrice(term.priceCents, term.salePriceCents, course.saleEndsAt) ?? term.priceCents,
          })),
          pending: ownership?.pending ?? false,
        }
      : null;

  // The next lecture's NAME for the hero's button — «نكمّل: الشروط if / else»
  // says where the press lands; a bare «نكمّل» does not.
  const nextTitle =
    outline.sections
      .flatMap((section) => section.entries.flatMap((entry) => [entry.lecture, ...entry.quizzes]))
      .find((lesson) => lesson.id === outline.nextLessonId)?.title ?? null;

  // THIS course's exam only — `bandExam` over the student's whole list would
  // put another course's paper on this page.
  const exam = studentExams
    ? bandExam(studentExams.exams.filter((entry) => entry.courseId === course.id))
    : null;

  const book =
    hasBook && shippingRates
      ? {
          courseId: course.id,
          bookTitle: course.bookTitle as string,
          bookPriceCents: course.bookPriceCents as number,
          shippingRates,
          instapay: contact.instapay,
          vodafoneCash: contact.vodafoneCash,
        }
      : null;

  return (
    <main className="cp-page mx-auto w-full max-w-[var(--w-shell)] px-4 py-6 md:px-6 md:py-10">
      {/*
        «Cinema» — the course's poster fills the inline-end half of the hero
        and fades into night behind the title, the progress and the one
        button. On a phone the poster sits on top at its own width and the
        words follow under its fade (`course-page.css`).

        Still a `.stage` with the `.stage__*` text classes: the a11y spec
        measures those against the band, and every one of them is a white
        alpha that clears 4.5:1 on the night fill with room to spare.

        The art is `<CourseArt>` — the uploaded cover, or on his stack one of
        his posters (`getBrandAsset`, gated), or the generated scene on any
        other stack. Decorative: the title beside it says what it is.
      */}
      <section className="stage cp-hero mb-6">
        <div className="cp-hero__art" aria-hidden="true">
          <CourseArt
            coverKey={course.coverKey}
            subjectNameAr={course.subjectNameAr}
            seed={course.slug}
            sizes="(min-width: 1024px) 40rem, 100vw"
          />
        </div>

        <div className="stage__body cp-hero__body">
          <p>
            <Link href="/library" className="stage__back">
              <ArrowRight size={15} aria-hidden="true" className="icon-inline" />
              {c.backToLibrary}
            </Link>
          </p>

          <p className="stage__eyebrow cp-hero__eyebrow">
            {course.systemNameAr}
            {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''} · {course.subjectNameAr}
          </p>

          <h1 className="stage__title">{course.title}</h1>

          {course.subtitle ? <p className="stage__sub">{course.subtitle}</p> : null}

          <div className="stage__facts">
            <span className="stage__fact">
              <Layers size={14} aria-hidden="true" className="icon-inline" />
              {c.lessonCount.replace('{n}', String(outline.totalLessons))}
            </span>
            <span className="stage__fact tabular">
              <Clock size={14} aria-hidden="true" className="icon-inline" />
              {formatDuration(course.totalSeconds)}
            </span>
          </div>

          {/* Where the student stands, and the ONE button, inside the hero. */}
          {outline.enrolled && outline.totalLessons > 0 ? (
            <div className="stage__progress">
              <div className="stage__progress-head">
                <span className="stage__progress-label">
                  {outline.progressPercent === 100
                    ? course.contentComplete
                      ? c.courseDone
                      : c.courseUpToDate
                    : isolateLtrRuns(
                        c.percentDone.replace('{percent}', String(outline.progressPercent)),
                      )}
                </span>
                <span className="stage__progress-ratio">
                  <LtrRatio value={outline.clearedLessons} of={outline.totalLessons} />
                </span>
              </div>
              <span
                className="stage__progress-bar"
                role="progressbar"
                aria-label={course.title}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(outline.progressPercent)}
              >
                <span style={{ inlineSize: `${Math.min(100, Math.max(0, outline.progressPercent))}%` }} />
              </span>
              {outline.nextLessonId ? (
                <Link
                  href={`/courses/${course.slug}/lessons/${outline.nextLessonId}`}
                  className="stage__resume"
                >
                  <Play size={15} aria-hidden="true" className="icon-inline" />
                  <span className="min-w-0 truncate">
                    {nextTitle ? c.resumeTo.replace('{title}', nextTitle) : c.resume}
                  </span>
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {outline.totalLessons === 0 ? (
        /*
          A published course with nothing published in it — «إزاي مفيش دروس؟
          الوقت محاضرات صفر إزاي؟».

          It was the worst-handled state on this page and it had TWO different
          wrong answers depending on enrolment. A student who was not enrolled
          got the ordinary «نبدأ الكورس» panel with the button greyed out and a
          grey line under it; a student who WAS enrolled got a progress bar
          reading «خلصت ٠٪ · 0 / 0», no button, no sentence, and an outline
          section below it that renders nothing at all. Neither said what had
          happened or what to do instead, and both looked like a page that had
          failed to load.

          Checked BEFORE the enrolled/not-enrolled split, because the answer is
          the same either way: there is nothing to enrol in and nothing to
          resume. `.empty` is the object the rest of the product already uses
          for "a container waiting to be filled", ember-tinted rather than a
          dashed grey box — the reason is written out in study.css and it is
          exactly this case: a grey rectangle is indistinguishable from
          something that broke.

          The CTA goes to `/library` rather than offering a retry. Nothing the
          student can press will publish a lecture, and a button that cannot
          succeed is worse than no button; the other courses are the real next
          move.
        */
        <section className="empty mb-8">
          <SpotIllustration name="courses" />
          <p className="empty__title">{c.emptyTitle}</p>
          {/* The admin's own «لسه هننزل قريبًا» wording when they have set
              one — same field the public course page's coming-soon panel
              reads — falling back to the stock line otherwise. */}
          <p className="empty__body mx-auto max-w-[34rem]">
            {course.comingSoonNote ?? c.emptyBody}
          </p>
          <div className="empty__action">
            <Link href="/library" className="chip chip--solid">
              {c.emptyCta}
            </Link>
          </div>
        </section>
      ) : outline.enrolled ? null : (
        // Not enrolled. For a FREE course the outline below still renders in
        // full — hiding it would leave a student deciding whether to start
        // with nothing to decide on, and nothing in it opens until this
        // button is pressed anyway. A PRICED course is different: every row
        // is a `CourseEntry`, so showing it here would offer buttons that all
        // 403 the same way the public page's did — see the note there. The
        // `outline.totalLessons > 0` skip below is what actually hides it.
        <section className="panel mb-8 flex flex-col gap-3 p-5">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.notEnrolledTitle}
          </p>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {course.monthlyPriceCents !== null ||
            course.quarterlyPriceCents !== null ||
            course.yearlyPriceCents !== null ||
            course.terms.length > 0
              ? c.notEnrolledBodyPriced
              : c.notEnrolledBody}
          </p>
          <div>
            <CourseStartButton
              courseId={course.id}
              slug={course.slug}
              hasLessons={outline.totalLessons > 0}
              monthlyPriceCents={course.monthlyPriceCents}
              quarterlyPriceCents={course.quarterlyPriceCents}
              yearlyPriceCents={course.yearlyPriceCents}
              terms={course.terms}
              instapay={contact.instapay}
            />
          </div>
        </section>
      )}

      {/*
        The units beside a narrow column — the owner's board: the units are
        the page; the month's exam, the small rows and «عن الكورس» sit at the
        side. On a phone the SAME blocks reorder by grid area: the exam strip
        and the row of tiles come straight under the hero, before the units,
        and «عن الكورس» goes last. One DOM, so nothing renders twice.

        «عندك كود؟» is not here on purpose: the side menu's «كود الكورس»
        (/codes) is the one place a code is typed.

        «جروب الدفعة» is read off `/api/me/path`, the ONLY course payload on this
        page behind an enrolment — `course` is the shared catalog detail served
        to anybody, and a cohort's invite on it would publish the link.
      */}
      <div className="cp-layout">
        <div className="cp-layout__top">
          {exam ? <CourseExamCard exam={exam} /> : null}

          <CourseLinks
            groupUrl={pathCourse?.whatsappGroupUrl ?? null}
            book={book}
            certificates={
              outline.enrolled ? (
                <Suspense fallback={null}>
                  <CourseCertificatesLink courseId={course.id} />
                </Suspense>
              ) : null
            }
          />

          {monthOffer ? <MonthOfferCard courseSlug={course.slug} offer={monthOffer} /> : null}
          {termOffer ? <TermOfferCard courseSlug={course.slug} offer={termOffer} /> : null}
        </div>

        <div className="cp-layout__main">
          {/* Skipped outright when the course is empty, and for a PRICED
              course this student has not subscribed to yet: every row there is
              a `CourseEntry`, and a locked lesson pressed here fails the same
              generic way the public page's outline did. Free courses are
              unaffected: `enrolled` only gates the priced case. */}
          {outline.totalLessons > 0 &&
          (outline.enrolled ||
            (course.monthlyPriceCents === null &&
              course.quarterlyPriceCents === null &&
              course.yearlyPriceCents === null &&
              course.terms.length === 0)) ? (
            <CourseOutlineView
              outline={outline}
              courseSlug={course.slug}
              courseId={course.id}
              pendingMonths={emptyOwnedMonths}
            />
          ) : null}

          {outline.enrolled && externalBooks.length > 0 ? (
            <ExternalBooksSection books={externalBooks} courseSlug={course.slug} />
          ) : null}
        </div>

        {course.description ? (
          <section className="panel course-about cp-layout__about">
            <h2 className="course-about__title">{c.aboutTitle}</h2>
            <RichText html={course.description} />
          </section>
        ) : null}
      </div>
    </main>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
