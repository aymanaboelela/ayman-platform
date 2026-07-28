'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * The hero signature: a code sample that types itself. The point it makes is
 * the one thing unique to THIS product — Arabic prose (RTL) and code (LTR)
 * living in the same frame. The editor body is `dir="ltr"`, the comment is
 * Arabic; that juxtaposition is the brand.
 *
 * Reduced motion is honoured hard: the whole sample is present on first paint,
 * no typing, no blinking caret. Typing is a progressive character reveal over a
 * fixed duration, so it never depends on frame rate or string length.
 */

type Cls = 'kw' | 'fn' | 'str' | 'num' | 'com';
interface Tok {
  t: string;
  c?: Cls;
}

const PROGRAM: Tok[] = [
  { t: '// دالة بتحسب متوسط الدرجات', c: 'com' },
  { t: '\n' },
  { t: 'function', c: 'kw' },
  { t: ' ' },
  { t: 'average', c: 'fn' },
  { t: '(marks) {\n' },
  { t: '  let', c: 'kw' },
  { t: ' total = ' },
  { t: '0', c: 'num' },
  { t: ';\n' },
  { t: '  for', c: 'kw' },
  { t: ' (' },
  { t: 'const', c: 'kw' },
  { t: ' m ' },
  { t: 'of', c: 'kw' },
  { t: ' marks) {\n' },
  { t: '    total += m;\n' },
  { t: '  }\n' },
  { t: '  return', c: 'kw' },
  { t: ' total / marks.length;\n' },
  { t: '}\n\n' },
  { t: 'average', c: 'fn' },
  { t: '([' },
  { t: '90', c: 'num' },
  { t: ', ' },
  { t: '75', c: 'num' },
  { t: ', ' },
  { t: '88', c: 'num' },
  { t: ']); ' },
  { t: '// 84.33', c: 'com' },
];

const TOTAL = PROGRAM.reduce((sum, tok) => sum + tok.t.length, 0);
const DURATION_MS = 1700;

function render(revealed: number) {
  const out: ReactNode[] = [];
  let seen = 0;
  for (let i = 0; i < PROGRAM.length; i += 1) {
    const tok = PROGRAM[i]!;
    if (seen >= revealed) break;
    const take = Math.min(tok.t.length, revealed - seen);
    const text = tok.t.slice(0, take);
    seen += tok.t.length;
    out.push(
      tok.c ? (
        <span key={i} className={`tok-${tok.c}`}>
          {text}
        </span>
      ) : (
        <span key={i}>{text}</span>
      ),
    );
  }
  return out;
}

export function CodeTyper() {
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    // setState lives only inside the rAF callback (never the effect body). When
    // reduced motion is on, the first frame resolves progress straight to 1, so
    // the whole sample appears at once with no typing and no further frames.
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const progress = reduce ? 1 : Math.min(1, (now - start) / DURATION_MS);
      setRevealed(Math.floor(TOTAL * progress));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [reduce]);

  return (
    <code className="lp-editor__code">
      {render(revealed)}
      <span className="lp-caret" aria-hidden="true" />
    </code>
  );
}
