import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { copy, type EnrolledCourse } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { mediaUrl } from '@ayman/ui/branding';
import { enrolledCourseHref } from '@/lib/course-href';

import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

/**
 * One enrolled course: title, progress, and where the next click goes.
 *
 * The CTA's wording is derived from progress rather than fixed — "ابدأ" for an
 * untouched course, "كمّل" once there is something to return to, and a done
 * state at 100%. A single "افتح الكورس" on every card makes a finished course
 * and an unstarted one look like the same object.
 *
 * ## The cover
 *
 * It has one now. This card used to open on an icon in a well, with a comment
 * explaining that `EnrolledCourseSchema` carried no `coverKey` and that adding
 * one would cost a second round trip — so the dashboard showed a student's own
 * courses as text on a flat panel while the library, one click away, showed
 * the same courses with their artwork. Same courses, two different products.
 *
 * It cost no round trip in the end: the dashboard query already selects the
 * course row, so `coverKey` and the subject name came along in the columns
 * beside `title`.
 *
 * The coverless fallback is `.course-thumb` — the SAME textured panel the
 * library card falls back to, not a second invention. A course with no artwork
 * therefore looks identical on both screens, which is the whole point.
 *
 * ## The CTA
 *
 * A real `.chip`, not a word with a chevron after it. The whole card is still
 * one link — the title's stretched `::after` owns the hit area, so there is
 * exactly one accessible name — but the chip is what tells a student, in the
 * same amber they have learned means "press this" everywhere else, that there
 * is somewhere to go. A finished course swaps it for `.chip--done`, because
 * green is completion's colour and a completed course is not an action.
 */
export function EnrolledCourseCard({ course }: { course: EnrolledCourse }) {
  // Shared with the rail's «كورساتي» list — see `lib/course-href.ts`. The
  // local copy this replaced fell back to the PUBLIC course page, so a student
  // who had enrolled but not opened a lesson yet was shown a lock.
  const href = enrolledCourseHref(course);

  const done = course.progressPercent >= 100;
  const cta = done
    ? copy.dashboard.openCourse
    : course.progressPercent > 0
      ? copy.dashboard.continueCourse
      : copy.dashboard.startCourse;

  return (
    <article
      className={cn(
        'panel relative isolate flex flex-col overflow-hidden',
        'transition-colors duration-[160ms] ease-out',
      )}
    >
      <div className="relative aspect-[16/7] shrink-0 overflow-hidden">
        {course.coverKey ? (
          // A raw <img>, not next/image, for the reason `LibraryCourseCard`
          // documents: covers are arbitrary uploads on the media origin, which
          // is not in `next.config`'s `remotePatterns`. The fixed aspect box
          // means there is no CLS to guard against anyway.
          <img
            src={mediaUrl(course.coverKey)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="course-thumb flex h-full w-full flex-col items-center justify-center gap-2"
          >
            <span className="relative z-10 flex size-10 items-center justify-center rounded-full border border-study-line bg-study-tint text-study">
              <BookOpen size={18} />
            </span>
            <span className="mono relative z-10 text-[length:var(--fs-mono-label)] text-fg-muted">
              {course.subjectNameAr}
            </span>
          </span>
        )}

        {/* The progress figure rides ON the artwork rather than beside the
            title, so the number a returning student is looking for is the
            first thing on the card instead of the fourth. */}
        <span className="course-cover__badge mono tabular">
          {Math.round(course.progressPercent)}%
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <h3 className="min-w-0 text-[length:var(--fs-title-4)] font-medium text-fg">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {course.title}
          </Link>
        </h3>

        <LessonProgressBar percent={course.progressPercent} label={copy.dashboard.progressLabel} />

        <div className="flex items-center justify-between gap-3">
          <p className="mono tabular min-w-0 truncate text-[length:var(--fs-mono-label)] text-fg-muted">
            {course.completedLessons} {copy.dashboard.lessonsOf} {course.totalLessons}{' '}
            {copy.dashboard.lessonsWord}
          </p>

          <span className={cn('chip', done ? 'chip--done' : 'chip--solid')}>
            {done ? copy.dashboard.courseDone : cta}
          </span>
        </div>
      </div>
    </article>
  );
}
