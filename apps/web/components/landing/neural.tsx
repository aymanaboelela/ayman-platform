'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';

// `ssr: false` + module-scope dynamic: the three.js chunk is only fetched once
// the desktop gate below passes, so phones never request it.
const NeuralScene = dynamic(() => import('./neural-scene'), { ssr: false });

const DESKTOP_QUERY = '(min-width: 1024px)';

function subscribeDesktop(onChange: () => void): () => void {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function getDesktopSnapshot(): boolean {
  return window.matchMedia(DESKTOP_QUERY).matches;
}
function getDesktopServerSnapshot(): boolean {
  return false;
}
function useDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, getDesktopServerSnapshot);
}

/** A flat, static SVG version of the same net — server-rendered, zero WebGL.
 *  It is what mobile and reduced-motion-first paints see, and it never shifts
 *  layout when (or if) the live canvas replaces it. */
function NeuralPoster() {
  return (
    <svg viewBox="0 0 320 240" width="100%" height="100%" aria-hidden="true" fill="none">
      <g stroke="#fbbf24" strokeOpacity="0.4" strokeWidth="1">
        <path d="M60 60 L150 50 M60 60 L150 120 M60 120 L150 50 M60 120 L150 190 M60 180 L150 120 M60 180 L150 190" />
        <path d="M150 50 L240 90 M150 120 L240 90 M150 120 L240 150 M150 190 L240 150" />
      </g>
      {[
        [60, 60],
        [60, 120],
        [60, 180],
        [150, 50],
        [150, 120],
        [150, 190],
        [240, 90],
        [240, 150],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 7 : 5} fill={i % 3 === 0 ? '#ff8a1a' : '#fbbf24'} />
      ))}
    </svg>
  );
}

export function Neural() {
  const reduced = useReducedMotion();
  const isDesktop = useDesktop();

  return (
    <div className="lp-neural" aria-hidden="true">
      {isDesktop ? <NeuralScene reduced={reduced === true} /> : <NeuralPoster />}
    </div>
  );
}
