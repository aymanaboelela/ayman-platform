'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { copy } from '@ayman/contracts/copy';
import { gsap } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { MediaSlot } from '@/components/site/media-slot';
import { RotatingHeadline } from '@/components/site/rotating-headline';

const c = copy.landing;

export interface HeroStat {
  value: string;
  labelAr: string;
}

const DEFAULT_STATS: HeroStat[] = [
  { value: c.statStudents, labelAr: c.statStudentsLabel },
  { value: c.statRating, labelAr: c.statRatingLabel },
  { value: c.statHours, labelAr: c.statHoursLabel },
  { value: c.statProjects, labelAr: c.statProjectsLabel },
];

export interface SiteHeroProps {
  eyebrow?: string;
  headline?: string;
  /** The static second line, and the reduced-motion fallback for `rotating`. */
  subheadline?: string;
  rotating?: readonly string[];
  lead?: string;
  ctaLabel?: string;
  ctaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  stats?: readonly HeroStat[];
}

/**
 * One viewport tall, full bleed, dark in both themes.
 *
 * Every string is a prop with a copy-table default, so the section renders the
 * shipped page when mounted bare and the admin-composed one when the homepage
 * passes a `hero` block's props through. The defaults are not dead code — they
 * are what `/` falls back to when `home_blocks` is empty or the API is down
 * (see `lib/home-blocks.ts`).
 *
 * `data-site-hero` is the handle `SiteNav` looks for to decide whether it
 * starts transparent — see that component. Nothing else may claim the
 * attribute; a second one on the page makes the header flip against whichever
 * happens to be first in document order.
 */
export function SiteHero({
  eyebrow = c.heroEyebrow,
  headline = c.heroLine1,
  subheadline = c.heroLine2,
  rotating,
  lead = c.heroLead,
  ctaLabel = c.ctaPrimary,
  ctaHref = '/register',
  secondaryCtaLabel = c.ctaSecondary,
  secondaryCtaHref = '/courses',
  stats = DEFAULT_STATS,
}: SiteHeroProps = {}) {
  const ref = useRef<HTMLElement>(null);

  // An admin who clears every rotating line gets a static second line rather
  // than a headline that renders nothing — `RotatingHeadline` needs at least
  // one phrase to have something to show at rest.
  const phrases = rotating && rotating.length > 0 ? rotating : (c.heroRotating as readonly string[]);
  const rotates = rotating === undefined || rotating.length > 0;

  useGsap(
    ({ scope, reduced }) => {
      if (reduced) return;

      // ⚠️ EVERY TARGET IS CHECKED BEFORE IT IS TWEENED, and two of these are
      // genuinely absent on the shipped page rather than defensively so.
      //
      // The row of four figures came off the hero when `stats` went to `[]`,
      // and the hero renders nothing at all for an empty array — so
      // `.hero__stat` has matched an EMPTY NodeList ever since, which GSAP
      // reports as `GSAP target [object NodeList] not found` on every load, and
      // `.hero__media` is absent on any composition without one, logging the
      // same warning with a blank target. Both were doing exactly nothing
      // except printing two console warnings on the busiest page of the site.
      //
      // Guarding rather than deleting: `stats` is an admin-editable prop, so
      // the row can come back from /admin/home without code, and the entrance
      // should be waiting for it when it does.
      const lines = scope.querySelectorAll('[data-hero-line]');
      const media = scope.querySelector('.hero__media');
      const stats = scope.querySelectorAll('.hero__stat');

      // Entrance is written with `from()` so the resting DOM already carries
      // the final styles, which is what makes the early return above safe:
      // nothing is left at `opacity: 0`. See the contract in `use-gsap.ts`.
      const entrance = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.9 } });
      if (lines.length) entrance.from(lines, { y: 28, opacity: 0, stagger: 0.09 }, 0.1);
      if (media) entrance.from(media, { opacity: 0, duration: 1.4 }, 0);
      if (stats.length) entrance.from(stats, { y: 16, opacity: 0, stagger: 0.06 }, 0.5);

      // The stage drifts up half as fast as the page, so the copy separates
      // from the image on scroll instead of moving with it as one plate.
      if (media) {
        gsap.to(media, {
          yPercent: 12,
          ease: 'none',
          scrollTrigger: { trigger: scope, start: 'top top', end: 'bottom top', scrub: true },
        });
      }
    },
    ref,
    [],
  );

  return (
    <section ref={ref} className="hero" data-site-hero>
      {/* Layer order, back to front: stage/photograph → scrim → copy. */}
      <div className="hero__media">
        {/* The one image on the whole product that gets `fetchPriority="high"`.
            `.hero` is `min-height: 100svh` and is never display:none, so this is
            the LCP element on a phone; `priority` alone only emits the preload
            link, and that link sits first in <head> yet still queues at Low
            behind ~150 KB of render-blocking CSS. The hint is what moves it.

            q60 rather than the 75 default because nothing here is ever seen
            unveiled: `.hero__scrim` lays three stacked gradients over it, and on
            mobile the flat term is `color-mix(in oklch, var(--site-ink),
            transparent 68%)` across the entire frame, on top of the image's own
            `filter: saturate(0.92) contrast(1.04)`. Detail paid for at q75 is
            detail the scrim spends. 60 and not lower is the owner's call after
            comparing both scrim variants side by side at 390px. */}
        {/* ⚠️ `100vw` AT EVERY WIDTH, and the `58vw` this replaced was left over
            from a two-column hero that no longer exists. `.hero__media` is
            `position: absolute; inset: 0` on a full-bleed section, so the image
            IS the viewport — measured 1440×900 on a 1440px window. Declaring
            58vw asked the browser for 835px, which picked the `w=1080`
            candidate and then stretched it 1.33× to fill: the `#include
            <iostream>` overlay in the composite came out mushy and q60's
            blocking showed around the face. A `sizes` that under-declares is
            the one direction that cannot be recovered from — the optimiser
            serves exactly what was asked for. */}
        <MediaSlot
          kind="hero"
          alt=""
          priority
          fetchPriority="high"
          quality={60}
          sizes="100vw"
        />
      </div>
      <div className="hero__scrim" aria-hidden="true" />

      <div className="hero__body">
        <div className="hero__copy">
          {eyebrow ? (
            <p className="hero__eyebrow" data-hero-line>
              {eyebrow}
            </p>
          ) : null}

          <h1 className="hero__title">
            <span data-hero-line>{headline}</span>
            <span className="hero__title-accent" data-hero-line>
              {rotates ? (
                <RotatingHeadline phrases={phrases} className="hero__rotate" />
              ) : (
                subheadline
              )}
            </span>
          </h1>

          {lead ? (
            <p className="hero__lead" data-hero-line>
              {lead}
            </p>
          ) : null}

          <div className="hero__cta" data-hero-line>
            {ctaLabel ? (
              <Link className="site-btn site-btn--light" href={ctaHref}>
                {ctaLabel}
              </Link>
            ) : null}
            {secondaryCtaLabel ? (
              <Link className="site-btn site-btn--on-ink" href={secondaryCtaHref}>
                {secondaryCtaLabel}
              </Link>
            ) : null}
          </div>

          {stats.length > 0 ? (
            <dl className="hero__stats">
              {stats.map((stat) => (
                <div className="hero__stat" key={stat.labelAr}>
                  <dt className="hero__stat-n">{stat.value}</dt>
                  <dd className="hero__stat-l">{stat.labelAr}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}
