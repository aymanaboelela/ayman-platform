'use client';

import { useEffect } from 'react';

/**
 * Where the VISIBLE part of the page actually is, published as
 * `--assistant-vv-top` and `--assistant-vv-height` on `<html>`.
 *
 * ## Why the first attempt was wrong
 *
 * It measured the keyboard — `innerHeight - visualViewport.height` — and spent
 * that as an offset, lifting the panel off the bottom of the layout viewport by
 * however much was covered. That reasoning holds only if `position: fixed`
 * means "glued to the bottom of what you can see". On iOS it does not.
 *
 * Safari keeps fixed elements against the LAYOUT viewport, and when the
 * keyboard opens it SCROLLS that viewport to reveal the focused field. So the
 * ground the panel is pinned to moves on its own, underneath an offset that was
 * calculated against where it used to be. The two corrections fight: the panel
 * drifts, jumps as `offsetTop` changes mid-scroll, and lands somewhere that is
 * neither where it started nor above the keyboard. That is the «الدنيا بتضرب»
 * this replaces, and no amount of tuning the subtraction fixes it — the premise
 * was wrong.
 *
 * ## What this does instead
 *
 * It stops computing an offset and reports the visible rectangle directly:
 * `visualViewport.offsetTop` is where the visible area starts inside the layout
 * viewport, and `visualViewport.height` is how tall it is. A `fixed` element
 * given exactly those two numbers as `top` and `height` covers what the user
 * can see — whatever the keyboard did, whatever Safari scrolled, on every
 * engine. There is nothing left to predict.
 *
 * ⚠️ Both values are only meaningful TOGETHER. Setting the top without the
 * height gives a sheet that starts in the right place and runs off the bottom
 * behind the keyboard, which is the original bug in a new position.
 */
export function useVisibleViewport(active: boolean): void {
  useEffect(() => {
    const root = document.documentElement;

    const clear = () => {
      root.style.removeProperty('--assistant-vv-top');
      root.style.removeProperty('--assistant-vv-height');
    };

    if (!active || typeof visualViewport === 'undefined' || visualViewport === null) {
      clear();
      return;
    }

    const viewport = visualViewport;
    let frame = 0;

    const publish = () => {
      frame = 0;
      /*
       * Pinch-zoom moves and shrinks the visual viewport by the same
       * mechanism, and following it there would drag the panel around under
       * the reader's fingers while they are trying to look at something.
       * Zoomed in, the panel stays where the layout puts it.
       */
      if (viewport.scale > 1) {
        clear();
        return;
      }

      root.style.setProperty('--assistant-vv-top', `${Math.round(viewport.offsetTop)}px`);
      root.style.setProperty('--assistant-vv-height', `${Math.round(viewport.height)}px`);
    };

    /*
     * Coalesced into a frame. iOS fires `scroll` on the visual viewport
     * continuously while the keyboard animates in and while the page moves
     * under it — writing two custom properties on `<html>` per event is a
     * style recalculation of the whole document per event, and the panel
     * visibly stutters as it follows.
     */
    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(publish);
    };

    publish();
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      /*
       * Cleared on close rather than left at its last value: the variables
       * describe a moment, and a stale one would place the next opening
       * against a keyboard that is no longer there.
       */
      clear();
    };
  }, [active]);
}
