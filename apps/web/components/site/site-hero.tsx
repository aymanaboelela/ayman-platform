'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { copy } from '@ayman/contracts';
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

      // Entrance is written with `from()` so the resting DOM already carries
      // the final styles, which is what makes the early return above safe:
      // nothing is left at `opacity: 0`. See the contract in `use-gsap.ts`.
      gsap
        .timeline({ defaults: { ease: 'power3.out', duration: 0.9 } })
        .from(scope.querySelectorAll('[data-hero-line]'), { y: 28, opacity: 0, stagger: 0.09 }, 0.1)
        .from(scope.querySelector('.hero__media'), { opacity: 0, duration: 1.4 }, 0)
        .from(scope.querySelectorAll('.hero__stat'), { y: 16, opacity: 0, stagger: 0.06 }, 0.5);

      // The stage drifts up half as fast as the page, so the copy separates
      // from the image on scroll instead of moving with it as one plate.
      gsap.to(scope.querySelector('.hero__media'), {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: scope, start: 'top top', end: 'bottom top', scrub: true },
      });
    },
    ref,
    [],
  );

  return (
    <section ref={ref} className="hero" data-site-hero>
      {/* Layer order, back to front: stage/photograph → scrim → copy. */}
      <div className="hero__media">
        <MediaSlot kind="hero" alt="" priority sizes="(max-width: 1024px) 100vw, 58vw" />
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
