'use client';

import { useEffect } from 'react';

/** Cards that carry the cursor spotlight (`--mx` / `--my`). */
const LIT = '.board-course, .board-feature, .board-tile__link, .board-honor--row, .board-quote';
/** The subset that also tilts toward the cursor (`--rx` / `--ry`). */
const TILTED = '.board-course, .board-tile__link';
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
 *    stylesheet turns those into a light that follows the cursor and, on
 *    course cards and year tiles, a few degrees of tilt. Only on a real
 *    hovering pointer (a phone's tap would leave a card stuck mid-tilt), and
 *    the tilt not at all under reduced motion — the light is not motion.
 *
 * 2. **The figures.** «٦ كورس / ٢٨ محاضرة / ٢١ ساعة» count up from zero the
 *    first time they are seen. Only figures BELOW the fold on load are reset
 *    to zero, so nothing the visitor is already reading changes under them;
 *    the original text is restored exactly at the end, whatever it was
 *    («+500», «21 ساعة»). Skipped entirely under reduced motion.
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
          if (!reduce && card.matches(TILTED)) {
            card.style.setProperty('--rx', `${((0.5 - y) * 6).toFixed(2)}deg`);
            card.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
          }
        });
      };
      const onOut = (event: PointerEvent) => {
        const card = (event.target as Element | null)?.closest<HTMLElement>(LIT);
        if (!card || card.contains(event.relatedTarget as Node | null)) return;
        for (const name of ['--rx', '--ry']) card.style.removeProperty(name);
      };
      root.addEventListener('pointermove', onMove, { passive: true });
      root.addEventListener('pointerout', onOut, { passive: true });
      cleanups.push(() => {
        cancelAnimationFrame(frame);
        root.removeEventListener('pointermove', onMove);
        root.removeEventListener('pointerout', onOut);
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
