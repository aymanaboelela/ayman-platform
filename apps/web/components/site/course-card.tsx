import Link from 'next/link';
import { Clock, GraduationCap, Layers } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { CatalogCourse } from '@ayman/contracts/catalog';
import { CourseCover } from '@/components/site/course-cover';
import { ElectricCard } from '@/components/site/electric-card';
import { EmphasisBadge } from '@/components/emphasis-badge';
import { StreamBadge } from '@/components/stream-badge';
import { formatEGP } from '@/lib/price';

const c = copy.landing;

/**
 * The badge in the card's head — «مجاني بالكامل» for a free course, or the
 * cheapest plan's price for a priced one. `copy.course.priceMonthly`/
 * `priceQuarterly` are the SAME templates the course detail page's price line
 * uses (`{price}` already formatted EGP) — one number is what fits a badge
 * pill, so this prefers the monthly plan and falls back to quarterly only
 * when a course sells that one alone, rather than restating both.
 */
function priceBadge(course: CatalogCourse): string {
  if (course.monthlyPriceCents !== null) {
    return formatCopy(copy.course.priceMonthly, { price: formatEGP(course.monthlyPriceCents) });
  }
  if (course.quarterlyPriceCents !== null) {
    return formatCopy(copy.course.priceQuarterly, { price: formatEGP(course.quarterlyPriceCents) });
  }
  return c.courseFree;
}

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
  priority = false,
}: {
  course: CatalogCourse;
  electric?: boolean;
  /**
   * Preload this card's cover instead of lazy-loading it. For the FIRST card
   * in a grid only — see the note on `<Image>` below.
   */
  priority?: boolean;
}) {
  const href = `/courses/${course.slug}`;

  const card = (
    <>
      <div
        className={
          course.coverKey ? 'course-card__thumb course-card__thumb--bleed' : 'course-card__thumb'
        }
      >
        {course.coverKey ? (
          /*
           * Through the optimizer. The note that stood here said covers could
           * not be — "the media origin is not in `next.config`'s
           * `remotePatterns`, so the optimiser would reject them at request
           * time" — and that was never true: `next.config.ts` lists the media
           * origin with `pathname: '/media/**'`, which is the exact shape
           * `mediaUrl()` builds (`packages/ui/src/lib/branding.ts`). It is not
           * a CSP question either — `/_next/image` fetches server-side and
           * re-serves from OUR origin, so `proxy.ts`'s `img-src 'self'`
           * already covers it.
           *
           * What the raw `<img>` cost was a missing `srcset`: a 360px Android
           * downloaded exactly the bytes a 27" monitor did, for a box that is
           * ~300px wide on both. W2-09 caps the stored source at 1600px, which
           * is the difference between terrible and merely wasteful; this is
           * the rest of it.
           *
           * `fill`, not width/height: `.course-card__thumb` is already
           * `position: relative` with `aspect-ratio: 16 / 9`
           * (`(site)/styles/sections.css`), so the old note's other half still
           * holds — the box is reserved before the bytes arrive and there is
           * no CLS to guard against. `.course-card__thumb img`'s `object-fit:
           * cover` keeps applying; `fill` only supplies the absolute
           * positioning. `loading="lazy"` and `decoding="async"` are gone
           * because they are what `next/image` already does, and repeating
           * them here would imply they were a decision.
           *
           * `sizes` is measured off `.courses__grid` —
           * `repeat(auto-fill, minmax(min(100%, 19rem), 1fr))` with a 1.5rem
           * gap, inside a `.site-shell` of `min(1440px, 100vw)` less
           * `clamp(1rem, 4vw, 3.5rem)` on each side. That packs four columns
           * from ~1400px up (~314px each), three from ~1044px (304→413px), two
           * from ~688px (304→467px) and one below. Each entry below is the
           * UPPER bound of its band, and none of them subtracts the card's own
           * 0.75rem of padding: over-declaring buys a slightly bigger file,
           * under-declaring buys a visibly soft cover, so they round up.
           * `.profile__grid` packs the same card into 15rem columns, which is
           * narrower still and so already covered.
           */
          /*
            `priority` on the first card, lazy on every other.

            Measured on production, Pixel-7 emulation at 4x CPU throttle and
            Fast 3G: `/courses` and `/years/:year` BOTH reported an LCP of
            3.72s, and in both the LCP element was this image — the first
            course cover, served through `/_next/image` at `w=750&q=75`, about
            52 KB. Nothing else on either page came close.

            The cause was not the file. It was WHEN the browser learns about
            it: a lazy `<Image>` is discovered only once the layout has been
            computed, so on a phone the request starts after the CSS and the
            first JS chunk have already been fetched and parsed. `priority`
            emits a `<link rel="preload">` in the document head, which starts
            the fetch in the first round trip alongside them.

            Only the first card, and that matters. `priority` on all of them
            preloads the whole grid — 86 covers on a full catalog — which
            competes with the very image it is meant to accelerate and is a
            documented way to make LCP worse. One card is what is above the
            fold on a 390px viewport, where this grid is a single column.

            The call sites pass `index === 0`; the default is `false`, so the
            three other places that render this card are unaffected.
          */
          /*
            `<CourseCover>`, not a bare `<Image>`: the box is 16/9 and a cover
            is a designed poster of an unknowable ratio, so it is CONTAINED over
            a blurred copy of itself rather than cropped. See that component.
          */
          <CourseCover
            coverKey={course.coverKey}
            priority={priority}
            sizes="(min-width: 1400px) 320px, (min-width: 1044px) 32vw, (min-width: 688px) 46vw, 92vw"
          />
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
          <span className="course-card__badge">{priceBadge(course)}</span>
        </div>

        {/* Under the title, above the taxonomy meta: a visitor scanning for
            their own stream should find it before reading the system/track
            line, because it is the one fact that decides whether the rest of
            the card is for them at all. */}
        <StreamBadge forGeneral={course.forGeneral} forLanguages={course.forLanguages} />

        {/* Below the stream chips, not above them: the stream decides whether
            this card is for you AT ALL, and how strongly it is recommended is
            only worth reading once it is. Renders nothing when unset, which is
            most courses. */}
        <EmphasisBadge emphasis={course.emphasis} note={course.emphasisNote} />

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
