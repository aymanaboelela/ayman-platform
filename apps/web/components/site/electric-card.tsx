'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useMediaQuery } from '@/lib/use-media-query';

/**
 * React Bits' `ElectricBorder` wrapped for this codebase.
 *
 * The effect is an animated SVG turbulence filter driving a pair of glowing
 * borders. It is genuinely striking, and it is expensive: every instance runs
 * its own `feTurbulence` animation, and SVG filters composite on the CPU on
 * most GPUs. Two guards keep that honest:
 *
 * - **Off under reduced motion.** The border pulses continuously; there is no
 *   "settled" state to fall back to. When it is off, `children` still renders
 *   inside a plain wrapper, so the card keeps its own border and radius and
 *   nothing shifts.
 * - **Lazy and client-only.** Nothing about the effect is meaningful in the
 *   SSR'd HTML, and deferring it keeps the filter out of the critical path.
 *
 * `radius` must match the wrapped card's own `border-radius` in pixels — the
 * upstream component draws its border geometry from that number rather than
 * reading it back off the DOM, so a mismatch shows as a halo that does not
 * follow the corners.
 */
const ElectricBorder = dynamic(() => import('@/components/site/vendor/electric-border'), {
  ssr: false,
});

export function ElectricCard({
  children,
  color,
  radius,
  speed = 0.5,
  // Upstream's default is 0.12; anything much above that and the filament
  // stops tracing the card's edge and starts scribbling across its neighbours.
  // `chaos` is a noise amplitude multiplied by a fixed 60px displacement
  // inside the effect, so small numbers here are large numbers on screen.
  chaos = 0.08,
  className,
}: {
  children: ReactNode;
  /** Any CSS colour the `oklch(from …)` relative syntax can consume. */
  color: string;
  radius: number;
  speed?: number;
  chaos?: number;
  className?: string;
}) {
  // `true` before hydration: the plain wrapper is what the server renders and
  // what hydrates, and the effect layers on afterwards.
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)', true);

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <ElectricBorder
      color={color}
      speed={speed}
      chaos={chaos}
      borderRadius={radius}
      className={className}
    >
      {children}
    </ElectricBorder>
  );
}
