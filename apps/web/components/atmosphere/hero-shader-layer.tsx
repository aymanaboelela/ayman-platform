'use client';

import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * `next/dynamic` with `ssr: false` throws inside a Server Component in Next 15/16,
 * which is why this wrapper carries the client directive and the home page
 * imports the wrapper rather than the shader.
 */
const HeroShader = dynamic(() => import('./hero-shader'), { ssr: false });

/**
 * WebGL can be absent (old browser, disabled, headless CI). Detect once.
 *
 * `useSyncExternalStore`, not `useState` + `useEffect`: the capability never
 * changes after the first check, so there is nothing to subscribe to
 * (`subscribe` is a no-op), but the SSR/hydration split still needs handling
 * — `getServerSnapshot` returns `null` so the server and the first client
 * paint agree, and `getSnapshot` takes over immediately after. Calling
 * `setState` synchronously inside an effect body (the alternative) is a
 * documented cascading-render anti-pattern; this sidesteps it entirely.
 */
let cachedWebglSupport: boolean | null = null;
function getWebglSnapshot(): boolean | null {
  if (cachedWebglSupport !== null) return cachedWebglSupport;
  try {
    const canvas = document.createElement('canvas');
    cachedWebglSupport = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    cachedWebglSupport = false;
  }
  return cachedWebglSupport;
}
function getWebglServerSnapshot(): boolean | null {
  return null;
}
function subscribeNever(): () => void {
  return () => {};
}
function useWebglSupported(): boolean | null {
  return useSyncExternalStore(subscribeNever, getWebglSnapshot, getWebglServerSnapshot);
}

/**
 * The single WebGL moment in the product. Fixed, behind everything, inert.
 *
 * `pointer-events: none` is not optional: a full-viewport canvas that swallows
 * clicks is a total interaction failure that looks like a routing bug.
 */
export function HeroShaderLayer() {
  const reduced = useReducedMotion();
  const supported = useWebglSupported();

  if (supported !== true) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ contain: 'strict' }}
    >
      <HeroShader frozen={reduced === true} />
    </div>
  );
}
