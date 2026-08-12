'use client';

import { useRef } from 'react';
import { m, useInView, useReducedMotion } from 'motion/react';
import * as motionPresets from '@ayman/ui/motion';

/**
 * Sweeps a clip-path down over markup Shiki already highlighted on the server.
 *
 * Why not per-character `setState`: that is one render plus a full reconcile
 * every ~40ms for the duration of the animation, on the main thread, while the
 * user is trying to interact. It is a documented INP killer and it is the
 * obvious implementation, which is why it is called out here explicitly.
 *
 * `clip-path` is the one non-transform property this codebase animates. It
 * triggers paint but never layout, the container is already at its final height,
 * it runs once, and it is skipped entirely under reduced motion — where
 * `initial={false}` mounts the block fully revealed with no animation at all.
 *
 * The wipe is vertical (`inset(0 0 X% 0)`), which is direction-neutral: there is
 * no RTL mirror to get wrong.
 *
 * The viewport check is deliberately NOT `whileInView` on the clipped element
 * itself. Verified empirically in Chrome: an element whose OWN style already
 * includes `clip-path: inset(0 0 100% 0)` (a zero-area clip) is reported by
 * `IntersectionObserver` as never intersecting — the browser computes the
 * intersection rect from the clipped geometry, not the element's layout box —
 * so a `whileInView` observer attached to that same element can never fire and
 * the reveal deadlocks permanently at "fully hidden". `useInView` is attached
 * to a plain, unclipped wrapper instead, and that boolean drives the clipped
 * child's `animate` target.
 */
export function CodeReveal({
  html,
  minHeight,
  label,
  rounded,
}: {
  html: string;
  minHeight: number;
  label: string;
  rounded: 'all' | 'bottom';
}) {
  const reduced = useReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapperRef, { once: true, amount: 0.25 });
  const revealed = reduced === true || inView;

  return (
    <div
      ref={wrapperRef}
      role="figure"
      aria-label={label}
      style={{ minHeight }}
      className={
        rounded === 'all'
          ? 'overflow-hidden rounded-lg border border-line'
          : 'overflow-hidden rounded-b-lg border border-line'
      }
    >
      <m.div
        initial={reduced ? false : { clipPath: 'inset(0 0 100% 0)' }}
        animate={{ clipPath: revealed ? 'inset(0 0 0% 0)' : 'inset(0 0 100% 0)' }}
        transition={{ duration: 0.4, ease: motionPresets.EASE_OUT }}
        // `dangerouslySetInnerHTML` is safe here by construction: `html` is
        // Shiki's own serialiser output, applied on the server to code the
        // *admin* authored (never student input), and it never round-trips
        // through this component unsanitised from anywhere else. Rich text
        // authored through the admin still goes through `sanitize-html` on
        // write and DOMPurify at render — that path is unchanged by this file.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
