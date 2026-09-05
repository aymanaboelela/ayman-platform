'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { copy } from '@ayman/contracts/copy';
import { ScrollTrigger } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { MediaSlot } from '@/components/site/media-slot';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The marketing header. Two states:
 *
 * - **over** — sitting on the hero's dark stage: no background, no border, full
 *   bleed, and the reading-progress bar hidden.
 * - **pinned** — past the hero: a floating card with a blurred background and
 *   the progress bar flush to its lower edge.
 *
 * The flip is driven by a ScrollTrigger on the hero element rather than a
 * scroll listener, so it shares the one rAF loop Lenis and GSAP already
 * cooperate on. A `scroll` handler here would read `scrollY` on a different
 * frame than ScrollTrigger reads it, and the header would visibly lag the
 * sections it sits above.
 *
 * The hero is rendered by the *page*, not by the layout, so this component
 * discovers it from the DOM. Pages without a hero (courses, years, essentials)
 * simply have no `[data-site-hero]` element and are pinned from the first
 * pixel — which is the correct look for them anyway, since their content
 * begins immediately under the header.
 *
 * ⚠️ THE ROUTE, NOT ONLY THE DOM PROBE, DECIDES THE STARTING STATE.
 *
 * `pinned` used to start `false` everywhere and be corrected by the effect
 * below. That made `--over` — no background at all — the state the header
 * falls back to whenever the effect does not get to run: a failed `gsap`
 * chunk, an error thrown earlier in the same layout effect, the markup before
 * hydration. On the landing page that is invisible, because `--over` sits on a
 * dark hero either way. On every OTHER page under the LIGHT theme it is the
 * whole header gone: the card is transparent, and everything inside it is
 * styled for a dark ground unconditionally (`#fff` wordmark, white-on-white
 * theme pill, white outline button — see `sections.css`), so the bar reads as
 * a blank strip with an orange knob floating in it.
 *
 * This component also OUTLIVES the route — it is mounted by the layout, so a
 * client navigation off the landing page keeps whatever `pinned` was — which
 * is why the pathname is a dependency of the effect and not just of the
 * initial state.
 *
 * `/` is the only route that renders `<SiteHero>`; anything else has no hero
 * to sit over, so the route answers the question the DOM probe answers, one
 * render earlier and without needing JavaScript to have run at all.
 */
export function SiteNav({ accountSlot }: { accountSlot: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();
  /** The only route that renders `<SiteHero>` — see the note above. */
  const hasHero = pathname === '/';
  const [pinned, setPinned] = useState(!hasHero);

  useGsap(
    ({ scope }) => {
      const progress = scope.querySelector<HTMLElement>('.site-nav__progress');
      const hero = document.querySelector<HTMLElement>('[data-site-hero]');

      // No hero on this route: the header is a card from the first pixel.
      // Re-asserted rather than assumed, because this component is not
      // remounted by a client navigation — it carries the previous route's
      // state in until something sets it.
      if (!hero) setPinned(true);
      else {
        const flip = ScrollTrigger.create({
          trigger: hero,
          // Flip once the header would otherwise be overlapping content
          // rather than the stage — one header height before the hero ends.
          start: 'bottom top+=80',
          onEnter: () => setPinned(true),
          onLeaveBack: () => setPinned(false),
        });

        /* `onEnter`/`onLeaveBack` only fire on a CROSSING, and this effect can
           now run on a route change into `/` carrying `pinned: true` from the
           page it came from — a state no crossing will ever correct if the
           reader is already at the top. Reading the trigger once at setup is
           what makes the two agree, and it covers the restored-scroll case in
           the same line: past the hero, `progress` is 1 and `isActive` false. */
        setPinned(flip.isActive || flip.progress > 0);
      }

      if (!progress) return;
      ScrollTrigger.create({
        trigger: document.documentElement,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          progress.style.transform = `scaleX(${self.progress})`;
        },
      });
    },
    ref,
    [pathname],
  );

  return (
    <header
      ref={ref}
      className={`site-nav ${pinned ? 'site-nav--pinned' : 'site-nav--over'}`}
      data-pinned={pinned}
    >
      <div className="site-nav__inner">
        <div className="site-nav__start">
          <Link href="/" className="site-nav__logo" aria-label={copy.site.name}>
            {/*
              The portrait is decorative here, not informative: the wordmark
              immediately after it states the name, and the Link already carries
              an aria-label. An alt describing the photo would make a screen
              reader announce the same brand twice, so it is empty by intent.

              `sizes` is pinned to the rendered box — the default '100vw' would
              have the browser pick a candidate for a full-width image and pull
              the largest one for a 36px circle.
            */}
            <MediaSlot kind="mark" alt="" className="site-mark" sizes="36px" />
            <MediaSlot kind="logo" alt={copy.site.name} />
          </Link>
          <ThemeToggle />
        </div>

        {/*
          Sign-in buttons for a visitor, the student's own account for someone
          already signed in — decided on the server and streamed in, because
          this component cannot read the session itself. See
          `<SiteAccountSlot>`.
        */}
        <nav className="site-nav__end" aria-label={copy.nav.home}>
          {accountSlot}
        </nav>
      </div>
      <span className="site-nav__progress" aria-hidden="true" />
    </header>
  );
}
