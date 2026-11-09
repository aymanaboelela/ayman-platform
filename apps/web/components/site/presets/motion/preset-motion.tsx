'use client';

import { useEffect, useRef } from 'react';

import type { PresetMotionConfig } from './preset-gsap';
import { mountPresetMotion } from './mount';

/**
 * Mounts the shared GSAP layer (`preset-gsap.ts`) on the `[data-preset]`
 * element it is rendered inside. Renders one empty, hidden node — the only
 * way a server-rendered page can hand a client effect its own root without
 * an id or a second hook on `<main>`.
 */
export function PresetMotion({ config }: { config: PresetMotionConfig }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-preset]');
    if (!root) return;
    return mountPresetMotion(root, config);
    // `config` is a module constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span ref={anchor} hidden aria-hidden="true" />;
}
