import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `var(--x)` the app reads must be a `--x` something defines.
 *
 * ## The failure this exists for
 *
 * A branch renamed the study surface's structure ramp from `--v-*` to `--e-*`
 * in `packages/ui/src/tokens/color.css`. Another branch, concurrently, added
 * `app/(admin)/admin.css` reading `--v-stage`. The two files are disjoint, so
 * the merge produced no conflict at all — and every guard the repo has stayed
 * green:
 *
 *   - the build passed
 *   - typecheck passed
 *   - every unit and e2e test passed
 *
 * …and the admin course page rendered with no background, because an
 * undefined custom property is not an error. `background: var(--v-stage)` with
 * nothing defining `--v-stage` is simply no background. CSS has no
 * "unknown identifier"; it has silence.
 *
 * A textual conflict would have been SAFER, because it forces a human to look.
 * This test is the thing that looks.
 *
 * ## Why it reads the files rather than the browser
 *
 * A rendered-page check would only cover the routes it happened to visit, and
 * the whole point is the token nobody visited. Reading every stylesheet and
 * every `var(--…)` in TSX catches a rename the moment it lands, in the package
 * that owns the rename, without a browser.
 */

const WEB = join(import.meta.dirname, '..');
const REPO = join(WEB, '..', '..');

/** Where definitions may live. Tokens are global; consumers are everywhere. */
const DEFINITION_ROOTS = [
  join(REPO, 'packages', 'ui', 'src'),
  join(WEB, 'app'),
  join(WEB, 'components'),
];

/** Where uses may live. */
const USE_ROOTS = [join(WEB, 'app'), join(WEB, 'components'), join(REPO, 'packages', 'ui', 'src')];

const STYLE_OR_MARKUP = /\.(css|tsx|ts)$/;

/**
 * Block comments go before anything is scanned, on BOTH sides.
 *
 * These files document their own tokens in prose, and a sentence about a token
 * is neither a definition of it nor a use of it.
 */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (STYLE_OR_MARKUP.test(entry)) out.push(full);
  }
  return out;
}

const definitionFiles = [...new Set(DEFINITION_ROOTS.flatMap((d) => walkFiles(d)))];
const useFiles = [...new Set(USE_ROOTS.flatMap((d) => walkFiles(d)))];

/**
 * Anything that DEFINES a property counts, wherever it is written:
 *
 *   `--x: value`            a plain declaration, in CSS or a style={{}} object
 *   `@property --x`         a registered custom property
 *   `setProperty('--x', …)` a property written from JS
 *
 * Tailwind v4's `@theme` block declares `--color-*` tokens the same way, so it
 * is covered by the first pattern without a special case.
 */
const DEFINITION_PATTERNS = [
  /(?:^|[\s;{"'`(])(--[\w-]+)\s*:/g,
  /@property\s+(--[\w-]+)/g,
  /setProperty\(\s*['"`](--[\w-]+)['"`]/g,
];

/**
 * TS/TSX only: a custom property named as a quoted STRING is a write —
 * `style={{ '--glyph-a': opacity }}` and its `['--spot-r' as string]` cast
 * form. Reads never look like this; a read is `var(--x)`.
 *
 * Deliberately NOT applied to CSS, and single/double quotes only. A backtick
 * pair is how these files write a token name in PROSE — «`--e-stage` is a
 * surface that carries white text» — and matching that made every documented
 * token count as defined, which silently disarmed this whole guard: renaming
 * `--e-stage` out of the token file still passed, because the sentence
 * describing it in study.css was registering it.
 */
const JS_WRITE = /['"](--[\w-]+)['"]/g;

const defined = new Set<string>();
for (const file of definitionFiles) {
  // Comments are stripped from DEFINITIONS too, and that is the load-bearing
  // half: a token that only ever appears in prose is a token nothing defines,
  // and counting it would hide precisely the break this guard exists for.
  const source = stripComments(readFileSync(file, 'utf8'));
  for (const pattern of DEFINITION_PATTERNS) {
    for (const match of source.matchAll(pattern)) defined.add(match[1]!);
  }
  if (/\.tsx?$/.test(file)) {
    for (const match of source.matchAll(JS_WRITE)) defined.add(match[1]!);
  }
}

/**
 * `var(--x)` and `var(--x, fallback)`.
 *
 * A use WITH a fallback is still reported. `var(--gone, red)` renders red
 * rather than nothing, so it is not the silent failure above — but it is still
 * a reference to a token that does not exist, and the fallback is almost never
 * the value anyone intended. The exemption list below is for the handful of
 * cases where a fallback genuinely is the design.
 */
const USE = /var\(\s*(--[\w-]+)/g;

/**
 * Properties that are legitimately read before anything defines them.
 *
 * Each one is set at RUNTIME — by a component's inline style or by script —
 * and read by a stylesheet that must work before it exists. They are listed
 * individually, with the writer named, so this list cannot quietly become a
 * place to silence a real break.
 */
const RUNTIME_DEFINED = new Set<string>([
  // Written by `next/font` onto <html> from `layout.tsx`'s font declarations.
  '--font-sans',
  '--font-mono',
  '--font-display',
  '--font-plex-arabic',
  '--font-plex-mono',
  // Written by Shiki onto the HTML it generates, per token, at highlight time.
  '--sh-light',
  '--sh-light-bg',
  '--sh-dark',
  '--sh-dark-bg',
  // Tailwind v4 ships its own theme layer; `--radius-*` comes from there
  // rather than from any file in this repo.
  '--radius-xl',
  // A customisation hook: `.hero-bloom` reads `var(--bloom-x, 88%)` so a
  // caller can move the glow, and 88% is the design when nobody does. One of
  // the few places a fallback is genuinely the intended value.
  '--bloom-x',
]);

/**
 * A name built by interpolation — `var(--n-${step})` — reaches this scan as
 * the literal prefix `--n-`. There is no token to check, and the real ones it
 * expands to are covered by their own definitions.
 */
const INTERPOLATED = /-$/;

const uses = new Map<string, string[]>();
for (const file of useFiles) {
  const source = stripComments(readFileSync(file, 'utf8'));
  for (const match of source.matchAll(USE)) {
    const token = match[1]!;
    if (defined.has(token) || RUNTIME_DEFINED.has(token) || INTERPOLATED.test(token)) continue;
    const where = relative(REPO, file);
    uses.set(token, [...(uses.get(token) ?? []), where]);
  }
}

describe('CSS custom property coverage', () => {
  /*
   * The guard itself. If this fails, a `var(--x)` somewhere reads a token
   * nothing defines — most likely because a ramp was renamed and one consumer
   * was missed. The fix is never to add the token to `RUNTIME_DEFINED`; it is
   * to rename the consumer or restore the definition.
   */
  it('defines every custom property the app reads', () => {
    const orphans = [...uses.entries()]
      .map(([token, files]) => `${token} — used in ${[...new Set(files)].join(', ')}`)
      .sort();

    expect(orphans, `undefined custom properties:\n  ${orphans.join('\n  ')}`).toEqual([]);
  });

  /*
   * A guard that scans nothing passes forever. These two assertions are what
   * make the one above meaningful — if a refactor moves the stylesheets and
   * the walker stops finding them, this fails instead of going quietly green.
   */
  it('actually scanned the stylesheets and the tokens', () => {
    expect(definitionFiles.length).toBeGreaterThan(20);
    expect(useFiles.length).toBeGreaterThan(20);
    expect(defined.size).toBeGreaterThan(50);
  });

  it('found the study ramp, so a rename of it cannot pass unnoticed', () => {
    expect(defined.has('--e-stage')).toBe(true);
    expect(defined.has('--e-tint')).toBe(true);
    expect(defined.has('--a-9')).toBe(true);
  });
});
