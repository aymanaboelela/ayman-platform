'use client';

import { useEffect, useRef } from 'react';

export interface OutlineScrollToCurrentProps {
  activeLessonId: string;
}

/**
 * Centres the current row inside the outline's own scroller on mount.
 *
 * Finds ITS OWN panel (`closest`), not the first `[data-course-outline]` on the
 * page: the outline is rendered twice on the lesson page — once in the desktop
 * rail, once inside the phone's bottom sheet — and a document-wide query from
 * the sheet's copy landed on the rail's, which is `display: none` on a phone
 * and has nothing to scroll.
 *
 * The scroller is `[data-outline-scroller]` when the panel has one (the unit
 * list, inside the sticky rail), else the panel itself.
 */
export function OutlineScrollToCurrent({ activeLessonId }: OutlineScrollToCurrentProps) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const panel = anchor.current?.closest<HTMLElement>('[data-course-outline]') ?? null;
    const scroller = panel?.querySelector<HTMLElement>('[data-outline-scroller]') ?? panel;
    // ANY value of `aria-current`, not `="page"`: the row writes
    // `aria-current="true"`, and a query for "page" found nothing, so the
    // panel opened at lesson 1 on every lesson of every course.
    const current = panel?.querySelector<HTMLElement>('[aria-current]');
    if (!scroller || !current) return;

    // A short course fits inside the bound and never became a scroller. There
    // is nothing to centre, and writing `scrollTop` would be a no-op anyway.
    if (scroller.scrollHeight <= scroller.clientHeight) return;

    // Only from rest. A student who started scrolling the panel during the
    // hydration gap has already said where they want it, and yanking that back
    // to "our" position is worse than never centring at all.
    //
    // Back-navigation is the case this deliberately does NOT exempt: the panel
    // remounts at 0 and is re-centred, because the App Router restores the
    // DOCUMENT's offset and never an inner scroller's — so "leave it alone"
    // would mean returning to an outline parked on lesson 1 of 40.
    if (scroller.scrollTop !== 0) return;

    // Valid *because* of the guard above: with `scrollTop` at 0 the row's
    // viewport-relative offset from the scroller is also its offset inside the
    // scrolled content. Block axis only — the inline axis is the one that
    // flips under RTL, and this never touches it.
    const target =
      current.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      (scroller.clientHeight - current.offsetHeight) / 2;

    scroller.scrollTop = Math.max(0, target);
  }, [activeLessonId]);

  return <span ref={anchor} hidden />;
}
