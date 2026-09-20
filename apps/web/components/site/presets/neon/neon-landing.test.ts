import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_BLOCK_TYPES } from '@ayman/contracts/admin/home-blocks';

/**
 * The guards «الترمينال» needs that nothing else on this repo can provide.
 *
 * ## Why a test and not a code review
 *
 * Three of the rules this preset lives under are invisible to every other
 * check in the tree, and all three fail SILENTLY:
 *
 * 1. **A CSS selector that escapes the preset root.** `presets.css` is
 *    downloaded by Ayman's landing page too — same route, same stylesheet — so
 *    a single rule written `.neon-h2 { … }` instead of
 *    `[data-preset='neon'] .neon-h2 { … }` changes HIS page, the one with real
 *    students and real money on it. Nothing in the type system, the build or
 *    any existing test notices a rule that matched one element too many.
 *
 * 2. **A block type that stops rendering.** `renderNeonBlock` is exhaustive
 *    today, and `tsc` enforces that only as long as the switch has no
 *    `default` arm. Somebody adding one "to be safe" turns "this preset
 *    silently drops a section an admin published" from a compile error into a
 *    blank space on a live page.
 *
 * 3. **Ayman's identity leaking back in.** The gate is an IMPORT GRAPH, not a
 *    convention: this directory must never reach `lib/brand-assets.ts` (his
 *    photograph, his dragon, his monogram) or `copy.landing` (his hero lines,
 *    his FAQ). Both are one autocomplete away and both would look perfectly
 *    reasonable in a diff.
 *
 * ## Why it reads the files rather than rendering them
 *
 * Every section here is an async server component reading `'use cache'`
 * loaders; rendering one outside Next means standing up a cache environment
 * and a router context to assert something that is true of the source. The
 * three rules above are all textual properties of the source, and reading it
 * catches them the moment they land — in the file that broke them.
 */

const DIR = import.meta.dirname;
const WEB = join(DIR, '..', '..', '..', '..');
const PRESETS_CSS = join(WEB, 'app', '(site)', 'styles', 'presets.css');

const sourceFiles = readdirSync(DIR)
  .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts'))
  .map((name) => ({ name, text: readFileSync(join(DIR, name), 'utf8') }));

const landing = readFileSync(join(DIR, 'neon-landing.tsx'), 'utf8');

/** Block comments go first: a token named in prose is not a use of it. */
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * This preset's half of `presets.css`, and only this half.
 *
 * The file is shared with `board` — appended to, one banner per preset — so
 * the scan has to stop at the next banner or it would report the other
 * preset's rules as this one's failures. The slice runs from the NEON banner
 * to the end of the file, which is where it currently sits; if `board` is ever
 * appended after it, `NEXT_BANNER` finds the boundary.
 */
function neonSection(): string {
  const css = readFileSync(PRESETS_CSS, 'utf8');
  const marker = css.indexOf('═══ NEON ═');
  expect(marker, 'the NEON banner is missing from presets.css').toBeGreaterThan(-1);

  /*
   * Back up to the banner's own `/*`, and that is not a detail.
   *
   * Slicing at the marker itself starts the string INSIDE a comment, so the
   * opening delimiter is gone: `stripComments` then finds its first `/*`
   * somewhere in the middle of the banner's prose, pairs it with the wrong
   * closing delimiter, and every comment after it is off by one. The result is
   * a scan that
   * reads documentation as CSS — which is how a test that looked green
   * reported the sentence "there is no @media (prefers-color-scheme) block in
   * this section" as a @media (prefers-color-scheme) block.
   */
  const start = css.lastIndexOf('/*', marker);
  const after = css.slice(start === -1 ? marker : start);
  const next = after.search(/═══ (?!NEON)[A-Z]+ ═/);
  return next === -1 ? after : after.slice(0, next);
}

/**
 * Split a selector LIST on its top-level commas only.
 *
 * `String.split(',')` cannot be used: this section is full of
 * `:is(h1, h2, h3)` and `:has([data-preset='neon'])`, and splitting naively
 * shreds them into fragments like `h2` and `ul)` — which then read as bare
 * element selectors and make the guard below fail on rules that are perfectly
 * scoped. Depth is tracked through both `(` and `[`.
 */
function splitSelectorList(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of list) {
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;

    if (character === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  out.push(current);

  return out.map((one) => one.trim()).filter((one) => one.length > 0);
}

describe('neon preset — block coverage', () => {
  /*
   * A block type with no arm renders NOTHING on this preset: an admin
   * publishes a section, positions it, and the page simply does not have it —
   * with no error anywhere to say so.
   */
  it('renders every block type the contract defines', () => {
    const missing = HOME_BLOCK_TYPES.filter((type) => !landing.includes(`case '${type}':`));
    expect(missing, `block types with no case in renderNeonBlock: ${missing.join(', ')}`).toEqual(
      [],
    );
  });

  /*
   * The `default` arm is what would turn rule 2 above from a compile error
   * into a live blank. `tsc` proves exhaustiveness only while there is nothing
   * catching the leftover case.
   */
  it('has no default arm, so a thirteenth block type is a compile error', () => {
    expect(stripComments(landing)).not.toMatch(/\bdefault:/);
  });

  it('puts the steps section before a trailing cta rather than after it', () => {
    // The closing call to action has to close. See `<NeonSteps>`.
    // On the STRIPPED source: the component's own docblock names `<NeonSteps>`
    // several paragraphs above the JSX that renders it, and `indexOf` on the
    // raw file finds the sentence instead of the element.
    const jsx = stripComments(landing);
    const body = jsx.indexOf('{body.map(');
    const steps = jsx.indexOf('<NeonSteps');
    const closer = jsx.indexOf('{closer ?');
    expect(body).toBeGreaterThan(-1);
    expect(steps).toBeGreaterThan(body);
    expect(closer).toBeGreaterThan(steps);
  });
});

describe('neon preset — nothing of Ayman’s is reachable', () => {
  /*
   * The registry that holds his photograph, his dragon and his monogram. An
   * import of it here is how his face ends up on somebody else's domain —
   * exactly the leak `lib/tenant.ts` was written after finding four of.
   */
  it('imports no brand-asset registry', () => {
    const offenders = sourceFiles
      .filter((file) => /from '@\/lib\/brand-assets'/.test(stripComments(file.text)))
      .map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  /*
   * `copy.landing` is his landing page written out — hero lines, eight «ليه»
   * reasons, ten FAQ answers. On this preset every one of those arrives from
   * `home_blocks` instead, so a read of that table is a read of HIS words.
   */
  it('reads no copy from the landing table', () => {
    const offenders = sourceFiles
      .filter((file) => /copy\.landing/.test(stripComments(file.text)))
      .map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  it('prints no name that did not come through tenantName()', () => {
    const offenders = sourceFiles
      .filter((file) => /أيمن/.test(stripComments(file.text)))
      .map((file) => file.name);
    expect(offenders).toEqual([]);
  });

  /*
   * The two places a name IS printed — the hero's wordmark and the `whoami`
   * window — must both go through the gate. `tenantName(fallback)` returns the
   * fallback on his own stack and `TENANT_DISPLAY_NAME` (or «المنصة»)
   * anywhere else; a bare `copy.site.name` would print him on every tenant.
   */
  it('gates both places a name is printed', () => {
    for (const name of ['neon-hero.tsx', 'neon-instructor.tsx']) {
      const text = stripComments(readFileSync(join(DIR, name), 'utf8'));
      expect(text, `${name} must call tenantName()`).toContain('tenantName(copy.site.name)');
    }
  });
});

describe('neon preset — the stylesheet cannot reach the classic page', () => {
  /**
   * EVERY selector is scoped to the preset root.
   *
   * The one exception is `.site:has(main[data-preset='neon'])`, which repoints
   * the shell's tokens so the header does not stay light around a page that
   * never is. It is scoped BY the attribute rather than under it, it carries
   * its own note in the stylesheet, and it is pinned here by name so it cannot
   * quietly become two exceptions.
   *
   * ⚠️ `main[…]` and not a bare `[…]` — `<NeonFooter>` carries the attribute
   * too, on every route in the group, and `:has()` is a descendant match. The
   * bare form would turn `/courses`, `/books` and the 404 dark as a side
   * effect of giving the footer a scope hook. The footer does not need it
   * either way: it carries its own ground.
   */
  it('scopes every rule under [data-preset=\'neon\']', () => {
    const css = stripComments(neonSection());

    // Strip `@keyframes` bodies: their `0%, 100%` "selectors" are percentages,
    // not element selectors, and would read as unscoped rules.
    const withoutKeyframes = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ');

    // `{` is in the leading class as well as `}` and `;`, so the rules NESTED
    // inside a `@media` block are scanned too — that is where a width query's
    // three rules live, and an unscoped one there is exactly as dangerous as
    // an unscoped one at the top level. `@` is excluded from the selector body,
    // which is what keeps the media prelude itself from reading as a selector.
    const unscoped = [...withoutKeyframes.matchAll(/(^|[{};])\s*([^{};@]+?)\s*\{/g)]
      .map((match) => match[2]!.trim())
      .filter((selector) => selector.length > 0)
      // A declaration block's own contents never reach this pattern, but a
      // media query's prelude does; it is an at-rule and is scoped inside.
      .filter((selector) => !selector.startsWith('@'))
      // A comma-separated list is one match; each arm is its own selector and
      // each has to be scoped on its own. `.neon-x, .site-h2 { … }` is the
      // exact shape that would look scoped and restyle his page.
      .flatMap(splitSelectorList)
      // STARTS WITH, not merely contains: `.site-h2 [data-preset='neon'] …`
      // contains the attribute and is still a rule anchored outside the preset.
      .filter((selector) => !selector.startsWith("[data-preset='neon']"));

    expect(
      unscoped,
      `unscoped selectors in the NEON section — each of these also matches on ` +
        `Ayman's landing page, which downloads this same stylesheet:\n  ` +
        unscoped.join('\n  '),
    ).toEqual([":root:root .site:has(main[data-preset='neon'])"]);
  });

  /* House rules, and both are silent failures rather than errors: a hex
     literal is a colour that ignores the tenant's own hue, and an
     `!important` is a rule the next stylesheet cannot override. */
  it('uses no hex literal and no !important', () => {
    const css = stripComments(neonSection());
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).not.toContain('!important');
  });

  /*
   * The bidi isolate is the one CSS declaration on this page whose absence
   * produces text that is entirely present and in the wrong order — `95/100`
   * becomes `100/95`, which is a different mark than the student got.
   */
  it('isolates every mono run', () => {
    const css = stripComments(neonSection());
    const rule = css.slice(css.indexOf('.neon-mono {'));
    expect(rule).toMatch(/direction:\s*ltr/);
    expect(rule).toMatch(/unicode-bidi:\s*isolate/);
  });

  /**
   * RTL. The document is `dir="rtl"`, so a physical `left`/`right` is a rule
   * written for the mirror image of this page.
   *
   * ⚠️ `board-landing.test.tsx` has carried this check since it was written and
   * this section never did — the asymmetry only became load-bearing when the
   * FOOTER moved in here, because a footer is grids and columns and insets
   * rather than the single-column stack the sections above are. `top`/`bottom`
   * are deliberately not in the pattern: the block axis does not mirror.
   */
  it('positions on the logical axis, never on left or right', () => {
    const css = stripComments(neonSection());
    const physical =
      css.match(
        /(?<![\w-])(margin|padding|border)-(left|right)\s*:|(?<![\w-])(left|right)\s*:/g,
      ) ?? [];

    expect(physical).toEqual([]);
  });

  /*
   * A `@media (prefers-color-scheme: …)` block here would be a light variant
   * of a page whose entire premise is that it has none. The width queries this
   * section does use are matched on `min-width` / `max-width` and are fine.
   */
  it('has no colour-scheme media query, because the page never turns light', () => {
    expect(stripComments(neonSection())).not.toContain('prefers-color-scheme');
  });
});
