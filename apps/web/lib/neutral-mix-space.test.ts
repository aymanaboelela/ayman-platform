import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A state colour washed over a NEUTRAL mixes in `oklab`, never `oklch`.
 *
 * `oklch` interpolates HUE. That was harmless while the dark neutrals were a
 * near-achromatic warm black (#08090A, chroma 0.003 — Chrome treats a hue that
 * weak as powerless and keeps the state colour's own). The dark ramp is
 * ink-navy now (#0C0C18, chroma 0.025, hue ≈ 283°), and at that chroma the
 * neutral's hue COUNTS: a 12% `--err` over `--n-1` swung the short way round
 * the wheel to violet, `--ok` went indigo, and the pass and fail verdicts
 * became the same colour. Measured in Chrome before the fix.
 *
 * `oklab` is rectangular — no hue to interpolate — so the wash keeps the state
 * colour's hue at reduced chroma, in both themes. On the light page, whose
 * neutrals are near-achromatic, the result is the same colour it always was.
 *
 * Mixes with `transparent` are fine in either space (transparent has no hue),
 * and so are two neutrals mixed with each other.
 */
const WEB = join(import.meta.dirname, '..');
const REPO = join(WEB, '..', '..');
const ROOTS = [join(WEB, 'app'), join(WEB, 'components'), join(REPO, 'packages', 'ui', 'src')];

/** The ramp that was re-cut to navy, and the surfaces that alias it. */
const NEUTRAL = /var\(--(n-\d+|site-card(-2)?|site-bg|color-surface-\d)\)/;
/** Neutral enough that mixing it with the above is still a neutral: the ink
 *  panels are warm near-black in BOTH themes and did not move. */
const NEUTRALISH = /var\(--(n-\d+|site-card(-2)?|site-bg|color-surface-\d|ink(-2)?|site-ink)\)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(css|tsx|ts)$/.test(entry) && !entry.endsWith('.test.ts')) out.push(path);
  }
  return out;
}

/** Every `color-mix(in oklch, A, B)` call, with its two arguments. */
function oklchMixes(source: string): string[][] {
  const found: string[][] = [];
  const re = /color-mix\(\s*in oklch\s*,/g;
  for (let match = re.exec(source); match; match = re.exec(source)) {
    let depth = 1;
    let i = re.lastIndex;
    let arg = '';
    const args: string[] = [];
    for (; i < source.length && depth > 0; i++) {
      const ch = source[i]!;
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (depth === 1 && ch === ',') {
        args.push(arg.trim());
        arg = '';
      } else if (depth > 0) {
        arg += ch;
      }
    }
    args.push(arg.trim());
    found.push(args);
  }
  return found;
}

describe('washes over a neutral', () => {
  it('mix in oklab, so a navy dark page cannot turn red and green violet', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((root) => walk(root))) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
      for (const [a = '', b = ''] of oklchMixes(source)) {
        const neutralSide = NEUTRAL.test(a) || NEUTRAL.test(b);
        const bothNeutral = NEUTRALISH.test(a) && NEUTRALISH.test(b);
        const hasTransparent = /transparent|white|black/.test(a + b);
        if (neutralSide && !bothNeutral && !hasTransparent) {
          offenders.push(`${relative(REPO, file)}: color-mix(in oklch, ${a}, ${b})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
