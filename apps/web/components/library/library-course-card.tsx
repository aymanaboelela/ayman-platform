import Link from 'next/link';
import { BookOpen, Clock, Layers } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { cn } from '@ayman/ui';
import { formatDuration } from '@/components/site/course-card';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';
import type { LibraryCourse } from '@/lib/library';

const c = copy.library;

/**
 * One course, as the signed-in student sees it.
 *
 * Deliberately NOT `components/site/course-card.tsx`. That card is built from
 * `.site-*` marketing CSS and sells a course to a stranger — a free badge, an
 * outline CTA, an optional animated border. This one is built from the product
 * tokens (`panel`, `--fs-*`) and answers a different question: how far am I
 * through this, and what is the one thing to click. Sharing a component would
 * have meant a card that does neither job well, which is exactly how the
 * product and the landing page drifted apart in the first place.
 *
 * ## The one state that changes the card
 *
 * Enrolment. An enrolled course carries a progress bar and its CTA resumes at
 * the next lesson; an unenrolled one carries neither and points at the course
 * page, which is where enrolling happens. Everything else — cover, title, meta
 * — is identical, so a grid of both still reads as one set.
 */
export function LibraryCourseCard({ course }: { course: LibraryCourse }) {
  const enrolled = course.progressPercent !== null;
  const done = enrolled && course.progressPercent === 100;

  // Both destinations stay inside the shell: the player for a course already
  // under way, the in-shell course page otherwise. Never the public
  // `/courses/:slug` — that is the page for someone arriving from Google, and
  // sending a signed-in student to it is the whole bug this route exists to
  // fix.
  const href = course.nextLessonId
    ? `/courses/${course.slug}/lessons/${course.nextLessonId}`
    : `/library/${course.slug}`;

  const cta = !enrolled ? c.start : done ? c.open : c.resume;

  return (
    <li className="panel flex flex-col overflow-hidden">
      <div className="relative aspect-[16/8] shrink-0 overflow-hidden">
        {course.coverKey ? (
          // A raw <img>, not next/image, for the reason `CourseCard`
          // documents: covers are arbitrary uploads on the media origin, which
          // is not in `next.config`'s `remotePatterns`. The fixed 16/9 box
          // means there is no CLS to guard against anyway.
          <img
            src={mediaUrl(course.coverKey)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          // The coverless fallback. Deterministic per course rather than
          // random, so a grid of them reads as a set instead of as noise — and
          // textured rather than flat, because a page of flat panels reads as
          // images that failed to load. `.course-thumb` owns the two layers;
          // see `globals.css`.
          <span
            aria-hidden="true"
            className="course-thumb flex h-full w-full flex-col items-center justify-center gap-2"
          >
            <span className="relative z-10 flex size-11 items-center justify-center rounded-full border border-line-strong bg-surface-1 text-accent-text">
              <BookOpen size={20} />
            </span>
            <span className="mono relative z-10 text-[length:var(--fs-mono-label)] text-fg-muted">
              {course.subjectNameAr}
            </span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <h3 className="text-[length:var(--fs-title-4)] font-medium text-fg">
          {/* One link for the whole card would swallow the CTA below it; this
              is the accessible name, and the CTA is the redundant click
              target sighted users reach for. */}
          <Link
            href={href}
            className="outline-offset-4 transition-colors duration-[160ms] ease-out hover:text-accent-text"
          >
            {course.title}
          </Link>
        </h3>

        <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--fs-mono-label)] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Layers size={14} aria-hidden="true" className="icon-inline" />
            {c.lessonCount.replace('{n}', String(course.lessonCount))}
          </span>
          <span className="tabular inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden="true" className="icon-inline" />
            {formatDuration(course.totalSeconds)}
          </span>
        </div>

        {/* `mt-auto` on the footer, not on the CTA: it pins progress AND button
            to the bottom together, which is what keeps the buttons aligned
            across a row of cards whose titles wrap to different heights. */}
        <div className="mt-auto flex flex-col gap-3 pt-1">
          {enrolled ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[length:var(--fs-text-sm)] text-fg-muted">
                  {done ? c.courseDone : c.percentDone.replace('{percent}', String(course.progressPercent))}
                </span>
                <span className="mono tabular text-[length:var(--fs-mono-label)] text-accent-text">
                  {course.clearedLessons} / {course.lessonCount}
                </span>
              </div>
              <LessonProgressBar percent={course.progressPercent ?? 0} label={course.title} />
            </div>
          ) : (
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.notStarted}</p>
          )}

          <Link
            href={href}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-sm px-4',
              'text-[length:var(--fs-text-sm)] font-medium',
              'transition-colors duration-[160ms] ease-out',
              enrolled && !done
                ? 'bg-accent text-[#1A1206] hover:bg-accent-hover'
                : 'border border-line-strong text-fg hover:bg-surface-3',
            )}
          >
            {cta}
          </Link>
        </div>
      </div>
    </li>
  );
}
