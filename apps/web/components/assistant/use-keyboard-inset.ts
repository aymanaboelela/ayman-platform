'use client';

import { useEffect } from 'react';

/**
 * How many pixels of the layout viewport are hidden right now, from the four
 * numbers a `VisualViewport` reports.
 *
 * Pure and exported because every interesting decision about the keyboard is
 * in these few lines, and none of them can be exercised through the hook
 * without a real device — see `use-keyboard-inset.test.ts`.
 *
 * ## The measurement, and why it is a subtraction
 *
 * ```
 * innerHeight - visualViewport.height - visualViewport.offsetTop
 * ```
 *
 * The layout viewport, minus what is actually visible, minus how far the page
 * has been scrolled up inside it. Deliberately NOT `screen.height` (which
 * counts browser chrome) and not a fixed guess at a keyboard's height (which
 * differs per device, per language, and grows when a suggestion strip or an
 * emoji row appears).
 *
 * Writing it as a DIFFERENCE is also what keeps it from double-counting on
 * Android. Where `interactive-widget=resizes-content` works — it is set in
 * `app/layout.tsx` — `innerHeight` has already shrunk, so `height` equals it
 * and this yields 0; the CSS is then moved by `100dvh` alone, exactly once. On
 * iOS Safari, which ignores that key and always overlays, `innerHeight` does
 * not move and this returns the keyboard's real height. The same expression is
 * right on both because it asks "what is hidden", not "is there a keyboard".
 */
export function hiddenByKeyboard(v: {
  innerHeight: number;
  height: number;
  offsetTop: number;
  scale: number;
}): number {
  /*
   * Pinch-zoom shrinks the visual viewport too, and nothing is covering the
   * page — lifting the panel then would move it away from the finger that is
   * pointing at it.
   */
  if (v.scale > 1) return 0;

  const hidden = v.innerHeight - v.height - v.offsetTop;

  /*
   * A 40px floor before this counts as a keyboard. Mobile browsers report a
   * few pixels of difference during ordinary scrolling as the URL bar
   * collapses, and a panel that twitches upward every time the page moves
   * reads as a bug even though the number is honest.
   */
  return hidden > 40 ? Math.round(hidden) : 0;
}

/**
 * Publishes {@link hiddenByKeyboard} as `--assistant-kb` on `<html>` while the
 * assistant panel is open.
 *
 * ## Why this is needed at all
 *
 * The panel is `position: fixed`, anchored to the bottom of the viewport, with
 * its composer at the bottom of the panel. On a phone that puts the text box
 * in exactly the strip the keyboard opens over — so tapping the box to type is
 * what HIDES it. Measured on a 390×844 phone before this existed: the textarea
 * sat at y=668–735, and a keyboard covers everything below roughly y=544. The
 * student tapped «اكتب سؤالك» and the box went away.
 *
 * On iOS it was worse than hidden. Safari keeps `position: fixed` against the
 * LAYOUT viewport and scrolls that viewport to reveal the focused field, so
 * the whole panel rode upward and its header left the top of the screen —
 * «بيطلع حاجات فوق».
 *
 * ⚠️ `100dvh` does not solve this on its own. `dvh` tracks the largest
 * viewport the browser's own UI leaves behind — the URL bar, not the keyboard.
 *
 * `globals.css` spends the variable in TWO places, `bottom` and `max-height`,
 * and the pair is the actual fix: raising the panel without shortening it is
 * what pushes its header off the top.
 */
export function useKeyboardInset(active: boolean): void {
  useEffect(() => {
    const root = document.documentElement;

    if (!active || typeof visualViewport === 'undefined' || visualViewport === null) {
      root.style.removeProperty('--assistant-kb');
      return;
    }

    const viewport = visualViewport;

    const measure = () => {
      root.style.setProperty(
        '--assistant-kb',
        `${hiddenByKeyboard({
          innerHeight: window.innerHeight,
          height: viewport.height,
          offsetTop: viewport.offsetTop,
          scale: viewport.scale,
        })}px`,
      );
    };

    measure();
    viewport.addEventListener('resize', measure);
    /*
     * `scroll` as well as `resize`: iOS scrolls the visual viewport to reveal a
     * focused field rather than resizing again, which changes `offsetTop`
     * without firing `resize`.
     */
    viewport.addEventListener('scroll', measure);

    return () => {
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
      /*
       * Cleared on close, not left at its last value: the launcher reads the
       * same variable, and a panel that closes while the keyboard is up would
       * otherwise leave the button floating in the middle of the screen.
       */
      root.style.removeProperty('--assistant-kb');
    };
  }, [active]);
}
