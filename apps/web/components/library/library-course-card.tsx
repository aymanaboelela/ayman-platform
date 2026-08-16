import Link from 'next/link';
import { Clock, Layers } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { formatDuration } from '@/components/site/course-card';
import { CourseArt } from '@/components/course-art';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';
import { enrolledCourseHref } from '@/lib/course-href';
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
  //
  // Through the SHARED helper, not a third hand-written copy of the rule. Two
  // copies of this expression already drifted into being identically wrong at
  // the same time; a correct third copy is only the next one waiting to.
  const href = enrolledCourseHref({ slug: course.slug, lastLessonId: course.nextLessonId });

  const cta = !enrolled ? c.start : done ? c.open : c.resume;

  return (
    <li className="panel flex flex-col overflow-hidden">
      {/* The coverless case is not a grey box any more — see `CourseArt`. The
          ratio here belongs to the GENERATED art, which has no intrinsic height
          and so needs a box to be drawn into; an uploaded cover brings its own
          shape and takes the card's full width at it. The grid stretches its
          rows, so a row mixing the two still lines up at the bottom. */}
      <div
        className={cn(
          'relative shrink-0 overflow-hidden',
          !course.coverKey && 'aspect-[16/8]',
        )}
      >
        <CourseArt
          coverKey={course.coverKey}
          subjectNameAr={course.subjectNameAr}
          seed={course.slug}
        />
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

        {/* The glyphs are ember and the figures stay muted: the icon is the
            category marker, the number is the fact. Amber on either would put
            two things on the card claiming to be the thing to press. */}
        <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--fs-mono-label)] text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <Layers size={14} aria-hidden="true" className="icon-inline text-study" />
            {c.lessonCount.replace('{n}', String(course.lessonCount))}
          </span>
          <span className="tabular inline-flex items-center gap-1.5">
            <Clock size={14} aria-hidden="true" className="icon-inline text-study" />
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
                {/* The ONE place green is spent on this screen. A finished
                    course is completion, which is what `--ok` means here and
                    in the quiz runner; every other state on the card stays
                    neutral so the word «خلصت» is the only thing that turns. */}
                <span
                  className={cn(
                    'text-[length:var(--fs-text-sm)]',
                    done ? 'font-medium text-ok' : 'text-fg-muted',
                  )}
                >
                  {done
                    ? c.courseDone
                    : c.percentDone.replace('{percent}', String(course.progressPercent))}
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

          {/*
            `.chip` rather than a bespoke button, so this control is the same
            object — same height, same radius, same amber — as the «مشاهدة»
            and «امتحن» chips on every lesson row inside the course. A student
            who has learned what the amber pill does on one screen does not
            have to relearn it on the other.

            `--solid` only while there is something to resume. An unenrolled
            course and a finished one both point somewhere useful but neither
            is the thing to press right now, so they take `--quiet` — the
            ember outline, which is structure's weight, not action's.
          */}
          <Link
            href={href}
            className={cn('chip w-full', enrolled && !done ? 'chip--solid' : 'chip--quiet')}
          >
            {cta}
          </Link>
        </div>
      </div>
    </li>
  );
}
