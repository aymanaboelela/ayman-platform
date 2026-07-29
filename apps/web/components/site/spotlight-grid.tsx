'use client';

import { useRef, type ReactNode } from 'react';
import { gsap } from '@/lib/gsap';
import { useGsap } from '@/components/motion/use-gsap';

/**
 * A grid whose cards light up around the cursor — the "magic bento" effect.
 *
 * Built here rather than vendored: React Bits' `MagicBento` ships its own
 * hard-coded card data and renders its own grid, with the two pieces worth
 * having (`GlobalSpotlight`, `ParticleCard`) kept private. Using it on real
 * content would mean gutting the component, which is exactly what the vendor
 * README says not to do — a modified vendor file loses its edits on the next
 * fetch. The effect itself is two ideas and neither is large:
 *
 * 1. **A global spotlight.** One radial gradient follows the pointer across the
 *    whole grid, in `plus-lighter`, so the cards nearest the cursor read as lit
 *    and the far ones fall back into the page.
 * 2. **Per-card border glow.** Each card gets the pointer position in its OWN
 *    coordinates as `--mx` / `--my`; the CSS draws a gradient at that point and
 *    masks it to the border ring. The result is a highlight that travels around
 *    the card's edge as the cursor passes.
 *
 * Both are driven from ONE `pointermove` on the container. A listener per card
 * would be N listeners doing N `getBoundingClientRect()` calls per frame; this
 * measures once on enter and reuses the rects.
 *
 * `quickTo` rather than `gsap.to` per event: it reuses a single tween instance
 * instead of allocating one per pointer event, which at 120Hz is the difference
 * between a smooth follow and a garbage-collection stutter.
 */
export function SpotlightGrid({
  children,
  className,
  radius = 320,
}: {
  children: ReactNode;
  className?: string;
  /** Spotlight radius in pixels. */
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGsap(
    ({ scope, reduced }) => {
      if (reduced) return;

      // No cursor to follow on a touchscreen; the effect would only ever fire
      // on tap, which reads as a flash rather than as lighting.
      if (window.matchMedia('(pointer: coarse)').matches) return;

      const spot = scope.querySelector<HTMLElement>('.spotgrid__spot');
      if (!spot) return;

      const cards = gsap.utils.toArray<HTMLElement>('[data-spot-card]', scope);
      let rects: DOMRect[] = [];

      const moveX = gsap.quickTo(spot, 'x', { duration: 0.35, ease: 'power3' });
      const moveY = gsap.quickTo(spot, 'y', { duration: 0.35, ease: 'power3' });
      const fade = gsap.quickTo(spot, 'opacity', { duration: 0.4, ease: 'power2' });

      const measure = () => {
        rects = cards.map((card) => card.getBoundingClientRect());
      };

      const onEnter = () => {
        measure();
        fade(1);
      };

      const onMove = (event: PointerEvent) => {
        const bounds = scope.getBoundingClientRect();
        moveX(event.clientX - bounds.left);
        moveY(event.clientY - bounds.top);

        // Per-card pointer position, for the border ring. Written straight to
        // the style attribute rather than tweened: this value must track the
        // cursor exactly, and easing it makes the highlight lag behind the
        // spotlight it is supposed to belong to.
        for (let i = 0; i < cards.length; i++) {
          const rect = rects[i];
          const card = cards[i];
          if (!rect || !card) continue;
          card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
          card.style.setProperty('--my', `${event.clientY - rect.top}px`);
        }
      };

      const onLeave = () => fade(0);

      scope.addEventListener('pointerenter', onEnter);
      scope.addEventListener('pointermove', onMove);
      scope.addEventListener('pointerleave', onLeave);
      // Rects go stale on resize and on any reflow that moves the grid.
      const observer = new ResizeObserver(measure);
      observer.observe(scope);

      return () => {
        scope.removeEventListener('pointerenter', onEnter);
        scope.removeEventListener('pointermove', onMove);
        scope.removeEventListener('pointerleave', onLeave);
        observer.disconnect();
      };
    },
    ref,
    [],
  );

  return (
    <div
      className={`spotgrid ${className ?? ''}`}
      ref={ref}
      style={{ ['--spot-r' as string]: `${radius}px` }}
    >
      <span className="spotgrid__spot" aria-hidden="true" />
      {children}
    </div>
  );
}
