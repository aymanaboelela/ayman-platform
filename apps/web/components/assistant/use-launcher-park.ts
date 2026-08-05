'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Where the floating launcher comes to rest at the end of a page.
 *
 * ## The problem
 *
 * The launcher is `position: fixed`, which is exactly right for 99% of a page:
 * it stays put through any amount of scrolling and is always one tap away. At
 * the very BOTTOM of a page it stops being right, because the last screenful
 * is not more content — it is the sign-off: the copyright rule and, on the
 * marketing pages, the display-size wordmark with the dragons. A button pinned
 * 24px off the viewport floor lands on top of that, every time, and the page
 * ends with the brand wearing a button.
 *
 * ## The behaviour
 *
 * Fixed all the way down, then it PARKS: once the marked element rises into
 * the viewport the launcher rides up with it, staying a constant distance
 * above it. Nothing disappears and nothing waits for an animation — it tracks
 * the scroll one-to-one, so it reads as glued to the page rather than as
 * something that moved.
 *
 * ## Why a data attribute
 *
 * `[data-assistant-park]`, not `.site-footer__bar`. The launcher is mounted in
 * the ROOT layout and lives above `(site)`, `(app)` and `(admin)` alike; a
 * global widget reaching into one route group's stylesheet for a class name is
 * a coupling that breaks silently the first time that class is renamed. The
 * attribute is a contract in the other direction: a surface that has something
 * at its foot the launcher must not sit on says so itself. A surface that
 * marks nothing gets the plain fixed behaviour, which is the correct default.
 *
 * ## Why no React state
 *
 * The offset is written to a CSS custom property, not to `useState`. At 60fps
 * through the last screenful of a page, a state update per frame is a render
 * per frame of a component that is a sibling of the entire app. A custom
 * property on a `display: contents` carrier inherits to both the launcher and
 * the panel and costs one style recalc on two small elements instead.
 */

/** Marks an element the launcher must never come to rest on top of. */
export const PARK_SELECTOR = '[data-assistant-park]';

/** The custom property both the launcher and the panel read. */
export const PARK_PROPERTY = '--assistant-lift';

/**
 * The launcher may never ride higher than this fraction of the viewport.
 *
 * Not defensive decoration: `parkLift` is driven by the height of whatever
 * sits below the marked element, and a surface that marks something with a
 * very tall block under it would otherwise walk the launcher off the top of
 * the screen. Parking too high is a cosmetic flaw; parking off-screen is a
 * button nobody can press.
 */
const MAX_LIFT_RATIO = 0.4;

/**
 * How far to lift so the launcher clears an element whose top edge is at
 * `targetTop`.
 *
 * The launcher's resting place is a fixed distance off the viewport floor. To
 * keep that same distance above the marked element instead, it has to rise by
 * exactly how much of the viewport that element now occupies — `viewportHeight
 * - targetTop` — which is 0 for as long as the element is still below the fold
 * and grows one-to-one with the scroll after that. The gap cancels out of the
 * arithmetic, so this does not need to know what it is.
 *
 * Pure, and exported, because this is the part worth testing without a DOM.
 */
export function parkLift(viewportHeight: number, targetTop: number): number {
  if (!Number.isFinite(targetTop) || !Number.isFinite(viewportHeight)) return 0;
  const lift = viewportHeight - targetTop;
  if (lift <= 0) return 0;
  return Math.min(lift, viewportHeight * MAX_LIFT_RATIO);
}

/**
 * Keeps `PARK_PROPERTY` on `carrier` up to date for the current page.
 *
 * `pathname` is a dependency rather than a convenience: the marked element
 * belongs to the page, and a client-side navigation replaces it. Re-running on
 * every navigation is what stops the launcher parking against a footer that is
 * no longer in the document.
 *
 * `mounted` is a dependency for a sharper reason. The widget renders `null`
 * until hydration and on the routes it suppresses itself on, so the FIRST
 * commit has no carrier for this to attach to — `carrier.current` is null and
 * the effect correctly does nothing. Without a dependency that changes when
 * the element finally appears, that no-op is the only run there ever is: the
 * property is never written, the launcher never parks, and nothing anywhere
 * reports an error. It is exactly the failure this hook is easiest to ship
 * with, so it is named here rather than left to the reader.
 */
export function useLauncherPark(
  carrier: RefObject<HTMLElement | null>,
  pathname: string,
  mounted: boolean,
): void {
  useEffect(() => {
    const node = carrier.current;
    if (!mounted || !node) return;

    const targets = Array.from(document.querySelectorAll(PARK_SELECTOR));
    const write = (lift: number) => {
      node.style.setProperty(PARK_PROPERTY, `${Math.round(lift)}px`);
    };

    // Nothing to park above on this page. Clear whatever the last page set,
    // rather than leaving the launcher floating for no reason.
    if (targets.length === 0) {
      write(0);
      return;
    }

    let frame = 0;
    let tracking = false;

    const measure = () => {
      frame = 0;
      let lift = 0;
      for (const target of targets) {
        lift = Math.max(lift, parkLift(window.innerHeight, target.getBoundingClientRect().top));
      }
      write(lift);
    };

    /*
     * One measurement per frame, no matter how many scroll events arrive.
     * `getBoundingClientRect()` forces a style+layout flush, so calling it
     * per event rather than per frame is the difference between a free read
     * and a scroll that stutters on a mid-range Android.
     */
    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(measure);
    };

    const startTracking = () => {
      if (tracking) return;
      tracking = true;
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
    };

    const stopTracking = () => {
      if (!tracking) return;
      tracking = false;
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };

    /*
     * The observer is a GATE, not the measurement.
     *
     * An IntersectionObserver reports at threshold crossings, so it can say
     * "the sign-off is on screen" but not "and it is now 130px up". The
     * per-frame reads answer that, and this keeps them off the scroll path
     * entirely for the whole page above the footer — which is nearly all of
     * every page.
     */
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      if (visible.size > 0) {
        startTracking();
        schedule();
      } else {
        stopTracking();
        write(0);
      }
    });
    for (const target of targets) observer.observe(target);

    return () => {
      observer.disconnect();
      stopTracking();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [carrier, pathname, mounted]);
}
