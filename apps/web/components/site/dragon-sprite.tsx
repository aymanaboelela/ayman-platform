'use client';

import { useRef } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { DRAGON_SHEET } from '@/lib/brand-assets';

/**
 * The dragon mascot, flying alongside the reader for the whole page.
 *
 * It is `position: fixed`, not parked in a section: the brief is that it comes
 * DOWN WITH YOU as you scroll. So its screen position is driven by the
 * document's scroll progress rather than by any one section's geometry — it
 * glides from the upper part of the viewport to the lower one over the length of
 * the page, drifting sideways on a sine so the path is a lazy S rather than a
 * straight drop.
 *
 * ## Frames
 *
 * The poses live in one sprite sheet (see `DRAGON_SHEET` in
 * `lib/brand-assets.ts`), and the wingbeat is a `background-position` step
 * through its cells — one request instead of four, and no chance of a
 * half-loaded cycle flashing a missing frame.
 *
 * The step is driven by tweening a plain number with a `steps()` ease rather
 * than a CSS `@keyframes` sequence: a 2D grid needs a row AND a column per
 * frame, which one CSS animation cannot express without hand-writing every
 * keyframe and rewriting them all if the grid changes.
 *
 * `yoyo` plays the cycle forward then backward. For a wingbeat that is what
 * reads as flapping; looping 1→2→3→4→1 snaps back to the top of the stroke.
 *
 * ## Why this REQUIRES a cut-out
 *
 * A page-level companion crosses every surface on the page — the dark hero, the
 * tinted bands, the white cards. Artwork painted on its own background can only
 * be keyed one way: `screen` erases dark backgrounds and `multiply` erases light
 * ones, and there is no third option that does both. A fixed element cannot pick
 * per section.
 *
 * So `hasAlpha: false` is not rendered at all here. A keyed sheet is fine parked
 * inside a section of known lightness; it cannot fly the whole page. Supplying a
 * transparent PNG and flipping the flag is the entire fix.
 *
 * ## Staying out of the way
 *
 * It is `pointer-events: none`, sits below the header, and fades out over the
 * footer — a mascot crossing the closing call to action is a mascot in the way.
 * It also hides itself on narrow viewports, where there is no column of empty
 * margin for it to fly down.
 */
export function DragonSprite() {
  const ref = useRef<HTMLDivElement>(null);
  // See "Why this REQUIRES a cut-out" above.
  const sheet = DRAGON_SHEET?.hasAlpha ? DRAGON_SHEET : undefined;

  useGsap(
    ({ scope, reduced }) => {
      if (!sheet || reduced) return;

      const cell = scope.querySelector<HTMLElement>('.dragon__cell');
      if (!cell) return;

      const mm = gsap.matchMedia();

      // ---- wingbeat: runs at every size, independent of scroll ----
      const state = { frame: 0 };
      const lastCol = Math.max(1, sheet.cols - 1);
      const lastRow = Math.max(1, sheet.rows - 1);

      const flap = gsap.to(state, {
        frame: sheet.frames - 1,
        duration: (sheet.frames - 1) / sheet.fps,
        // One step per TRANSITION: n frames have n-1 gaps between them.
        ease: `steps(${sheet.frames - 1})`,
        repeat: -1,
        yoyo: true,
        onUpdate: () => {
          const i = Math.round(state.frame);
          const col = i % sheet.cols;
          const row = Math.floor(i / sheet.cols);
          cell.style.backgroundPosition = `${(col / lastCol) * 100}% ${(row / lastRow) * 100}%`;
        },
      });

      // ---- flight path: only where there is margin to fly down ----
      mm.add('(min-width: 64rem)', () => {
        // A long, soft `scrub` is what makes the descent feel like gliding
        // rather than like a value bound to the scrollbar — the dragon keeps
        // moving for a beat after the wheel stops, which is how something with
        // mass behaves.
        const flight = gsap.timeline({
          scrollTrigger: {
            trigger: document.documentElement,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.6,
          },
        });

        flight
          .fromTo(scope, { yPercent: -8 }, { yPercent: 62, ease: 'none' }, 0)
          // Two crossings of the sine give one lazy S over the page's length.
          .fromTo(
            scope,
            { xPercent: 0 },
            { xPercent: 34, ease: 'sine.inOut', repeat: 1, yoyo: true },
            0,
          )
          // Banks into the turns, so the direction change looks flown rather
          // than slid.
          .fromTo(
            scope,
            { rotate: -4 },
            { rotate: 5, ease: 'sine.inOut', repeat: 1, yoyo: true },
            0,
          );

        // Out of the way of the closing CTA and the footer. `invalidateOnRefresh`
        // matters here: the trigger is measured at mount, before webfonts and
        // images have settled the page height, and a stale measurement puts the
        // fade in the wrong place — which showed up as a dragon stuck at
        // `opacity: 0` for the whole page.
        const fade = ScrollTrigger.create({
          trigger: '.site-footer',
          start: 'top 85%',
          end: 'top 40%',
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            scope.style.opacity = String(1 - self.progress);
          },
        });

        return () => {
          fade.kill();
          flight.scrollTrigger?.kill();
          flight.kill();
          scope.style.opacity = '';
        };
      });

      return () => {
        flap.kill();
        mm.revert();
      };
    },
    ref,
    [],
  );

  // No sheet registered yet: render nothing rather than an empty box.
  if (!sheet) return null;

  return (
    <div className="dragon" ref={ref} aria-hidden="true">
      <div
        className={`dragon__cell ${sheet.hasAlpha ? '' : 'dragon__cell--keyed'}`}
        style={{
          backgroundImage: `url(${sheet.src})`,
          // Scaled so ONE cell fills the element: a 2×2 grid draws the image at
          // 200% × 200% of the box.
          backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
        }}
      />
    </div>
  );
}
