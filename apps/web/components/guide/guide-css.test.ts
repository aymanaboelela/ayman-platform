import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = resolve(import.meta.dirname, '..', '..');
const guideCss = readFileSync(join(import.meta.dirname, 'guide.css'), 'utf8');
const studyCss = readFileSync(join(WEB, 'app', 'study.css'), 'utf8');

const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** `--e-…` / `--a-…` declarations of the FIRST rule whose selector matches. */
function ramp(source: string, selector: string): Record<string, string> {
  const css = stripComments(source);
  const at = css.indexOf(`${selector} {`);
  expect(at, `selector not found: ${selector}`).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--(?:e|a)-\d+):\s*([^;]+);/g)) out[match[1]!] = match[2]!.trim();
  return out;
}

describe('guide.css', () => {
  it('repeats the «Cinema» ramp exactly as study.css declares it', () => {
    // The guide opens on pages with no student shell, where `study.css`'s
    // ramp (keyed on the shell) does not apply — so it carries a copy. A copy
    // that drifts is a guide that is one blue at home and another on the
    // landing page.
    const light = ramp(studyCss, ':root:has(.shell[data-cinema])');
    expect(Object.keys(light)).toHaveLength(15);
    expect(ramp(guideCss, '.guide-scope[data-cinema]')).toEqual(light);

    const dark = ramp(studyCss, ":root[data-theme='dark']:has(.shell[data-cinema])");
    expect(Object.keys(dark).length).toBeGreaterThan(0);
    expect(ramp(guideCss, ":root[data-theme='dark'] .guide-scope[data-cinema]")).toEqual(dark);
    expect(ramp(guideCss, ":root:not([data-theme='light']) .guide-scope[data-cinema]")).toEqual(dark);
  });

  /** Every `selector { body }` pair, at any nesting depth, comments removed. */
  function rules(source: string): { selector: string; body: string }[] {
    const out: { selector: string; body: string }[] = [];
    for (const match of stripComments(source).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selector: match[1]!.trim(), body: match[2]! });
    }
    return out;
  }

  it('uses no !important, and physical left/right only to pin the dock to the screen', () => {
    const css = stripComments(guideCss);
    expect(css).not.toMatch(/!important/);
    expect(css).not.toMatch(/(margin|padding|border)-(left|right)/);
    // `left` / `right` appear only on the dock itself — the pill and the
    // helper, pinned to the SCREEN's left by request (see `.guide-dock`).
    const physical = rules(guideCss).filter(({ body }) => /(^|[\s;])(left|right)\s*:/.test(body));
    expect(physical.length).toBeGreaterThan(0);
    for (const { selector } of physical) {
      // The dock element itself, whatever state it is in — never a child of it.
      expect(selector.replace(/:(is|not)\([^)]*\)/g, '')).toMatch(/^(:root:has\(\S+\) )?\.guide-dock\S*$/);
    }
  });

  it('keeps the helper in the TOP-left corner, anchored to the viewport', () => {
    const helper = rules(guideCss).filter(({ selector }) => selector.startsWith('.guide-dock--helper'));
    const base = helper.find(({ selector }) => selector === '.guide-dock--helper')!.body;
    expect(base).toMatch(/top:\s*calc\(var\(--guide-top\)/);
    expect(base).toMatch(/bottom:\s*auto/);
    expect(base).toMatch(/left:\s*max\(0\.5rem/);
    // Nothing ever sends it back to the floor, or positions it by anything
    // but the viewport's own edges.
    for (const { selector, body } of helper) {
      expect(body, selector).not.toMatch(/(^|[\s;])bottom:\s*(?!auto)\S/);
      expect(body, selector).not.toMatch(/translate|transform|inset-inline|margin/);
    }
  });

  it('never stacks the helper on the assistant’s launcher — only the pill shares that corner', () => {
    const stacked = rules(guideCss).filter(({ selector }) => selector.includes('.assistant-launcher'));
    expect(stacked).toHaveLength(1);
    expect(stacked[0]!.selector).toContain('.guide-dock:not(.guide-dock--helper)');
  });

  it('pushes the page down for the strip instead of floating over it', () => {
    const css = stripComments(guideCss);
    // Each place the helper stands, at each width where it is a strip.
    expect(css).toMatch(
      /:root:has\(\.guide-dock--helper\[data-place='onboarding'\]\) main \{\s*border-block-start: var\(--guide-room\) solid transparent/,
    );
    expect(css).toMatch(
      /@media \(max-width: 61\.999rem\) \{\s*:root:has\(\.guide-dock--helper:is\(\[data-place='register'\], \[data-place='login'\]\)\) main \{\s*border-block-start: var\(--guide-room\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 89\.999rem\) \{\s*:root:has\(\.guide-dock--helper\[data-place='checkout'\]\) main \{\s*border-block-start: var\(--guide-room\)/,
    );
    // …and the card takes over exactly where the strip's room stops.
    expect(css).toMatch(/@media \(min-width: 62rem\) \{\s*\.guide-dock--helper:is\(\[data-place='register'\]/);
    expect(css).toMatch(/@media \(min-width: 90rem\) \{\s*\.guide-dock--helper\[data-place='checkout'\]/);
  });

  it('keeps the helper small: a 40px face in a 44px target, a caption of 280px at most', () => {
    const body = (selector: string) => rules(guideCss).find((rule) => rule.selector === selector)!.body;
    expect(body('.guide-circle')).toMatch(/width:\s*2\.75rem/);
    expect(body('.guide-circle__face')).toMatch(/width:\s*2\.5rem/);
    expect(stripComments(guideCss)).toMatch(/max-width:\s*17\.5rem/);
    expect(body('.guide-bubble')).toMatch(/box-shadow:\s*var\(--shadow-sm\)/);
    expect(stripComments(guideCss)).toMatch(/-webkit-line-clamp:\s*2/);
  });

  it('honours reduced motion for every animation it declares', () => {
    const css = stripComments(guideCss);
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const animated = [...css.matchAll(/([.\w\-:()\s,]+)\{[^}]*animation:\s*guide-/g)].map((match) =>
      match[1]!.trim().split(/\s+/).pop()!,
    );
    expect(animated.length).toBeGreaterThan(4);
    for (const selector of new Set(animated)) {
      expect(reduced, `${selector} still animates under reduced motion`).toContain(selector);
    }
  });

  it('keeps every tap target at 44px or more', () => {
    const css = stripComments(guideCss);
    for (const selector of ['.guide-band__btn', '.guide-say__play', '.guide-bubble__btn']) {
      const body = css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)));
      expect(body, selector).toMatch(/width:\s*2\.75rem/);
      expect(body, selector).toMatch(/height:\s*2\.75rem/);
    }
  });
});
