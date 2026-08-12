'use client';

import { m } from 'motion/react';
import * as motionPresets from '@ayman/ui/motion';
import type { ReactNode } from 'react';
import { asMotionVariants } from '@/lib/motion-cast';

/**
 * The ONE orchestrated scroll moment a page is allowed.
 *
 * Scroll-triggered fade-in on every section is the single loudest "AI-built
 * website" tell in the ban list. One moment per page, at most — enforced by the
 * Playwright assertion in Plan 7 Task 15, which counts `[data-orchestrated-reveal]`.
 *
 * `viewport={{ once: true }}` matters for more than taste: without it the
 * observer stays subscribed and re-runs the whole stagger every time the section
 * scrolls back into view, which is both distracting and a needless main-thread cost.
 *
 * `amount: 0.3` fires when 30% is visible. Firing at 0 makes the animation
 * finish before the user has looked at it.
 *
 * Under reduced motion, MotionConfig strips the `y` transform and leaves the
 * opacity fade — no extra branch is needed here.
 */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div
      data-orchestrated-reveal=""
      className={className}
      variants={asMotionVariants(motionPresets.staggerParent)}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </m.div>
  );
}

/** A direct child of <Reveal>. Inherits the parent's animation state by name. */
export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div className={className} variants={asMotionVariants(motionPresets.staggerChild)}>
      {children}
    </m.div>
  );
}
