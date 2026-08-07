import Link from 'next/link';
import { Play } from 'lucide-react';
import { copy, type ContinueWatching } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { formatRemaining } from '@/lib/format';
import { CourseArt } from '@/components/course-art';
import { ChevronForward } from '@/components/player/icons';
import { LessonProgressBar } from '@/components/player/lesson-progress-bar';

/**
 * The single most important thing on the dashboard: the one link that puts a
 * returning student back exactly where they stopped. It is the only element
 * here that carries an accent-tinted surface, so it reads as the primary
 * action without a second competing button anywhere on the page.
 *
 * The whole card is the link (`::after` stretched over the card from the CTA),
 * so the click target is the card rather than the small chevron row — but the
 * accessible name still comes from one anchor, not from three nested ones.
 *
 * ## The thumbnail
 *
 * `ContinueWatchingSchema` carries no `coverKey` and no subject, so both arrive
 * as props from the page, which looks the course up in `enrolledCourses` — the
 * same payload, already fetched, already on screen further down. Widening the
 * contract to put two fields on a second object would mean the API sending the
 * same course's artwork twice per dashboard.
 *
 * They are optional because the lookup can miss: `continueWatching` resolves a
 * lesson, and an enrolment that has since been revoked or a course that has
 * since been unpublished drops out of `enrolledCourses` while the resume target
 * is still being computed. A missing thumbnail is then simply not drawn — the
 * card is a link with a title and a meter and works perfectly without one.
 */
export function ContinueWatchingCard({
  item,
  coverKey = null,
  subjectNameAr = null,
}: {
  item: ContinueWatching;
  coverKey?: string | null;
  subjectNameAr?: string | null;
}) {
  return (
    <article
      className={cn(
        'relative isolate overflow-hidden rounded-lg border p-4 sm:p-5',
        'border-[color-mix(in_oklch,var(--a-9),transparent_72%)]',
        'bg-[color-mix(in_oklch,var(--a-9),var(--n-2)_92%)]',
        'transition-colors duration-[160ms] ease-out',
        'hover:border-[color-mix(in_oklch,var(--a-9),transparent_52%)]',
        'focus-within:border-[color-mix(in_oklch,var(--a-9),transparent_40%)]',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        {subjectNameAr ? (
          /* A real piece of the course, not a generic glyph — it is the same
             artwork the course's own card carries further down the page, so a
             student recognises where they are being sent before reading the
             title. The play badge sits ON it rather than beside it: a thumbnail
             and a separate play disc next to each other are two marks making
             one point, and the pair took a third of the card's width.

             `lg`, not `sm`, and that is measured. Below 1024 this card shares
             its row with the rail, and 128px of artwork plus the remaining-time
             figure plus the button left the lesson title about 140px — it
             rendered as «المحاضـ…», which identifies no lesson at all. The
             title is the whole point of the card; the thumbnail is the
             flourish, so the thumbnail is what goes. The standalone disc below
             covers every width where it does. */
          <span className="relative hidden aspect-video w-32 shrink-0 items-center justify-center overflow-hidden rounded-md lg:flex">
            <CourseArt
              coverKey={coverKey}
              subjectNameAr={subjectNameAr}
              seed={item.courseSlug}
              compact
            />
            <span
              className="absolute inset-0 grid place-items-center bg-[rgb(0_0_0/0.28)]"
              aria-hidden="true"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-accent text-[#1A1206]">
                <Play className="size-4 translate-x-px fill-current" />
              </span>
            </span>
          </span>
        ) : null}

        {/* The mark for every width the thumbnail is not drawn at, and the
            fallback when the course lookup missed and there is no artwork to
            put a badge on. */}
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-[#1A1206]',
            subjectNameAr && 'lg:hidden',
          )}
          aria-hidden="true"
        >
          <Play className="size-5 translate-x-px fill-current" />
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="eyebrow text-accent-text">{copy.dashboard.continueWatching}</p>
          <p className="truncate text-[length:var(--fs-title-3)] font-medium text-fg">
            {item.lessonTitle}
          </p>
          <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted">
            {item.courseTitle}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {item.remainingSeconds > 0 ? (
            <span className="mono tabular text-[length:var(--fs-mono-label)] text-fg-muted">
              {copy.dashboard.remaining} {formatRemaining(item.remainingSeconds)}
            </span>
          ) : null}

          <Link
            href={`/courses/${item.courseSlug}/lessons/${item.lessonId}`}
            className={cn(
              'inline-flex items-center gap-2 rounded-sm bg-accent px-4 py-2',
              'text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
              'transition-colors duration-[160ms] ease-out hover:bg-accent-hover',
              // Stretches the anchor's hit area over the whole card. `isolate`
              // on the article keeps this overlay from escaping the card.
              'after:absolute after:inset-0 after:content-[""]',
            )}
          >
            {copy.dashboard.continueCta}
            <ChevronForward />
          </Link>
        </div>
      </div>

      <LessonProgressBar
        percent={item.progressPercent}
        label={copy.player.courseProgress}
        className="mt-4"
      />
    </article>
  );
}
