'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { rampHex } from '@/lib/ramp-color';
import { useAmbientEffectsAllowed } from '@/lib/use-media-query';

/**
 * React Bits' `LiquidEther` — a real-time WebGL fluid simulation — as a live
 * section backdrop. Currently the `/essentials` hero.
 *
 * Deliberately NOT on the landing hero: that section is reserved for the
 * instructor photograph, and a fluid running behind a portrait fights it.
 *
 * Everything guarding the simulation lives here rather than in the vendored
 * file, so that file can be re-fetched from the registry without losing any of
 * it:
 *
 * - **Client-only, lazily.** `ssr: false` keeps a 40kB shader module and its
 *   `three` dependency out of the server bundle and off first paint. The
 *   section has a complete static composition underneath; the fluid layers over
 *   it once it arrives, so there is no hole while it loads and no CLS.
 * - **Off under reduced motion.** A continuously-advecting fluid is exactly the
 *   kind of ambient movement `prefers-reduced-motion` exists to suppress. The
 *   check runs after mount because the media query does not exist on the
 *   server; until then nothing is rendered, which is also the correct state.
 * - **Off on coarse pointers.** The simulation is driven by cursor velocity —
 *   on a phone there is no cursor to drive it, so it degrades to an autoplay
 *   loop that costs a GPU-bound rAF on the least capable hardware for almost no
 *   visual return.
 * - **Brand palette.** Three steps of our orange ramp instead of the upstream
 *   purples, as concrete values because the shader interpolates colours and
 *   cannot resolve `var()`. Concrete is not the same as AMBER, though, which is
 *   what the literals below quietly assumed — see `rampHex`, which reads the
 *   same three rungs off whatever ramp the tenant's own hue generated.
 */
const LiquidEther = dynamic(() => import('@/components/site/vendor/liquid-ether'), {
  ssr: false,
});

/**
 * The 500/600/800 rungs, flattened to hex for the shader.
 *
 * The hexes are AYMAN's — measured, they sit near those three steps rather than
 * on them, so nothing derived reproduces them and his fluid must keep them
 * exactly. `rampHex` hands them straight back on his stack and reads the
 * tenant's own ramp anywhere else; see the long note there.
 */
const FLUID_STEPS = [
  [500, '#F08A2E'],
  [600, '#D25C10'],
  [800, '#7A3410'],
] as const;

export function LiquidBackdrop({ className }: { className?: string }) {
  const allowed = useAmbientEffectsAllowed();
  // Memoised for the ARRAY's identity, not for the arithmetic — `rampHex`
  // caches per step already. `LiquidEther` rebuilds its dye texture whenever
  // `colors` changes, so handing it a fresh array on every render would restart
  // the simulation each time anything above this re-renders.
  const colors = useMemo(() => FLUID_STEPS.map(([step, ayman]) => rampHex(step, ayman)), []);
  if (!allowed) return null;

  return (
    <div className={className} aria-hidden="true">
      <LiquidEther
        colors={colors}
        // Half-resolution simulation upscaled by the GPU. At full resolution
        // this pins a mid-range integrated GPU for a backdrop sitting behind a
        // scrim at well under full opacity, where the detail is invisible.
        resolution={0.4}
        mouseForce={16}
        cursorSize={90}
        isViscous
        viscous={26}
        iterationsViscous={16}
        iterationsPoisson={16}
        // Keeps the surface alive before the pointer ever reaches the section,
        // and resumes a couple of seconds after the visitor stops moving.
        autoDemo
        autoSpeed={0.4}
        autoIntensity={1.8}
        autoResumeDelay={2400}
      />
    </div>
  );
}
