'use client';

import { useEffect } from 'react';

export interface OutlineScrollToCurrentProps {
  /**
   * Not read — the effect finds the row through `[aria-current="page"]`, which
   * is markup the sidebar already emits. It is here as the effect's DEPENDENCY:
   * navigating between two lessons of the same course keeps this component
   * mounted and only swaps which row carries `aria-current`, so without it the
   * panel would stay parked on the lesson the student just left.
   */
  activeLessonId: string;
}

/**
 * Centres the lesson you are on inside the course outline, once per lesson.
 *
 * `<CourseOutlineSidebar>` is a Server Component and stays one — it renders
 * 40+ rows for a full course, and making it a Client Component would put that
 * whole list into the flight payload as raw props AND re-render it on the
 * device, which is the opposite of what bounding it was for. So the behaviour
 * lives here, in ~20 lines that render nothing.
 *
 * ## Why not `scrollIntoView`
 *
 * `Element.scrollIntoView()` scrolls EVERY scrollable ancestor, the document
 * included. The outline sits at the bottom of the lesson page on a phone and is
 * a sticky rail on a desktop, so asking the row to bring itself into view also
 * drags the document down — away from the video the student came for, and, on
 * `lg`, to the position where the sticky panel tucks under itself. (The runner
 * hit the same wall from the other side; `quiz-runner.tsx`'s `goTo` says so.)
 * Writing `scrollTop` moves the panel and nothing else, which is the entire
 * intent.
 *
 * ## Why the visible settle is acceptable
 *
 * This runs after hydration, so on a slow phone the panel paints at the top of
 * the list and then jumps. That is not CLS — the Layout Instability spec
 * excludes movement caused by scrolling — and the alternative (a scroll
 * position baked into the HTML) is not something a server can compute without
 * knowing row heights on the device.
 */
export function OutlineScrollToCurrent({ activeLessonId }: OutlineScrollToCurrentProps) {
  useEffect(() => {
    const panel = document.querySelector<HTMLElement>('[data-course-outline]');
    const current = panel?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!panel || !current) return;

    // A short course fits inside the bound and never became a scroller. There
    // is nothing to centre, and writing `scrollTop` would be a no-op anyway.
    if (panel.scrollHeight <= panel.clientHeight) return;

    // Only from rest. A student who started scrolling the panel during the
    // hydration gap has already said where they want it, and yanking that back
    // to "our" position is worse than never centring at all.
    //
    // Back-navigation is the case this deliberately does NOT exempt: the panel
    // remounts at 0 and is re-centred, because the App Router restores the
    // DOCUMENT's offset and never an inner scroller's — so "leave it alone"
    // would mean returning to an outline parked on lesson 1 of 40.
    if (panel.scrollTop !== 0) return;

    // Valid *because* of the guard above: with `scrollTop` at 0 the row's
    // viewport-relative offset from the panel is also its offset inside the
    // panel's scrolled content. Block axis only — the inline axis is the one
    // that flips under RTL, and this never touches it.
    const target =
      current.getBoundingClientRect().top -
      panel.getBoundingClientRect().top -
      (panel.clientHeight - current.offsetHeight) / 2;

    panel.scrollTop = Math.max(0, target);
  }, [activeLessonId]);

  return null;
}
