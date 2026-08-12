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
      let bounds: DOMRect | null = null;

      const moveX = gsap.quickTo(spot, 'x', { duration: 0.35, ease: 'power3' });
      const moveY = gsap.quickTo(spot, 'y', { duration: 0.35, ease: 'power3' });
      const fade = gsap.quickTo(spot, 'opacity', { duration: 0.4, ease: 'power2' });

      // The container's own rect belongs here with the card rects, and for a
      // sharper reason than symmetry: `onMove` ends by writing `--mx`/`--my` to
      // every card's style attribute, which dirties layout. Reading any rect at
      // the top of the *next* event then forces the browser to flush that layout
      // synchronously before it can answer — a forced reflow on every single
      // pointer event, on the same page that is already running the LiquidEther
      // surface. Measured once here, nothing in the handler reads geometry at
      // all and the write stays a write.
      const measure = () => {
        bounds = scope.getBoundingClientRect();
        rects = cards.map((card) => card.getBoundingClientRect());
        return bounds;
      };

      const onEnter = () => {
        measure();
        fade(1);
        // Every rect above is viewport-relative, so a scroll invalidates all of
        // them while the ResizeObserver stays silent — the grid moves without
        // changing size. Previously only the per-card rings drifted (the
        // spotlight re-read its rect per event and so hid the problem); with
        // that read gone the spotlight would drift too, which is the visible
        // half. Re-measuring is only worth doing while the pointer is inside, so
        // the listener lives exactly as long as the spotlight is lit, and it is
        // capturing because a scroll in an ancestor scroller counts and those do
        // not bubble to `window`.
        window.addEventListener('scroll', measure, { passive: true, capture: true });
      };

      const onMove = (event: PointerEvent) => {
        // Normally `onEnter` has already measured; the fallback covers the case
        // where the cursor is standing inside the grid as it mounts, which
        // produces moves without ever crossing the boundary that fires `enter`.
        const box = bounds ?? measure();
        moveX(event.clientX - box.left);
        moveY(event.clientY - box.top);

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

      const onLeave = () => {
        window.removeEventListener('scroll', measure, { capture: true });
        fade(0);
      };

      scope.addEventListener('pointerenter', onEnter);
      // Passive, as in `specular-buttons.tsx`: this handler only reads the
      // cursor position and writes custom properties. On `pointermove`
      // specifically that is a statement of intent rather than a measurable win
      // — scrolling here is governed by `touch-action`, not by whether this
      // listener is cancelable — but it costs nothing and it means a future edit
      // reaching for `preventDefault` has to argue with the option first.
      scope.addEventListener('pointermove', onMove, { passive: true });
      scope.addEventListener('pointerleave', onLeave);
      // Rects go stale on resize and on any reflow that moves the grid.
      const observer = new ResizeObserver(measure);
      observer.observe(scope);

      return () => {
        scope.removeEventListener('pointerenter', onEnter);
        scope.removeEventListener('pointermove', onMove);
        scope.removeEventListener('pointerleave', onLeave);
        // Unmounting mid-hover means `onLeave` never runs.
        window.removeEventListener('scroll', measure, { capture: true });
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
