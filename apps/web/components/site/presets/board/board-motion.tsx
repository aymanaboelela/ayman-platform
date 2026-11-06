'use client';

import { useEffect } from 'react';

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
/** Gap between blocks that come into view in the same frame (a row of cards). */
const STAGGER_MS = 80;
const STAGGER_MAX_MS = 320;
/** Figures that count up the first time they scroll into view. */
const FIGURES = '.board-id__n, .board-panel__figure-n, .board-figure__n';

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
 *    (hidden) and flipped to `'1'` once, when it first comes into view, which
 *    plays a time-based entrance. Blocks already on screen get `'0'` and never
 *    move. This replaced a scroll-SCRUBBED reveal that followed the finger
 *    and faded content back out on the way up (owner, 2026-11-06).
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

    if (!reduce && 'IntersectionObserver' in window) {
      const fold = window.innerHeight;
      const pending: HTMLElement[] = [];
      for (const node of root.querySelectorAll<HTMLElement>(REVEALED)) {
        // Already on screen (or above it, after a restored scroll): shown, still.
        const seen = node.getBoundingClientRect().top < fold;
        node.dataset.in = seen ? '0' : 'no';
        if (!seen) pending.push(node);
      }

      const reveal = new IntersectionObserver(
        (entries) => {
          let order = 0;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const node = entry.target as HTMLElement;
            reveal.unobserve(node);
            node.style.setProperty('--board-stagger', `${Math.min(order * STAGGER_MS, STAGGER_MAX_MS)}ms`);
            node.dataset.in = '1';
            order += 1;
          }
        },
        // A little before the block is fully up, so it is moving while the
        // reader's eye gets there rather than after.
        { rootMargin: '0px 0px -8% 0px' },
      );
      for (const node of pending) reveal.observe(node);

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

      cleanups.push(() => {
        reveal.disconnect();
        loops.disconnect();
        // A remount must never leave a block hidden behind a dead observer.
        for (const node of pending) {
          if (node.dataset.in === 'no') node.dataset.in = '0';
        }
      });
    }

    if (!reduce && 'IntersectionObserver' in window) {
      const pending = new Map<HTMLElement, { text: string; digits: string; value: number }>();
      for (const node of root.querySelectorAll<HTMLElement>(FIGURES)) {
        const text = node.textContent ?? '';
        const digits = text.match(/\d[\d,]*/)?.[0];
        if (!digits) continue;
        const value = Number(digits.replace(/,/g, ''));
        // Already on screen: leave it alone rather than blank it under the reader.
        if (!Number.isFinite(value) || value === 0 || node.getBoundingClientRect().top < window.innerHeight) {
          continue;
        }
        pending.set(node, { text, digits, value });
        node.textContent = text.replace(digits, '0');
      }

      const run = (node: HTMLElement) => {
        const figure = pending.get(node);
        if (!figure) return;
        pending.delete(node);
        const start = performance.now();
        const duration = 1400;
        const step = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const eased = 1 - (1 - t) ** 3;
          if (t < 1) {
            node.textContent = figure.text.replace(
              figure.digits,
              Math.round(figure.value * eased).toLocaleString('en-US'),
            );
            requestAnimationFrame(step);
          } else {
            node.textContent = figure.text;
          }
        };
        requestAnimationFrame(step);
      };

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            observer.unobserve(entry.target);
            run(entry.target as HTMLElement);
          }
        },
        { threshold: 0.6 },
      );
      for (const node of pending.keys()) observer.observe(node);
      cleanups.push(() => {
        observer.disconnect();
        // A remount mid-count must not leave a zero behind.
        for (const [node, figure] of pending) node.textContent = figure.text;
      });
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return <div className="board-progress" aria-hidden="true" />;
}
