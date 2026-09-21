import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderBrandingStyle } from '@ayman/ui/branding';
import { describe, expect, it } from 'vitest';

/**
 * A teacher who is not Ayman must not find Ayman's orange anywhere.
 *
 * ## What was actually wrong
 *
 * Picking an accent rewrote four custom properties — `--a-9…--a-12` — and
 * nothing else. Every other brand-coloured token in the product (`--p-50…950`,
 * `--p-rgb`, the ember structure ramp `--e-*`, and a dozen literals sitting
 * in stylesheets) is declared once in `packages/ui/src/tokens/color.css` as
 * amber and was never rewritten by anything.
 *
 * Measured on the live stacks before this test existed: `mr-mohammedadel.com`
 * stores `accent: blue`, serves `--a-9: oklch(0.620 0.170 258)`, and computes
 * `--p-500` to `#F28318` and `--p-rgb` to `214 96 22`. His landing page uses
 * the `board` preset, which builds every solid block out of `--p-800` and
 * `--p-900`, so the page is orange slabs under a blue button. The sign-in
 * aside, the marketing CTA, the link hub's one button and every printed
 * packing label were orange on his stack too.
 *
 * ## Why nothing caught it
 *
 * `css-token-coverage.test.ts` proves every `var(--x)` resolves to something.
 * It has no opinion about WHAT. `tenant-identity-leak.spec.ts` walks the whole
 * repo for the teacher's name, his photographs and his account handles — and
 * a colour is none of those. Both stayed green through all of it. There has
 * never been a guard in this repo that a colour follows the tenant.
 *
 * ## What this does
 *
 * Resolves the token layer the way a browser would — the shipped `:root`
 * declarations with the server-injected `<style>` laid over them, `var()`
 * chains followed — and then looks at the colours that come out. Under
 * `accent: 'blue'` nothing brand-coloured may land in the warm band.
 *
 * It fails loudly on the code that shipped before it: `--p-500`, `--p-rgb`,
 * every `--e-*` step, `--accent-cta`, `--ink-key-rgb` and `--print-gold` were
 * all amber under `blue`.
 */

const REPO = join(import.meta.dirname, '..', '..', '..');
const TOKENS = join(REPO, 'packages', 'ui', 'src', 'tokens', 'color.css');

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The FIRST `:root { … }` block — the light theme, where the ramps are declared. */
function shippedLightTokens(): Map<string, string> {
  const source = stripComments(readFileSync(TOKENS, 'utf8'));
  const start = source.indexOf(':root {');
  const end = source.indexOf('\n}', start);
  return declarationsIn(source.slice(start, end));
}

function declarationsIn(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    out.set(match[1]!, match[2]!.trim());
  }
  return out;
}

/** The light rule of the injected stylesheet — `:root:root{…}`, the first body. */
function injectedLightTokens(css: string): Map<string, string> {
  const body = /^:root:root\{([^{}]*)\}/.exec(css);
  return declarationsIn(body?.[1] ?? '');
}

/**
 * `var(--x)` followed to a value, the way the cascade would.
 *
 * Depth-limited rather than cycle-detected: the token file has no cycles and a
 * bound is enough to keep a future one from hanging the suite.
 */
function resolve(value: string, tokens: Map<string, string>, depth = 0): string {
  if (depth > 12) return value;
  return value.replace(/var\(\s*(--[\w-]+)[^)]*\)/g, (whole, name: string) => {
    const next = tokens.get(name);
    return next === undefined ? whole : resolve(next, tokens, depth + 1);
  });
}

type Rgb = { r: number; g: number; b: number };

/** sRGB hue in degrees and chroma in 0–1 — enough to say "this is orange, not blue". */
function hueAndChroma({ r, g, b }: Rgb): { hue: number; chroma: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return { hue: 0, chroma: 0 };

  let hue: number;
  if (max === r) hue = ((g - b) / chroma) % 6;
  else if (max === g) hue = (b - r) / chroma + 2;
  else hue = (r - g) / chroma + 4;

  return { hue: ((hue * 60) % 360 + 360) % 360, chroma };
}

/**
 * OKLCH → sRGB, transcribed from `@ayman/ui/oklch`.
 *
 * Deliberately not imported: this test is the thing that decides whether a
 * generated colour is the right colour, and importing the generator's own
 * conversion to check the generator's own output would only prove it is
 * self-consistent.
 */
function oklchToRgb(l: number, c: number, h: number): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const bb = c * Math.sin(rad);
  const cube = (x: number) => x * x * x;
  const L = cube(l + 0.3963377774 * a + 0.2158037573 * bb);
  const M = cube(l - 0.1055613458 * a - 0.0638541728 * bb);
  const S = cube(l - 0.0894841775 * a - 1.291485548 * bb);
  const gamma = (x: number) =>
    Math.min(1, Math.max(0, x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));

  return {
    r: gamma(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
    g: gamma(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
    b: gamma(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
  };
}

/** Every colour inside a declaration value — a gradient contributes all of its stops. */
function coloursIn(value: string): Rgb[] {
  const found: Rgb[] = [];

  for (const m of value.matchAll(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) {
    found.push(oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3])));
  }
  for (const m of value.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = m[1]!;
    found.push({
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
    });
  }
  // `--p-rgb` and friends: a bare `R G B` triplet, because a custom property
  // cannot be given an alpha without being decomposed first.
  const triplet = /^(\d{1,3}) (\d{1,3}) (\d{1,3})$/.exec(value.trim());
  if (triplet) {
    found.push({
      r: Number(triplet[1]) / 255,
      g: Number(triplet[2]) / 255,
      b: Number(triplet[3]) / 255,
    });
  }
  return found;
}

/**
 * The warm band, in sRGB hue degrees.
 *
 * Wide on purpose. Every amber the product ships lands between 20° and 40°
 * (`--a-9` #EFA22C is 35°, `--p-500` #F28318 is 30°, `--accent-cta` #C54E00 is
 * 24°, the print gold #EAA33C is 36°), and the point of a band rather than a
 * list is that a NEW orange nobody has written yet is caught too.
 */
const WARM = { from: 10, to: 95 };

/**
 * Below this the colour is a neutral, not a brand colour.
 *
 * `--n-2` is #F9F8F6, a chroma of 0.012, and the token file says in as many
 * words that the neutrals were warmed to sit under an orange key light. That
 * is a tint, it is invisible beside a blue, and re-cutting the whole neutral
 * ramp per tenant is a different and much larger decision.
 */
const NEUTRAL_CHROMA = 0.04;

/**
 * Tokens that are allowed to stay warm, each because it means something other
 * than "the brand".
 *
 * ⚠️ Every entry here is a promise that the token is NOT brand-coloured. The
 * repo has been burned by an allow-list whose entries were simply untrue —
 * see the note on `tenant-identity-leak.spec.ts` in CLAUDE.md. Do not add a
 * token here to make this pass.
 */
const NOT_BRAND = new Set([
  // Correctness and status. `settings.ts` RESERVES hues 25 and 150 so a brand
  // can never come near them, which is the same rule stated from the other end.
  '--ok',
  '--err',
  '--warn',
  '--info',
  /*
   * The neutral ramp and the ink panel's own greys. `tokens/color.css` says in
   * its own comment that these were deliberately turned from blue-leaning to
   * warm-leaning ("only the hue moved") so the product and the marketing page
   * would stop looking like two companies' software.
   *
   * They read as off-white and grey, not as orange — the widest of them,
   * `--n-11` #666158, is 14/255 apart across its channels. Re-cutting the
   * whole neutral ramp per tenant is a real decision with every measured
   * contrast in that file attached to it, and it is not this one. Listed by
   * name rather than hidden behind a looser chroma threshold, so the day
   * somebody does take it on, the list is where they look.
   */
  '--n-1',
  '--n-2',
  '--n-3',
  '--n-4',
  '--n-5',
  '--n-6',
  '--n-7',
  '--n-8',
  '--n-9',
  '--n-10',
  '--n-11',
  '--n-12',
  '--ink',
  '--ink-2',
  '--ink-fg',
  '--ink-fg-2',
]);

describe('a teacher who is not Ayman gets no amber', () => {
  const shipped = shippedLightTokens();

  function resolvedScheme(branding: Parameters<typeof renderBrandingStyle>[0]) {
    const tokens = new Map([...shipped, ...injectedLightTokens(renderBrandingStyle(branding))]);
    return [...tokens].map(([name, value]) => ({
      name,
      value: resolve(value, tokens),
    }));
  }

  /** Every resolved token that still paints something warm, as `--x: value (hue N°)`. */
  function warmTokens(branding: Parameters<typeof renderBrandingStyle>[0]): string[] {
    const found = resolvedScheme(branding)
      .filter(({ name }) => !NOT_BRAND.has(name))
      .flatMap(({ name, value }) =>
        coloursIn(value).map((rgb) => ({ name, value, ...hueAndChroma(rgb) })),
      )
      .filter(({ chroma, hue }) => chroma >= NEUTRAL_CHROMA && hue >= WARM.from && hue <= WARM.to)
      .map(({ name, value, hue }) => `${name}: ${value} (hue ${Math.round(hue)}°)`);

    return [...new Set(found)].sort();
  }

  it('reads the shipped token file at all', () => {
    // A guard that resolves nothing passes forever.
    expect(shipped.get('--p-500')).toBe('oklch(0.720 0.170 56)');
    expect(shipped.get('--e-500')).toBe('oklch(0.660 0.170 35)');
    expect(shipped.size).toBeGreaterThan(50);
  });

  /**
   * The regression, stated once. On the code before this, `accent: 'blue'`
   * left `--p-*`, `--p-rgb`, `--e-*`, `--accent-cta*`, `--ink-key-rgb`,
   * `--ink-accent` and `--print-gold*` at their shipped amber.
   */
  it('lands no brand colour in the warm band under accent: blue', () => {
    const warm = warmTokens({ accent: 'blue', radius: 'default' });

    expect(warm, `amber survived a blue brand:\n  ${warm.join('\n  ')}`).toEqual([]);
  });

  it('does the same for every other slot a teacher can pick', () => {
    for (const accent of ['cyan', 'violet', 'magenta', 'slate'] as const) {
      const warm = warmTokens({ accent, radius: 'default' });

      expect(warm, `${accent} kept amber:\n  ${warm.join('\n  ')}`).toEqual([]);
    }
  });

  it('does the same for a free hue, which is how the other live stack is set up', () => {
    // `engmohamedsabry.com` stores `accentHue: 223` rather than a slot.
    const warm = warmTokens({ accent: 'blue', accentHue: 223, radius: 'default' });

    expect(warm, `hue 223 kept amber:\n  ${warm.join('\n  ')}`).toEqual([]);
  });

  /**
   * The other half of the brief, and the one with money on it: Ayman's stack
   * must not move by a byte. His row is `accent: amber` with no `accentHue`,
   * and the correct output for that is a stylesheet that overrides the accent
   * with its own value and says nothing else at all.
   */
  it('emits nothing new for the shipped amber default', () => {
    const css = renderBrandingStyle({ accent: 'amber', radius: 'default' });

    expect(css).not.toContain('--p-');
    expect(css).not.toContain('--e-');
    expect(css).not.toContain('--accent-cta');
    expect(css).not.toContain('--ink-');
    expect(css).not.toContain('--print-gold');
    expect(css).toContain('--a-9:oklch(0.770 0.152 72)');
  });

  /**
   * An override of a property nothing declares is not an error — it is
   * silence, which is the exact failure `css-token-coverage.test.ts` exists
   * for, arriving from the other direction. Every token the injected
   * stylesheet writes must be one the token file already declares.
   */
  it('overrides only properties the token file declares', () => {
    const css = renderBrandingStyle({ accent: 'blue', radius: 'default' });
    const radius = new Set(['--r-xs', '--r-sm', '--r-md', '--r-lg']);

    const unknown = [...injectedLightTokens(css).keys()].filter(
      (name) => !shipped.has(name) && !radius.has(name),
    );

    expect(unknown).toEqual([]);
  });
});
