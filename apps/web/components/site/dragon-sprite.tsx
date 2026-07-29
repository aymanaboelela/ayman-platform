'use client';

import { useRef } from 'react';
import { gsap } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';
import { DRAGON_SHEET } from '@/lib/brand-assets';

/**
 * The dragon mascot, flying.
 *
 * ## Frames
 *
 * The poses live in one sprite sheet (see `DRAGON_SHEET` in
 * `lib/brand-assets.ts`), and the wingbeat is a `background-position` step
 * through its cells. Two reasons this beats N separate `<img>` elements:
 * one network request instead of four, and no chance of a half-loaded cycle
 * flashing a missing frame on first play.
 *
 * The step is driven by tweening a plain number with a `steps()` ease rather
 * than by a CSS `@keyframes` sequence — a 2D grid needs a row AND a column per
 * frame, which a single CSS animation cannot express without hand-writing every
 * keyframe and rewriting them all if the grid changes.
 *
 * `yoyo` makes the cycle play forward then backward. For a wingbeat that is
 * what reads as flapping; looping 1→2→3→4→1 snaps back to the top of the
 * stroke and reads as a stutter.
 *
 * ## Compositing
 *
 * If the sheet has no alpha channel, it is composited with `screen` and a
 * feathered radial mask: the artwork's dark background falls away against the
 * stage and the lit dragon survives. That is a rescue, not a plan — a real
 * cut-out is cleaner, and setting `hasAlpha: true` turns both off.
 *
 * ## Motion
 *
 * The dragon drifts across the stage on scroll and bobs on its own clock. Both
 * stop under reduced motion, which leaves a single still pose — a dragon that
 * is simply there rather than a blank space.
 */
export function DragonSprite({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const sheet = DRAGON_SHEET;

  useGsap(
    ({ scope, reduced }) => {
      if (!sheet || reduced) return;

      const cell = scope.querySelector<HTMLElement>('.dragon__cell');
      if (!cell) return;

      // Tweened as a number, then mapped to a cell. Rounding rather than
      // flooring keeps the last frame reachable at progress exactly 1.
      const state = { frame: 0 };
      const lastCol = Math.max(1, sheet.cols - 1);
      const lastRow = Math.max(1, sheet.rows - 1);

      const flap = gsap.to(state, {
        frame: sheet.frames - 1,
        duration: (sheet.frames - 1) / sheet.fps,
        // One step per transition, not per frame — `steps(n)` divides the
        // tween into n intervals, and n frames have n-1 gaps between them.
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

      // Crosses the stage as the hero scrolls past — the flight path, as
      // opposed to the wingbeat above.
      const drift = gsap.fromTo(
        scope,
        { xPercent: 12, yPercent: 6 },
        {
          xPercent: -18,
          yPercent: -8,
          ease: 'none',
          scrollTrigger: {
            trigger: scope.closest('.hero') ?? scope,
            start: 'top top',
            end: 'bottom top',
            scrub: 1.2,
          },
        },
      );

      // A slow independent bob, so the dragon is alive even before the visitor
      // scrolls at all.
      const bob = gsap.to(scope.querySelector('.dragon__cell'), {
        y: '+=14',
        rotation: 1.5,
        duration: 3.4,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });

      return () => {
        flap.kill();
        drift.scrollTrigger?.kill();
        drift.kill();
        bob.kill();
      };
    },
    ref,
    [],
  );

  // No sheet registered yet: render nothing at all rather than an empty box.
  // The hero has a complete composition without it.
  if (!sheet) return null;

  return (
    <div className={`dragon ${className ?? ''}`} ref={ref} aria-hidden="true">
      <div
        className={`dragon__cell ${sheet.hasAlpha ? '' : 'dragon__cell--keyed'}`}
        style={{
          backgroundImage: `url(${sheet.src})`,
          // The sheet is scaled so ONE cell fills the element. A 2×2 grid means
          // the image is drawn at 200% × 200% of the box.
          backgroundSize: `${sheet.cols * 100}% ${sheet.rows * 100}%`,
        }}
      />
    </div>
  );
}
