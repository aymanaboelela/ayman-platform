import { readFileSync } from 'node:fs';
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
    for (const layout of LANDING_LAYOUTS.filter((l) => l !== 'classic')) {
      const block = LAYOUTS_CSS.split(`[data-layout='${layout}'] .hero {`)[1] ?? '';
      expect({ layout, movesOpener: block.includes('min-height') }).toEqual({
        layout,
        movesOpener: true,
      });
    }
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
