'use client';

import dynamic from 'next/dynamic';
import type { CSSProperties, ReactNode } from 'react';
import { useAmbientEffectsAllowed } from '@/lib/use-media-query';
import './electric-card.css';

/**
 * React Bits' `ElectricBorder` wrapped for this codebase.
 *
 * The effect is an animated glowing filament traced around the card on a
 * canvas. It is genuinely striking, and it is expensive: every instance runs
 * its own rAF loop walking several hundred points around the perimeter, two
 * `octavedNoise` evaluations per point, under two blurred glow layers. Three
 * guards keep that honest:
 *
 * - **Off under reduced motion, and off on any coarse pointer.** The border
 *   pulses continuously; there is no "settled" state to fall back to, so
 *   reduced motion has to mean off. Coarse pointers — every phone — are off
 *   for cost. `DEFAULT_HOME_BLOCKS` puts SIX of these on the landing page
 *   (three featured course cards, three year tracks) and `sections.css` keeps
 *   all six stacked and visible below 64rem, so nothing hides them there.
 *   Re-running the vendor file's noise functions over 300 frames in Node
 *   measured 2.500 ms/frame for a course card and 2.121 ms/frame for a track
 *   card on an M-series Mac — 13.9 ms/frame of pure `Math.sin` arithmetic for
 *   the six, on laptop-class silicon, before a single pixel is stroked. On a
 *   mid-range Android that is 55–85 ms/frame, on the one page every student
 *   arrives at from a WhatsApp link. The vendor file does park itself when it
 *   scrolls out of view and caps its redraw rate, but the cheapest version of
 *   six canvases and six blur stacks on a phone is not to have them.
 * - **Lazy and client-only.** Nothing about the effect is meaningful in the
 *   SSR'd HTML, and deferring it keeps it out of the critical path. Because
 *   the gate below returns before `<ElectricBorder>` is ever rendered, a phone
 *   never fetches the `next/dynamic` chunk OR `vendor/electric-border.css` at
 *   all — the saving is the whole module, not just the frames.
 * - **The card still reads as finished when it is off.** The fallback is not a
 *   bare `<div>`: it carries `.electric-card-fallback`, which draws a static
 *   gradient hairline in the same accent hue plus a soft wash. See
 *   `electric-card.css` for why the year cards and the course cards both need
 *   it. It is also what desktop renders on the server and during hydration,
 *   so the card arrives already edged and the effect upgrades it in place
 *   rather than popping a border onto a plate.
 *
 * `radius` must match the wrapped card's own `border-radius` in pixels — the
 * upstream component draws its border geometry from that number rather than
 * reading it back off the DOM, so a mismatch shows as a halo that does not
 * follow the corners. (It is the CANVAS geometry only; the fallback's ring
 * follows the plate's real radius instead — see `electric-card.css`.)
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
  // `false` before hydration: the static wrapper is what the server renders and
  // what hydrates, and the effect layers on afterwards. Same hook, same
  // "suppress until proven otherwise" default, as `splash-cursor-mount.tsx`.
  const allowed = useAmbientEffectsAllowed();

  if (!allowed) {
    return (
      <div
        // Appended, never replaced: `.course-card__inner` supplies this card's
        // padding, radius and background and the ring is drawn on top of that
        // box, not instead of it.
        className={className ? `${className} electric-card-fallback` : 'electric-card-fallback'}
        // The hue is per-instance (the active year track is a different orange
        // from its two flanks), so it has to reach CSS as a value rather than a
        // class — exactly how the effect itself passes `--electric-border-color`
        // down to `vendor/electric-border.css`. Everything the ring is actually
        // made of lives in the stylesheet.
        style={{ '--electric-card-fallback-color': color } as CSSProperties}
      >
        {children}
      </div>
    );
  }

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
