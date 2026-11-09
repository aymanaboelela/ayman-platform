'use client';

import { useEffect } from 'react';

import type { PresetMotionConfig } from '../motion/preset-gsap';
import { mountPresetMotion } from '../motion/mount';

/** Cards that carry the cursor spotlight (`--mx` / `--my`). */
const LIT = '.board-course, .board-feature, .board-tile__link, .board-honor--row, .board-quote';
/**
 * Blocks that arrive once, the first time they come into view. Must match the
 * reveal note in `presets.css` (BOARD section) — the stylesheet keys on the
 * `data-in` this script writes, not on these names.
 */
const REVEALED = [
  '.board-band .board-head',
  '.board-about',
  '.board-id',
  '.board-faq',
  '.board-figures',
  '.board-course',
  '.board-feature',
  '.board-year',
  '.board-book',
  '.board-honor',
  '.board-quote',
  '.board-closer > *',
].join(', ');
/** Sections holding an infinite loop, paused (`data-still`) while off screen. */
const LOOPING = '.board-panel, .board-honors-band, .board-foot__closer';
/** Figures that count up the first time they scroll into view. */
const FIGURES = '.board-id__n, .board-panel__figure-n, .board-figure__n';

const BOARD_MOTION: PresetMotionConfig = {
  reveal: `${REVEALED}, .practice-invite__card`,
  titles: '.board-head__title, .practice-invite__title',
  media: '.board-course img, .board-book img, .board-about img',
  figures: FIGURES,
  magnetic: '.site-btn, .practice-btn',
  staggerVar: '--board-stagger',
};

/**
 * «اللوح»'s interactive layer — the one part of this page CSS cannot do on
 * its own (owner, 2026-11-04: «يبقى فعّال»).
 *
 * Two things, both progressive: the server HTML is the finished page, and
 * nothing here hides, moves or replaces content that isn't already there.
 *
 * 1. **The cursor.** One delegated `pointermove` on the page writes the
 *    pointer's position into CSS variables on the card under it; the
 *    stylesheet turns those into a light that follows the cursor. Only on a
 *    real hovering pointer. (It used to tilt course cards and year tiles too;
 *    see `presets.css` for why that went.)
 *
 * 2. **The figures.** «٦ كورس / ٢٨ محاضرة / ٢١ ساعة» count up from zero the
 *    first time they are seen. Only figures BELOW the fold on load are reset
 *    to zero, so nothing the visitor is already reading changes under them;
 *    the original text is restored exactly at the end, whatever it was
 *    («+500», «21 ساعة»). Skipped entirely under reduced motion.
 *
 * 3. **The reveals.** Each block below the fold is marked `data-in='no'`
 *    (hidden) and flipped to `'1'` once, when it first comes into view, and
 *    GSAP plays the entrance (`../motion/preset-gsap.ts`, shared with
 *    `studio`). Blocks already on screen get `'0'` and never move. This
 *    replaced a scroll-SCRUBBED reveal that followed the finger and faded
 *    content back out on the way up (owner, 2026-11-06).
 *
 * 4. **The loops.** Sections with an infinite animation get `data-still`
 *    while they are off screen, which pauses every animation inside them.
 *
 * Mounted once by `BoardLanding`. Its only markup is the reading-progress
 * line, which is pure CSS (a `scroll()` timeline) — it lives here so the page
 * gains one decorative child, not two.
 */
export function BoardMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-preset="board"]');
    if (!root) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cleanups: (() => void)[] = [];

    if (finePointer) {
      let frame = 0;
      const onMove = (event: PointerEvent) => {
        const card = (event.target as Element | null)?.closest<HTMLElement>(LIT);
        if (!card) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const box = card.getBoundingClientRect();
          const x = (event.clientX - box.left) / box.width;
          const y = (event.clientY - box.top) / box.height;
          card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
          card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        });
      };
      root.addEventListener('pointermove', onMove, { passive: true });
      cleanups.push(() => {
        cancelAnimationFrame(frame);
        root.removeEventListener('pointermove', onMove);
      });
    }

    // Reveals, title wipes and count-ups: the shared GSAP layer (2026-11-08),
    // which keeps every rule the hand-rolled observers here did — once, below
    // the fold only, `data-in` written for the podium CSS.
    cleanups.push(mountPresetMotion(root, BOARD_MOTION));

    if (!reduce && 'IntersectionObserver' in window) {
      const loops = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          (entry.target as HTMLElement).toggleAttribute('data-still', !entry.isIntersecting);
        }
      });
      // `document`, not `root`: the footer is its own `[data-preset='board']`
      // element outside `<main>`, and its closer carries one of the loops.
      for (const node of document.querySelectorAll<HTMLElement>(
        `[data-preset="board"] :is(${LOOPING})`,
      )) {
        loops.observe(node);
      }
      cleanups.push(() => loops.disconnect());
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return <div className="board-progress" aria-hidden="true" />;
}
