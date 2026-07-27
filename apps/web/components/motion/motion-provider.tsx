'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/** Resolved after hydration, in its own chunk. See ./features. */
const loadFeatures = () => import('./features').then((mod) => mod.default);

/**
 * Wraps the whole app.
 *
 * `strict` makes `motion.div` throw at runtime — only `m.div` is legal — which is
 * the mechanical guarantee that nobody accidentally re-imports the 34kB bundle.
 * The `ayman/no-layout-animation` lint rule catches the same mistake earlier.
 *
 * `reducedMotion="user"` is on from day one: it removes transforms and layout
 * animations app-wide for users who asked for that, while PRESERVING opacity
 * fades. That combination — not "disable everything" — is the vestibular-safe
 * behaviour, and retrofitting it later means auditing every component.
 *
 * `children` is a prop, so passing Server Components through this client
 * component does not turn them into Client Components.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
