'use client';

import { useRef } from 'react';
import { useGsap } from '@/components/motion/use-gsap';

/**
 * The specular highlight on every button of the marketing surface — a soft
 * light that tracks the cursor across the button's face, as if the surface were
 * glossy.
 *
 * ## Why one listener, not one component
 *
 * The obvious shape is a `<SpecularButton>` wrapper. That would mean touching
 * every call site, and — worse — a `pointermove` listener per button. This page
 * has dozens; at 120Hz that is dozens of handlers competing for the same frame
 * to compute the same thing.
 *
 * Instead this mounts once in the `(site)` layout and listens on the document
 * with a single delegated handler. `event.target.closest('.site-btn')` finds
 * the button under the cursor, and only that one gets written to. Adding a
 * button anywhere on the surface opts it in automatically, with no import.
 *
 * The values land as `--sx` / `--sy` custom properties in the button's own
 * coordinate space; `theme.css` draws the highlight from them. Writing a custom
 * property does not invalidate layout — only paint on that one element — which
 * is what keeps this free.
 */
export function SpecularButtons() {
  const ref = useRef<HTMLSpanElement>(null);

  useGsap(
    ({ reduced }) => {
      // A highlight that tracks a cursor has nothing to track under reduced
      // motion or on a touchscreen, and the buttons look correct without it.
      if (reduced || window.matchMedia('(pointer: coarse)').matches) return;

      let current: HTMLElement | null = null;

      const onMove = (event: PointerEvent) => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest<HTMLElement>('.site-btn') ?? null;

        if (button !== current) {
          // Park the previous button's highlight off its own box rather than
          // clearing the property — clearing snaps it to the CSS default
          // (the centre) for one frame, which reads as a flash on exit.
          current?.style.setProperty('--sx', '-100%');
          current = button;
        }
        if (!button) return;

        const rect = button.getBoundingClientRect();
        button.style.setProperty('--sx', `${event.clientX - rect.left}px`);
        button.style.setProperty('--sy', `${event.clientY - rect.top}px`);
      };

      // `pointermove` on the document, passive: this never calls
      // `preventDefault`, and saying so lets the browser keep scrolling off the
      // main thread while the handler runs.
      document.addEventListener('pointermove', onMove, { passive: true });
      return () => {
        document.removeEventListener('pointermove', onMove);
        current?.style.removeProperty('--sx');
      };
    },
    ref,
    [],
  );

  return <span ref={ref} hidden />;
}
