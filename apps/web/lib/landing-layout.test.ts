import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDING_LAYOUTS, BrandingSchema } from '@ayman/contracts/admin/settings';

/**
 * The landing page's SHAPE, chosen per instructor.
 *
 * The value lands as `data-layout` on the page's `<main>` and
 * `(site)/styles/layouts.css` answers it. These tests guard the two things
 * that would break quietly: a stored row changing meaning, and `classic`
 * acquiring rules of its own.
 */
const LAYOUTS_CSS = readFileSync(
  join(__dirname, '..', 'app', '(site)', 'styles', 'layouts.css'),
  'utf8',
);

/** The rules only — the file's own commentary discusses `!important` and hexes. */
const RULES = LAYOUTS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the stored setting', () => {
  it('defaults to classic, so no existing row changes meaning', () => {
    // Ayman's `site_settings` predates this field entirely.
    expect(BrandingSchema.parse({ accent: 'amber', radius: 'default' }).landingLayout).toBe(
      'classic',
    );
  });

  it('accepts every layout the picker offers', () => {
    for (const layout of LANDING_LAYOUTS) {
      const parsed = BrandingSchema.safeParse({
        accent: 'amber',
        radius: 'default',
        landingLayout: layout,
      });
      expect({ layout, ok: parsed.success }).toEqual({ layout, ok: true });
    }
  });

  it('rejects a layout that has no stylesheet behind it', () => {
    expect(
      BrandingSchema.safeParse({ accent: 'amber', radius: 'default', landingLayout: 'brutalist' })
        .success,
    ).toBe(false);
  });
});

describe('the stylesheet', () => {
  it('defines rules for every layout EXCEPT classic', () => {
    // classic is what `sections.css` already describes — Ayman's live page. A
    // `[data-layout="classic"]` rule here would be a second place his page is
    // defined, and the two would drift.
    for (const layout of LANDING_LAYOUTS) {
      const present = LAYOUTS_CSS.includes(`[data-layout='${layout}']`);
      expect({ layout, present }).toEqual({ layout, present: layout !== 'classic' });
    }
  });

  it('changes the opener, which is what actually distinguishes the looks', () => {
    // If a layout only altered colours or gaps it would be a theme, not a
    // shape. Each alternate has to move the hero.
    //
    // ⚠️ The block has to be cut at its own closing brace. Splitting on the
    // selector and keeping the tail hands every layout the REST OF THE FILE,
    // so only the last alternate in source order is genuinely tested —
    // `editorial` was passing on `compact`'s `min-height` a hundred lines
    // below it, and would have kept passing with none of its own.
    for (const layout of LANDING_LAYOUTS.filter((l) => l !== 'classic')) {
      const after = LAYOUTS_CSS.split(`[data-layout='${layout}'] .hero {`)[1] ?? '';
      const block = after.slice(0, after.indexOf('}'));
      expect({ layout, movesOpener: block.includes('min-height') }).toEqual({
        layout,
        movesOpener: true,
      });
    }
  });

  it('only styles classes that something on the page actually renders', () => {
    /*
     * The failure this exists for is silent by construction: a rule written
     * against a class nobody emits is valid CSS, ships, and does nothing.
     *
     * The first version of this file styled `.courses`, `.about`, `.faq` and
     * `.honor-board`. All four of those names are `id` ATTRIBUTES on their
     * sections and never classes — plus `.hero__fluid`, which no component on
     * this page has rendered for some time. Five section-level rules reached
     * nothing, so both alternates were a hero change wearing a section
     * change's comments, and every test above still passed.
     *
     * ⚠️ Grepping the sources for the bare NAME is not enough, and the first
     * version of this test proved it by passing on `.courses` and
     * `.honor-board` — the two names it was written to catch. `courses` occurs
     * all over the sources as a route and a prop, and `honor-board` occurs as
     * the very `id=` attribute that is the reason the class does not exist.
     * Only what is actually inside a `className` counts, so that is what is
     * collected: the attribute's string, or every string literal inside its
     * `{…}` expression, since the roots are written as ternaries and `cn()`
     * calls rather than plain attributes.
     */
    const SITE = join(__dirname, '..');
    const dirs = [join(SITE, 'components', 'site'), join(SITE, 'app', '(site)')];
    const sources = dirs.flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => readFileSync(join(dir, f), 'utf8')),
    );

    const rendered = new Set<string>();
    for (const src of sources) {
      for (const m of src.matchAll(/className=/g)) {
        let i = m.index + m[0].length;
        let literals = '';
        const quote = src.charAt(i);
        if (quote === '"' || quote === "'") {
          literals = src.slice(i + 1, src.indexOf(quote, i + 1));
        } else if (src[i] === '{') {
          // Balance the braces so a nested `${…}` or object does not end it early.
          let depth = 0;
          const start = i;
          for (; i < src.length; i += 1) {
            if (src[i] === '{') depth += 1;
            else if (src[i] === '}') {
              depth -= 1;
              if (depth === 0) break;
            }
          }
          const expr = src.slice(start, i + 1);
          literals = [...expr.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)]
            .map((s) => s[1] ?? s[2] ?? s[3])
            .join(' ');
        }
        for (const token of literals.split(/[^A-Za-z0-9_-]+/)) {
          if (token) rendered.add(token);
        }
      }
    }

    const selectors = [...RULES.matchAll(/^([^{}]+)\{/gm)].map((m) => m[1]).join(' ');
    const classes = [
      ...new Set([...selectors.matchAll(/\.([a-zA-Z][A-Za-z0-9_-]*)/g)].map((m) => m[1] ?? '')),
    ];

    expect(classes.filter((c) => !rendered.has(c))).toEqual([]);
  });

  it('never reaches for !important', () => {
    // It is imported after `sections.css`, so ordering is enough. An
    // `!important` here would be a rule nothing downstream could correct.
    expect(RULES).not.toContain('!important');
  });

  it('takes its colours from tokens, so any layout works with any hue', () => {
    // A hex literal would tie a shape to a colour, and the two settings are
    // deliberately independent.
    expect(RULES).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('the page', () => {
  const PAGE = readFileSync(join(__dirname, '..', 'app', '(site)', 'page.tsx'), 'utf8');

  it('puts the layout on the landing page root', () => {
    expect(PAGE).toContain('data-layout={branding.landingLayout}');
  });
});
