'use client';

import { gsap, ScrollTrigger } from '@/lib/gsap';

/**
 * The GSAP layer the teachers' landing presets share («يبقى فيه انيميشن من
 * GSAP بشكل حلو», owner, 2026-11-08 — for Sabry on `studio` and Adel on
 * `board`).
 *
 * One function, one config per preset, so both pages move with the same
 * grammar and a fix to the timing lands on both.
 *
 * ## The rules it keeps — every one of them was learned on these pages
 *
 * 1. **Arrivals, never scrubs.** Each block plays ONCE, at its own pace, the
 *    first time it comes into view (`ScrollTrigger.batch` + `once`). A reveal
 *    glued to the finger was the «انيميشن غريب» of 2026-11-06 (see the board
 *    reveal note in `presets.css`).
 * 2. **Nothing the reader can already see moves.** Only blocks BELOW the fold
 *    at mount are hidden; whatever is on screen (or above it, after a
 *    restored scroll) is left exactly as the server sent it.
 * 3. **No JS, reduced motion, or a throw = the finished page.** Every hidden
 *    state is written here, inline, by GSAP — none lives in a stylesheet — and
 *    the context is reverted on any failure, which restores it. Same contract
 *    as `components/motion/use-gsap.ts`.
 * 4. **The DOM React owns is never restructured.** No word splitting: these
 *    are server components, and a soft refresh reconciles against the markup
 *    it rendered. (Splitting Arabic by letter would also break its joining.)
 * 5. **`data-in` is still written** (`no` → `1`, or `0` for what was already
 *    on screen), because the board's podium and title-rule CSS key on it.
 */
export interface PresetMotionConfig {
  /** Blocks that rise in once. A block inside another listed block is skipped. */
  reveal: string;
  /** Section titles that wipe up as they arrive. */
  titles?: string;
  /** Pictures that settle from a slight zoom — only inside a clipping parent. */
  media?: string;
  /** Figures that count up from zero the first time they are seen. */
  figures?: string;
  /** Buttons that lean toward the cursor (writes `--mag-x` / `--mag-y`). */
  magnetic?: string;
  /**
   * A CSS variable that receives each block's place in its batch (`90ms`,
   * `180ms`…), for stylesheet animations that should step in with GSAP's
   * stagger — the board's podium and title rule read `--board-stagger`.
   */
  staggerVar?: string;
}

const BELOW_FOLD = (node: Element) => node.getBoundingClientRect().top >= window.innerHeight;

/**
 * Wires the layer onto `root` and returns its teardown. Safe to call again
 * on the same DOM after the teardown (a soft navigation re-runs effects on
 * the nodes it kept — see the router note in the repo's memory of it).
 */
export function runPresetMotion(root: HTMLElement, config: PresetMotionConfig): () => void {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const pendingReveal: HTMLElement[] = [];
  const pendingFigures = new Map<HTMLElement, string>();
  const detach: (() => void)[] = [];

  const ctx = gsap.context(() => {
    try {
      if (!reduce) {
        reveal(root, config, pendingReveal);
        if (config.figures) countUp(root, config.figures, pendingFigures);
      }
      if (finePointer && !reduce && config.magnetic) detach.push(magnetic(root, config.magnetic));
    } catch {
      // Ornament only — the page behind it is the product. `revert()` below
      // puts every block back where the server drew it.
      ctx.revert();
    }
  }, root);

  return () => {
    for (const off of detach) off();
    ctx.revert();
    // A teardown mid-flight must never leave a block hidden or a zero behind.
    for (const node of pendingReveal) if (node.dataset.in === 'no') node.dataset.in = '0';
    for (const [node, text] of pendingFigures) node.textContent = text;
  };
}

function reveal(root: HTMLElement, config: PresetMotionConfig, pending: HTMLElement[]): void {
  const all = [...root.querySelectorAll<HTMLElement>(config.reveal)];
  const outermost = all.filter((node) => !node.parentElement?.closest(config.reveal));

  for (const node of outermost) {
    if (BELOW_FOLD(node)) {
      node.dataset.in = 'no';
      pending.push(node);
    } else {
      node.dataset.in = '0';
    }
  }
  if (pending.length === 0) return;

  gsap.set(pending, { autoAlpha: 0, y: 56, scale: 0.96, transformOrigin: '50% 100%' });

  // Titles and pictures INSIDE a pending block arrive with it, a beat apart.
  const titles = config.titles
    ? pending.flatMap((node) => [...node.querySelectorAll<HTMLElement>(config.titles!), ...(node.matches(config.titles!) ? [node] : [])])
    : [];
  if (titles.length) gsap.set(titles, { clipPath: 'inset(0% 0% 100% 0%)', y: 18 });

  const media = config.media
    ? pending.flatMap((node) =>
        [...node.querySelectorAll<HTMLElement>(config.media!)].filter((img) => {
          // A picture that is not clipped would grow OUT of its card.
          const parent = img.parentElement;
          return parent ? getComputedStyle(parent).overflow !== 'visible' : false;
        }),
      )
    : [];
  if (media.length) gsap.set(media, { scale: 1.14 });

  ScrollTrigger.batch(pending, {
    once: true,
    start: 'top 90%',
    interval: 0.08,
    batchMax: 6,
    onEnter: (batch) => {
      const nodes = batch as HTMLElement[];
      nodes.forEach((node, i) => {
        if (config.staggerVar) node.style.setProperty(config.staggerVar, `${i * 90}ms`);
        node.dataset.in = '1';
      });

      gsap.to(nodes, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.09,
        // Hover lifts and the board's cursor light live on `transform`; an
        // inline one left behind would cancel them for good.
        clearProps: 'transform,opacity,visibility',
      });

      const inside = (list: HTMLElement[]) => list.filter((el) => nodes.some((node) => node.contains(el)));
      const ownTitles = inside(titles);
      if (ownTitles.length) {
        gsap.to(ownTitles, {
          // Past the box on every side, so descenders and diacritics are
          // never shaved while the wipe settles.
          clipPath: 'inset(-20% -6% -30% -6%)',
          y: 0,
          duration: 1,
          delay: 0.12,
          ease: 'expo.out',
          stagger: 0.09,
          clearProps: 'clipPath,transform',
        });
      }
      const ownMedia = inside(media);
      if (ownMedia.length) {
        gsap.to(ownMedia, { scale: 1, duration: 1.6, ease: 'power2.out', stagger: 0.09, clearProps: 'transform' });
      }
    },
  });
}

function countUp(root: HTMLElement, selector: string, pending: Map<HTMLElement, string>): void {
  for (const node of root.querySelectorAll<HTMLElement>(selector)) {
    const text = node.textContent ?? '';
    const digits = text.match(/\d[\d,]*/)?.[0];
    if (!digits) continue;
    const value = Number(digits.replace(/,/g, ''));
    // Already on screen: leave it alone rather than blank it under the reader.
    if (!Number.isFinite(value) || value === 0 || !BELOW_FOLD(node)) continue;

    pending.set(node, text);
    node.textContent = text.replace(digits, '0');
    const counter = { n: 0 };
    gsap.to(counter, {
      n: value,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: node, start: 'top 85%', once: true },
      onUpdate: () => {
        node.textContent = text.replace(digits, Math.round(counter.n).toLocaleString('en-US'));
      },
      onComplete: () => {
        // The exact original, whatever it was («+500», «21 ساعة»).
        node.textContent = text;
        pending.delete(node);
      },
    });
  }
}

/**
 * Buttons lean a few pixels toward the cursor and spring back when it
 * leaves. Writes CSS variables, never `transform`: the buttons' own hover
 * lift is a `transform`, and the stylesheet composes the two through the
 * separate `translate` property (`presets.css`, «magnetic»).
 */
function magnetic(root: HTMLElement, selector: string): () => void {
  const PULL = 0.28;
  const MAX = 10;
  let active: HTMLElement | null = null;

  const release = (el: HTMLElement) => {
    gsap.to(el, { '--mag-x': '0px', '--mag-y': '0px', duration: 0.7, ease: 'elastic.out(1, 0.45)' });
  };

  const onMove = (event: PointerEvent) => {
    const el = (event.target as Element | null)?.closest<HTMLElement>(selector) ?? null;
    if (active && active !== el) release(active);
    active = el;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-MAX, Math.min(MAX, v));
    const x = clamp((event.clientX - (box.left + box.width / 2)) * PULL);
    const y = clamp((event.clientY - (box.top + box.height / 2)) * PULL);
    gsap.to(el, { '--mag-x': `${x.toFixed(1)}px`, '--mag-y': `${y.toFixed(1)}px`, duration: 0.35, ease: 'power3.out' });
  };
  const onLeave = () => {
    if (active) release(active);
    active = null;
  };

  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerleave', onLeave);
  return () => {
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('pointerleave', onLeave);
  };
}
