'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * "Inside a computer" — a fixed ambient layer behind the landing content: a
 * circuit grid, drifting code/binary fragments, and a faint neural brain. As you
 * scroll, GSAP ScrollTrigger parallaxes each layer at its own depth, so the page
 * feels like travelling deeper into the machine. Everything is `aria-hidden`,
 * pointer-transparent, and low-contrast so the copy stays readable; under
 * `prefers-reduced-motion` the parallax is skipped and the scene sits still.
 */

const BITS = [
  '01001110',
  'function()',
  '</>',
  'if (x > 0)',
  'model.fit()',
  '1010 0110',
  'return true',
  'while(true)',
  'def train():',
  'λx. x + 1',
  '∑ w·x',
  'neural.net',
  '0xF3A9',
  'print(ai)',
  '{ brain }',
  'import torch',
];

export function ComputerBackground() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || !root.current) return;
    const ctx = gsap.context(() => {
      const layers = gsap.utils.toArray<HTMLElement>('[data-depth]');
      layers.forEach((el) => {
        const depth = Number(el.dataset.depth) || 1;
        gsap.to(el, {
          yPercent: -14 * depth,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: 0.7 },
        });
      });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <div ref={root} className="lp-cbg" aria-hidden="true">
      <div className="lp-cbg-grid" data-depth="0.5" />

      {BITS.map((b, i) => (
        <span
          key={i}
          className="lp-cbg-bit"
          data-depth={(i % 3) + 1}
          style={{ left: `${(i * 61) % 94}%`, top: `${(i * 43) % 92}%` }}
        >
          {b}
        </span>
      ))}

      <svg className="lp-cbg-brain" data-depth="2.4" viewBox="0 0 240 200" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.9">
          <path d="M40 120 C40 70 90 50 120 70 C150 50 200 70 200 120 C200 160 150 176 120 158 C90 176 40 160 40 120Z" />
          <path d="M120 70 V158 M78 92 H162 M88 132 H156 M120 100 C100 100 96 120 116 124" />
        </g>
        {[
          [78, 92],
          [162, 92],
          [88, 132],
          [156, 132],
          [120, 70],
          [120, 158],
          [116, 124],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i % 2 ? 5 : 3.5} fill="currentColor" />
        ))}
      </svg>

      <div className="lp-cbg-glow" />
    </div>
  );
}
