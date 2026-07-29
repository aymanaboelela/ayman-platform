'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { copy } from '@ayman/contracts';
import { gsap } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { MediaSlot } from '@/components/site/media-slot';
import { RotatingHeadline } from '@/components/site/rotating-headline';

const c = copy.landing;

const STATS = [
  [c.statStudents, c.statStudentsLabel],
  [c.statRating, c.statRatingLabel],
  [c.statHours, c.statHoursLabel],
  [c.statProjects, c.statProjectsLabel],
] as const;

/**
 * One viewport tall, full bleed, dark in both themes.
 *
 * `data-site-hero` is the handle `SiteNav` looks for to decide whether it
 * starts transparent — see that component. Nothing else may claim the
 * attribute; a second one on the page makes the header flip against whichever
 * happens to be first in document order.
 */
export function SiteHero() {
  const ref = useRef<HTMLElement>(null);

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
          <p className="hero__eyebrow" data-hero-line>
            {c.heroEyebrow}
          </p>

          <h1 className="hero__title">
            <span data-hero-line>{c.heroLine1}</span>
            <span className="hero__title-accent" data-hero-line>
              <RotatingHeadline phrases={c.heroRotating} className="hero__rotate" />
            </span>
          </h1>

          <p className="hero__lead" data-hero-line>
            {c.heroLead}
          </p>

          <div className="hero__cta" data-hero-line>
            <Link className="site-btn site-btn--light" href="/register">
              {c.ctaPrimary}
            </Link>
            <Link className="site-btn site-btn--on-ink" href="/courses">
              {c.ctaSecondary}
            </Link>
          </div>

          <dl className="hero__stats">
            {STATS.map(([value, label]) => (
              <div className="hero__stat" key={label}>
                <dt className="hero__stat-n">{value}</dt>
                <dd className="hero__stat-l">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
