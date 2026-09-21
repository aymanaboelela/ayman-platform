'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { copy } from '@ayman/contracts/copy';
import { ScrollTrigger } from '@/lib/gsap';
import { tenantName } from '@/lib/tenant';
import { useGsap } from '@/components/motion/use-gsap';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * The name this header says out loud.
 *
 * It is read twice — as the logo link's `aria-label`, and as the wordmark's
 * `alt` when `<MediaSlot>` has no registered logo — so it is resolved once
 * here rather than pulled from `copy` at both call sites and gated at neither.
 *
 * `tenantName`, not `copy.site.name`: this header is mounted by
 * `(site)/layout.tsx` on EVERY public page, which makes it the first thing a
 * crawler and a screen reader meet on a second instructor's site. «أيمن أبو
 * العلا» in that position is not a cosmetic leak.
 *
 * ⚠️ This is the one `'use client'` file in the name gate, and the gate is
 * only as strong as the SERVER render. `TENANT_KEY` carries no `NEXT_PUBLIC_`
 * prefix, so it is present while the RSC payload is produced and absent from
 * the browser bundle, where `IS_AYMAN` falls back OPEN to `true`. What that
 * leaves correct is the thing that matters most here: the HTML that actually
 * ships — what a crawler reads, what a screen reader announces on first paint
 * — is built on the server. Both values also land on ATTRIBUTES rather than
 * text content, and React does not re-patch attribute mismatches during
 * hydration.
 *
 * The airtight fix is to resolve the name on the server and hand it to this
 * component as a PROP, which is an edit to `(site)/layout.tsx`. Until that
 * happens: do not move this read into anything that renders text on the
 * client, and do not copy this pattern into a client component whose output is
 * a visible string.
 */
const SITE_NAME = tenantName(copy.site.name);

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
export function SiteNav({
  accountSlot,
  brandSlot,
}: {
  accountSlot: ReactNode;
  /**
   * The round mark and the wordmark, already rendered.
   *
   * ⚠️ A NODE, for the same reason `accountSlot` is one. This component is
   * `'use client'`, so it cannot `await getBranding()` to find out whether the
   * instructor uploaded a logo — and the two `<MediaSlot>` calls that used to
   * sit here inline therefore had no way to be handed a key, which is why a
   * second instructor's header showed the first letter of their name in a
   * 36px circle no matter what they uploaded. See `<SiteBrandSlot>`.
   */
  brandSlot: ReactNode;
}) {
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
          {/*
            The LINK stays here and its contents stream in. `aria-label` is the
            reason the split lands on this boundary and not one element higher:
            the label is the brand announced to a screen reader, it is resolved
            at module load from `tenantName()`, and it must be in the very
            first HTML this header emits rather than arriving with a settings
            read that could be slow or could fail.
          */}
          <Link href="/" className="site-nav__logo" aria-label={SITE_NAME}>
            {brandSlot}
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
