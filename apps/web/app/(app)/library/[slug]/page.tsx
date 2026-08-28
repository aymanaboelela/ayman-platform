import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Clock, Layers, Play } from 'lucide-react';
import { LearningPathSchema, copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { getCourse } from '@/lib/catalog';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import { buildCourseOutline } from '@/lib/course-outline';
import { CourseCover } from '@/components/library/course-cover';
import { SpotIllustration } from '@/components/dashboard/spot-illustration';
import { CourseOutlineView } from '@/components/library/course-outline';
import { CourseStartButton } from '@/components/site/course-start-button';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';
import { formatDuration } from '@/components/site/course-card';
import { RichText } from '@/components/content/rich-text';
import { privateRouteMetadata } from '@/lib/seo/metadata';

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
  return { ...privateRouteMetadata, title: course?.title ?? copy.course.notFound };
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
 * The page opens on a `.stage` — the ember band from `study.css` — carrying
 * the back link, the identity line, the title, the two facts, and the cover.
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
export default async function LibraryCoursePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  const [course, path, { contact }] = await Promise.all([
    getCourse(slug),
    apiGetAuthed('/api/me/path', LearningPathSchema),
    getPublicSettingsOrDefaults(),
  ]);

  if (!course) notFound();

  const outline = buildCourseOutline({
    course,
    path: path.courses.find((entry) => entry.id === course.id) ?? null,
  });

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <section className="stage mb-8">
        <div className="stage__body">
          <p className="mb-5">
            <Link href="/library" className="stage__back">
              <ArrowRight size={15} aria-hidden="true" className="icon-inline" />
              {c.backToLibrary}
            </Link>
          </p>

          {/* Text at the inline start, art at the inline end — on a phone the
              art drops below the facts rather than shrinking to a stripe, so
              it is still the first thing seen on scroll. */}
          <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-10">
            <div className="min-w-0">
              <p className="stage__eyebrow">
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
            </div>

            <CourseCover
              coverKey={course.coverKey}
              subjectNameAr={course.subjectNameAr}
              seed={course.slug}
            />
          </div>
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
      ) : outline.enrolled ? (
        <section className="panel mb-8 p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
              {outline.progressPercent === 100
                ? c.courseDone
                : c.percentDone.replace('{percent}', String(outline.progressPercent))}
            </p>
            <p className="mono tabular text-[length:var(--fs-mono-label)] text-accent-text">
              {outline.clearedLessons} / {outline.totalLessons}
            </p>
          </div>
          <LessonProgressBar percent={outline.progressPercent} label={course.title} />

          {outline.nextLessonId ? (
            <Link
              href={`/courses/${course.slug}/lessons/${outline.nextLessonId}`}
              className={cn(
                'mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-sm bg-accent px-4',
                'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
              )}
            >
              <Play size={15} aria-hidden="true" className="icon-inline" />
              {c.resume}
            </Link>
          ) : null}
        </section>
      ) : (
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
              vodafoneCash={contact.vodafoneCash}
            />
          </div>
        </section>
      )}

      {course.description ? (
        <div className="mb-8 max-w-[var(--w-prose)]">
          <RichText html={course.description} />
        </div>
      ) : null}

      {/* Skipped outright when the course is empty. `CourseOutlineView` maps
          over `outline.sections` and renders a heading plus «0 محاضرة» over
          nothing, which is the second half of what «الوقت محاضرات صفر» was
          describing — the panel above already says it once, in words.

          Also skipped for a PRICED course this student has not subscribed
          to yet: every row is a `CourseEntry`, and a locked lesson pressed
          here fails the same generic way the public page's outline did —
          see the note on `notEnrolledTitle` above. Free courses are
          unaffected: `enrolled` only gates the priced case. */}
      {outline.totalLessons > 0 &&
      (outline.enrolled ||
        (course.monthlyPriceCents === null &&
          course.quarterlyPriceCents === null &&
          course.yearlyPriceCents === null &&
          course.terms.length === 0)) ? (
        <CourseOutlineView outline={outline} courseSlug={course.slug} courseId={course.id} />
      ) : null}
    </main>
  );
}
