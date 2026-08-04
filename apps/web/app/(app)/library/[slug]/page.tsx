import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Clock, Layers } from 'lucide-react';
import { LearningPathSchema, copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { apiGetAuthed } from '@/lib/api-server';
import { getCourse } from '@/lib/catalog';
import { buildCourseOutline } from '@/lib/course-outline';
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
 * ## The two fetches
 *
 * `getCourse` is the shared, hours-cached catalog detail — the same call the
 * public page makes, so this route adds no load to the API for the part that
 * is identical for everyone. `/api/me/path` is the per-student half. They are
 * parallel, and the join is `buildCourseOutline`, which is unit-tested.
 */
export default async function LibraryCoursePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;

  const [course, path] = await Promise.all([
    getCourse(slug),
    apiGetAuthed('/api/me/path', LearningPathSchema),
  ]);

  if (!course) notFound();

  const outline = buildCourseOutline({
    course,
    path: path.courses.find((entry) => entry.id === course.id) ?? null,
  });

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-6 py-10 md:py-12">
      <p className="mb-6">
        <Link
          href="/library"
          className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:text-accent-text"
        >
          <ArrowRight size={15} aria-hidden="true" className="icon-inline" />
          {c.backToLibrary}
        </Link>
      </p>

      <header className="mb-8">
        <p className="eyebrow mb-2 text-fg-muted">
          {course.systemNameAr}
          {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''} · {course.subjectNameAr}
        </p>
        <h1 className="text-[length:var(--fs-title-1)] font-semibold text-fg">{course.title}</h1>
        {course.subtitle ? (
          <p className="mt-2 max-w-[var(--w-prose)] text-fg-muted">{course.subtitle}</p>
        ) : null}

        <div className="mono mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[length:var(--fs-mono-label)] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Layers size={14} aria-hidden="true" className="icon-inline" />
            {c.lessonCount.replace('{n}', String(outline.totalLessons))}
          </span>
          <span className="tabular inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden="true" className="icon-inline" />
            {formatDuration(course.totalSeconds)}
          </span>
        </div>
      </header>

      {outline.enrolled ? (
        <section className="panel mb-8 px-5 py-4">
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
                'mt-4 inline-flex h-10 items-center justify-center rounded-sm bg-accent px-4',
                'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
              )}
            >
              {c.resume}
            </Link>
          ) : null}
        </section>
      ) : (
        // Not enrolled. The outline below still renders in full — hiding it
        // would leave a student deciding whether to start with nothing to
        // decide on — but nothing in it opens until this button is pressed.
        <section className="panel mb-8 flex flex-col gap-3 px-5 py-4">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
            {c.notEnrolledTitle}
          </p>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.notEnrolledBody}</p>
          <div>
            <CourseStartButton
              courseId={course.id}
              slug={course.slug}
              hasLessons={outline.totalLessons > 0}
            />
          </div>
        </section>
      )}

      {course.description ? (
        <div className="mb-8 max-w-[var(--w-prose)]">
          <RichText html={course.description} />
        </div>
      ) : null}

      <CourseOutlineView outline={outline} courseSlug={course.slug} />
    </main>
  );
}
