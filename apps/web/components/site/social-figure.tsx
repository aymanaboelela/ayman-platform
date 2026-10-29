'use client';

import { useEffect, useRef } from 'react';

/** The first run of digits in «+108 ألف» / «1.5 ألف» / «850». */
const NUMBER = /\d+(?:\.\d+)?/;

/**
 * A follower figure that counts up the first time it scrolls into view.
 *
 * ## The server's HTML is the final number, and stays the final number
 *
 * `.sp-fig__final` is the figure as `shortFollowerCount` wrote it, rendered on
 * the server and never rewritten — so a crawler, a screen reader, a no-JS
 * visit and a screenshot all read «+108 ألف». The count runs in a SECOND,
 * `aria-hidden` span stacked on the same grid cell, while the first goes
 * `color: transparent` (not `visibility: hidden`, which would drop it from the
 * accessibility tree mid-count). The final text keeps holding the cell's width
 * the whole time, so «+0 ألف» → «+108 ألف» moves no pixel around it.
 *
 * ## Only when it ENTERS the viewport
 *
 * Armed only if the figure is still below the fold at hydration. One already
 * on screen is left alone: dropping a number the visitor is reading to zero
 * and counting it back is the page loading twice (the hero's CSS entrance
 * exists for the same reason — `site-hero.tsx`). One already scrolled past is
 * left alone too.
 *
 * `prefers-reduced-motion` turns it off entirely: a number changing in front
 * of the eye is motion even if nothing moves. So does a figure with no digits
 * at all («ألف», «ألفين» — `arabicCount`'s one and two forms).
 */
export function SocialFigure({ text }: { text: string }) {
  const root = useRef<HTMLSpanElement>(null);
  const run = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const box = root.current;
    const live = run.current;
    const match = NUMBER.exec(text);
    if (!box || !live || !match) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (box.getBoundingClientRect().top < window.innerHeight) return;

    const target = Number(match[0]);
    const decimals = match[0].split('.')[1]?.length ?? 0;
    const head = text.slice(0, match.index);
    const tail = text.slice(match.index + match[0].length);
    const write = (value: number) => {
      live.textContent = `${head}${value.toFixed(decimals)}${tail}`;
    };

    // Armed while still off screen, so nobody sees the swap to zero.
    write(0);
    box.dataset.run = '';

    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      delete box.dataset.run;
      live.textContent = '';
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / DURATION_MS);
          // easeOutCubic: quick off the mark, settling on the figure the eye reads.
          write(target * (1 - (1 - t) ** 3));
          if (t < 1) frame = requestAnimationFrame(step);
          else finish();
        };
        frame = requestAnimationFrame(step);
      },
      // Starts once the figure is properly on screen, not on its first pixel.
      { rootMargin: '0px 0px -12% 0px' },
    );
    observer.observe(box);

    // The router keeps the DOM and re-runs effects on a soft navigation back
    // (`router-keeps-the-dom-reruns-effects`): whatever was mid-count goes back
    // to the server's figure before the next run decides afresh.
    return () => {
      observer.disconnect();
      finish();
    };
  }, [text]);

  return (
    <span ref={root} className="sp-fig">
      <span className="sp-fig__final">{text}</span>
      <span ref={run} className="sp-fig__run" aria-hidden="true" />
    </span>
  );
}

const DURATION_MS = 1600;
