import Link from 'next/link';
import { Clock, GraduationCap, Layers } from 'lucide-react';
import { copy } from '@ayman/contracts';
import type { CatalogCourse } from '@ayman/contracts';
import { mediaUrl } from '@ayman/ui/branding';
import { ElectricCard } from '@/components/site/electric-card';
import { StreamBadge } from '@/components/stream-badge';

const c = copy.landing;

/** Matches `.course-card`'s `--r-lg` in pixels — see `ElectricCard`. */
const CARD_RADIUS = 12;
const CARD_BORDER = '#D25C10';

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0
    ? `${hours} ${copy.catalog.hours} ${minutes} ${copy.catalog.minutes}`
    : `${minutes} ${copy.catalog.minutes}`;
}

/**
 * One catalog row as a card. Shared by the landing's featured strip,
 * `/courses` and `/years/[year]` so the three stay identical — the reference
 * uses one card everywhere and the moment they diverge the grids stop lining
 * up.
 *
 * With no `coverKey` the thumb falls back to a gradient panel carrying the
 * course's year in mono. That is deterministic per row rather than random, so
 * a grid of coverless courses reads as a set instead of as noise.
 *
 * `electric` adds the animated border. It is opt-in rather than always-on
 * because each instance runs its own canvas and `requestAnimationFrame` loop:
 * three of them on the landing's featured strip is a flourish, forty of them on
 * a full `/courses` grid is a fan-spinning scroll. Showpiece strips pass it;
 * catalog grids do not.
 */
export function CourseCard({
  course,
  electric = false,
}: {
  course: CatalogCourse;
  electric?: boolean;
}) {
  const href = `/courses/${course.slug}`;

  const card = (
    <>
      <div className="course-card__thumb">
        {course.coverKey ? (
          // A raw <img>, not next/image: covers are arbitrary uploads served
          // from the media origin, which is not in `next.config`'s
          // `remotePatterns`, so the optimiser would reject them at request
          // time. Sizing is fixed by the 16/9 thumb, so there is no CLS to
          // guard against either.
          <img src={mediaUrl(course.coverKey)} alt="" loading="lazy" decoding="async" />
        ) : (
          <>
            <span className="course-card__thumb-grid" aria-hidden="true" />
            <span className="course-card__thumb-mark" aria-hidden="true">
              {`YEAR ${course.year}`}
            </span>
          </>
        )}
      </div>

      <div className="course-card__body">
        <div className="course-card__head">
          <h3 className="course-card__title">
            <Link href={href}>{course.title}</Link>
          </h3>
          <span className="course-card__badge">{c.courseFree}</span>
        </div>

        {/* Under the title, above the taxonomy meta: a visitor scanning for
            their own stream should find it before reading the system/track
            line, because it is the one fact that decides whether the rest of
            the card is for them at all. */}
        <StreamBadge forGeneral={course.forGeneral} forLanguages={course.forLanguages} />

        <div className="course-card__meta">
          <span className="course-card__meta-row">
            <GraduationCap size={15} aria-hidden="true" />
            {course.systemNameAr}
            {course.trackLabelAr ? ` · ${course.trackLabelAr}` : ''}
          </span>
          <span className="course-card__meta-row">
            <Layers size={15} aria-hidden="true" />
            {course.lessonCount} {copy.catalog.lessonCount}
          </span>
          <span className="course-card__meta-row tabular-nums">
            <Clock size={15} aria-hidden="true" />
            {formatDuration(course.totalSeconds)}
          </span>
        </div>

        <Link className="site-btn site-btn--outline course-card__cta" href={href} tabIndex={-1}>
          {c.courseOpen}
        </Link>
      </div>
    </>
  );

  // The <li> stays the grid item either way, so turning the effect on never
  // changes the grid's geometry.
  //
  // The two `data-` attributes are what `<StreamFilter>` filters on. They are
  // on the grid ITEM rather than held in React state so the whole catalogue
  // stays in the server-rendered HTML: filtering is a CSS rule, every course
  // remains crawlable, and the page keeps prerendering.
  return (
    <li
      className={electric ? 'course-card course-card--electric' : 'course-card'}
      data-general={course.forGeneral ? '' : undefined}
      data-languages={course.forLanguages ? '' : undefined}
    >
      {electric ? (
        <ElectricCard
          color={CARD_BORDER}
          radius={CARD_RADIUS}
          speed={0.5}
          chaos={0.11}
          className="course-card__inner"
        >
          {card}
        </ElectricCard>
      ) : (
        card
      )}
    </li>
  );
}
