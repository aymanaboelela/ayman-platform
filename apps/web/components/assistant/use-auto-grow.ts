'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * A composer that grows with what is typed into it, up to `maxPx`, and then
 * scrolls — a messenger's box rather than a form's.
 *
 * `field-sizing: content` does this in CSS alone, but only in Chromium; the
 * student's side is mostly Safari on an iPhone, where it would sit at one line
 * and scroll a paragraph through a slot. Measured here instead: collapse to
 * `auto`, read `scrollHeight`, set it. Written straight onto the element's
 * style — a size, not state — so it costs no render.
 */
export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx: number,
): void {
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = 'auto';
    const next = Math.min(field.scrollHeight, maxPx);
    field.style.height = `${next}px`;
    field.style.overflowY = field.scrollHeight > maxPx ? 'auto' : 'hidden';
  }, [ref, value, maxPx]);
}
