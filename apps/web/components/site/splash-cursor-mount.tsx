'use client';

import dynamic from 'next/dynamic';
import { rampHex } from '@/lib/ramp-color';
import { useAmbientEffectsAllowed } from '@/lib/use-media-query';

/**
 * React Bits' `SplashCursor` — a full-viewport WebGL fluid that reacts to the
 * pointer — mounted once at the root so it follows the cursor across every
 * page.
 *
 * It renders a `position: fixed`, `pointer-events: none` canvas, so it never
 * intercepts a click; it only paints over the page.
 *
 * Three guards, all here rather than in the vendored file so a re-fetch cannot
 * drop them:
 *
 * - **Off under reduced motion.** The whole component is continuous ambient
 *   movement tied to input; there is no reduced variant of it worth shipping.
 * - **Off on coarse pointers.** There is no hovering cursor to trail on a
 *   touchscreen, and the simulation is the single most expensive thing on the
 *   page — running it on phone GPUs to paint on taps is a bad trade.
 * - **Lazy and client-only.** A 41kB shader module has no business in the
 *   server bundle or on the critical path.
 *
 * Brand colours rather than the upstream rainbow: `RAINBOW_MODE` cycles the
 * full hue wheel, which on a page with one accent reads as a bug. WHOSE accent
 * is the question `rampHex` answers — the shader wants a concrete colour, which
 * used to be read as wanting a concrete AMBER, so a second instructor's cursor
 * trailed Ayman's orange across every page of their site.
 */
const SplashCursor = dynamic(() => import('@/components/site/vendor/splash-cursor'), {
  ssr: false,
});

export function SplashCursorMount() {
  const allowed = useAmbientEffectsAllowed();
  if (!allowed) return null;

  return (
    <SplashCursor
      RAINBOW_MODE={false}
      // `#F08A2E` is Ayman's, and it is a hand-picked value near step 500 rather
      // than the step itself, so it is passed through as his own and only
      // derived for anybody else. Safe to read here at render time: this whole
      // subtree is `ssr: false` and `allowed` is false until after mount, so
      // nothing this returns was ever part of a hydration.
      COLOR={rampHex(500, '#F08A2E')}
      // A faint warm wake, not a paint trail. This runs on EVERY page,
      // including forms and quizzes, so it has to stay at the edge of
      // perception — high dissipation clears it almost as fast as it is drawn,
      // and the small splat radius keeps it hugging the cursor instead of
      // washing across the content being read.
      DENSITY_DISSIPATION={7}
      VELOCITY_DISSIPATION={3.2}
      SPLAT_RADIUS={0.09}
      SPLAT_FORCE={3200}
      // Curl is what makes the wake swirl rather than fade as a straight
      // smear; kept low so it stays a hint of movement.
      CURL={2}
      SHADING
      // Below the upstream 1440: this is a soft glow behind a cursor, and the
      // extra dye texture per frame buys nothing visible at this opacity.
      DYE_RESOLUTION={768}
      SIM_RESOLUTION={112}
    />
  );
}
