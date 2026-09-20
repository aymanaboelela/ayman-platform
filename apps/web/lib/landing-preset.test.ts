import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANDING_PRESETS, BrandingSchema } from '@ayman/contracts/admin/settings';

/**
 * WHICH landing page renders, chosen per instructor from /admin/settings.
 *
 * `landingLayout` (guarded next door in `landing-layout.test.ts`) reshapes
 * Ayman's page. `landingPreset` REPLACES it: `neon` and `board` render their
 * own components and none of his sections at all. That makes the blast radius
 * of a mistake here the whole of a live landing page rather than a rhythm, so
 * these tests guard the two ways it could go wrong quietly:
 *
 *   · a stored row changing meaning — every row predates the field, so the
 *     default has to be `classic` or the next deploy silently swaps the page
 *     of a platform with real students and real money on it; and
 *   · `classic` drifting — the standing instruction is «منصتي زي ما هي
 *     بالظبط», which in this file means the exact return statement, reached by
 *     falling through, with nothing new on the `<main>` and nothing from
 *     either preset loaded on the way.
 *
 * Everything below reads SOURCE rather than rendering. A render test would
 * prove the tree matches for the inputs it happened to use; the text of the
 * return statement is the thing that must not move, and nothing but reading it
 * proves that.
 */
const WEB = join(__dirname, '..');
const PAGE = readFileSync(join(WEB, 'app', '(site)', 'page.tsx'), 'utf8');
const SITE_LAYOUT = readFileSync(join(WEB, 'app', '(site)', 'layout.tsx'), 'utf8');
const PRESETS_CSS = readFileSync(join(WEB, 'app', '(site)', 'styles', 'presets.css'), 'utf8');

/**
 * The classic arm, byte for byte as it has shipped.
 *
 * ⚠️ If a change makes this constant need editing, the change is wrong unless
 * Ayman has asked for it in as many words. Adding `data-preset` to the
 * `<main>`, moving the map into a helper, wrapping it in a fragment — all of
 * those are "harmless refactors" that alter the HTML his students are served.
 */
/*
 * ⚠️ الوسيط التالت (`branding.heroKey`) إضافة مقصودة، والـHTML ما اتغيّرش.
 *
 * `MediaSlot` بقى بيعرض صورة المدرّس المرفوعة مكان الرسمة البديلة. على ستاك
 * أيمن `heroKey` بيفضل `null` — مفيش صف في `site_settings` بيحطه — فالمكوّن
 * بيسقط على ملفاته المكتوبة في الكود وبيرسم **نفس البايتات** بالظبط.
 *
 * والتمرير مش قراءة: `renderBlock` مش async ومش مكوّن، فنداء `getBranding()`
 * جوّاها كان هيخلّيها كده ويغيّر شكل الصفحة فعلًا.
 */
const CLASSIC_RETURN = `  return (
    <main data-layout={branding.landingLayout}>
      {blocks.map((block) => renderBlock(block, honorBoard, branding.heroKey))}
    </main>
  );`;

describe('the stored setting', () => {
  it('defaults to classic, so no existing row changes meaning', () => {
    // Ayman's `site_settings` row predates this field entirely and carries no
    // `landingPreset` key. `.strict()` means the key can only ever arrive from
    // a save that meant it.
    expect(BrandingSchema.parse({ accent: 'amber', radius: 'default' }).landingPreset).toBe(
      'classic',
    );
  });

  it('leaves landingLayout alone — the two fields coexist', () => {
    // The preset did not replace the layout setting; it sits beside it and is
    // read first. A row that set a layout keeps it.
    const parsed = BrandingSchema.parse({
      accent: 'amber',
      radius: 'default',
      landingLayout: 'editorial',
    });
    expect([parsed.landingPreset, parsed.landingLayout]).toEqual(['classic', 'editorial']);
  });

  it('accepts every preset the picker offers', () => {
    for (const preset of LANDING_PRESETS) {
      const parsed = BrandingSchema.safeParse({
        accent: 'amber',
        radius: 'default',
        landingPreset: preset,
      });
      expect({ preset, ok: parsed.success }).toEqual({ preset, ok: true });
    }
  });

  it('rejects a preset that has no page behind it', () => {
    // The page switch is exhaustive over this enum. A value the schema let
    // through but `page.tsx` has no branch for would fall through to CLASSIC
    // — a tenant who saved a preset and got Ayman's page instead.
    expect(
      BrandingSchema.safeParse({ accent: 'amber', radius: 'default', landingPreset: 'brutalist' })
        .success,
    ).toBe(false);
  });
});

describe('the page switch', () => {
  it('still ends in the exact classic return statement', () => {
    expect(PAGE).toContain(CLASSIC_RETURN);
  });

  it('keeps the layout attribute on the classic root and adds nothing beside it', () => {
    // `landing-layout.test.ts` asserts the attribute is present. This asserts
    // the element has not GAINED one: a `data-preset` on the `<main>` would be
    // a byte of Ayman's HTML that changed for a feature he is not using.
    expect(PAGE).toContain('<main data-layout={branding.landingLayout}>');
    expect(PAGE).not.toContain('data-preset');
  });

  it('branches on the preset BEFORE the classic return, so classic falls through', () => {
    // Order is the whole guarantee. A preset branch below the return would
    // never run; a rewritten classic arm inside a `switch` would no longer be
    // the statement above.
    for (const preset of LANDING_PRESETS.filter((p) => p !== 'classic')) {
      const branch = PAGE.indexOf(`branding.landingPreset === '${preset}'`);
      expect({ preset, branches: branch !== -1 }).toEqual({ preset, branches: true });
      expect({ preset, beforeClassic: branch < PAGE.indexOf(CLASSIC_RETURN) }).toEqual({
        preset,
        beforeClassic: true,
      });
    }
  });

  it('has no branch for classic at all', () => {
    // `classic` is the fall-through, not a case. An `=== 'classic'` here would
    // mean his page renders through a condition that can be got wrong.
    expect(PAGE).not.toContain("branding.landingPreset === 'classic'");
  });

  it('loads the preset pages dynamically, so classic never evaluates them', () => {
    /*
     * The failure this exists for is invisible on the page that breaks.
     *
     * A top-level `import NeonLanding from '…/presets/neon/neon-landing'`
     * renders identically — the branch still does not run — but the module and
     * everything it imports are EVALUATED on every landing-page render,
     * Ayman's included, and any stylesheet or client component they pull in is
     * hoisted into this route. That is how `classic` acquires a CSS rule
     * nobody wrote for it, with no diff on his page's own files to point at.
     */
    for (const preset of LANDING_PRESETS.filter((p) => p !== 'classic')) {
      const dir = `@/components/site/presets/${preset}/`;
      expect({ preset, dynamic: PAGE.includes(`await import('${dir}`) }).toEqual({
        preset,
        dynamic: true,
      });
      // No top-level import of the same module, in either quote style.
      expect({ preset, static: PAGE.includes(`from '${dir}`) }).toEqual({ preset, static: false });
    }
  });

  it('reads branding through the tagged loader, so a saved preset invalidates the page', () => {
    /*
     * `HomePage` is itself `'use cache'`. The only reason a save on
     * /admin/settings reaches it is that `getBranding()` is a nested cache
     * entry carrying `tags.settings('branding')`, and a nested entry's tags
     * propagate to the one containing it — the same mechanism the page's own
     * docblock relies on for `tags.homeBlocks()`.
     *
     * Swap this for an untagged read (or hoist branding out of the cached
     * function) and changing the preset would appear to save, show the new
     * page to the editor, and leave every visitor on the old one until the
     * `cacheLife('minutes')` window rolled over — the shape of bug that gets
     * reported as "it only changed for me".
     */
    expect(PAGE).toContain('getBranding()');
    const settings = readFileSync(join(__dirname, 'settings.ts'), 'utf8');
    expect(settings).toContain("cacheTag(tags.settings('branding'))");
    const actions = readFileSync(
      join(WEB, 'app', '(admin)', 'admin', 'settings', 'actions.ts'),
      'utf8',
    );
    expect(actions).toContain("updateTag(tags.settings('branding'))");
  });
});

describe('the preset stylesheet', () => {
  /** The rules only — the header discusses `!important` and hexes in prose. */
  const RULES = PRESETS_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

  it('is imported after layouts.css', () => {
    const layouts = SITE_LAYOUT.indexOf("import './styles/layouts.css'");
    const presets = SITE_LAYOUT.indexOf("import './styles/presets.css'");
    expect(layouts).toBeGreaterThan(-1);
    expect(presets).toBeGreaterThan(layouts);
  });

  it('is imported after books.css too', () => {
    // A preset page renders the book strip like any other block, so it has to
    // be able to restyle `.book-*` — which it cannot do from above the file
    // that declares them without an `!important` the house rules forbid.
    expect(SITE_LAYOUT.indexOf("import './styles/presets.css'")).toBeGreaterThan(
      SITE_LAYOUT.indexOf("import './styles/books.css'"),
    );
  });

  it('never mentions classic in a selector', () => {
    // Same prohibition `layouts.css` carries: `classic` is what `theme.css`,
    // `sections.css` and `layouts.css` already describe. A rule for it here
    // would be a second place Ayman's page is defined, and the two would
    // drift.
    expect(RULES).not.toMatch(/classic/);
  });

  it('never reaches for !important', () => {
    // It is imported last, so source order is enough. An `!important` here
    // would be a rule nothing downstream could correct.
    expect(RULES).not.toContain('!important');
  });

  it('takes its colours from tokens', () => {
    // A hex literal ties a preset to a colour, and `accentHue` is meant to
    // keep working underneath every one of them.
    expect(RULES).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

/**
 * The FOOTER switch — the same mechanism, on the component with the widest
 * reach in the product.
 *
 * `page.tsx` chooses a landing page; `<SiteFooter>` chooses a footer, and it
 * is mounted by `(site)/layout.tsx` under EVERY route in the group plus the
 * prerendered 404. So the stakes above are all higher here by the number of
 * pages: a `classic` arm that drifts drifts on twenty screens rather than on
 * one, and a top-level import of a preset footer hoists that preset's module
 * graph into the shell every one of those screens is built from.
 *
 * ⚠️ These guards exist because the switch above has them and this one did
 * not. `site-footer.tsx` went from "a file with no branch in it" to "a file
 * that decides which of three footers a stack gets", and nothing was reading
 * it — the classic markup could have been moved into a helper, wrapped in a
 * fragment or handed a prop, and every test in this repo would still have been
 * green.
 */
describe('the footer switch', () => {
  const FOOTER = readFileSync(join(WEB, 'components', 'site', 'site-footer.tsx'), 'utf8');
  const CLASSIC_FOOTER_AT = FOOTER.indexOf('  return (\n    <footer className="site-footer">');

  it('still reaches a classic return that starts where it always has', () => {
    expect(CLASSIC_FOOTER_AT).toBeGreaterThan(-1);
  });

  /**
   * Ayman's footer, byte for byte, by digest rather than by literal — it is
   * 150 lines of JSX and pasting it here would be a second copy of the thing
   * being protected.
   *
   * ⚠️ A failure here is NOT a stale fixture to regenerate. It means the HTML
   * served to his students changed, and the only change that is allowed is one
   * he asked for in as many words — «منصتي زي ما هي بالظبط». If that is the
   * case, the new digest is:
   *
   *     node -e "const s=require('fs').readFileSync('apps/web/components/site/site-footer.tsx','utf8');\
   *     const i=s.indexOf('  return (\\n    <footer className=\\\"site-footer\\\">');\
   *     console.log(require('crypto').createHash('sha256').update(s.slice(i)).digest('hex'))"
   */
  it('still ends in the exact classic footer', () => {
    const digest = createHash('sha256').update(FOOTER.slice(CLASSIC_FOOTER_AT)).digest('hex');
    expect(digest).toBe('0abc814aef5f2f4e257366452a0b904122c04945313bc0f17dfe3c68baafa9ae');
  });

  it('branches on the preset BEFORE the classic return, so classic falls through', () => {
    for (const preset of LANDING_PRESETS.filter((p) => p !== 'classic')) {
      const branch = FOOTER.indexOf(`branding.landingPreset === '${preset}'`);
      expect({ preset, branches: branch !== -1 }).toEqual({ preset, branches: true });
      expect({ preset, beforeClassic: branch < CLASSIC_FOOTER_AT }).toEqual({
        preset,
        beforeClassic: true,
      });
    }
  });

  it('has no branch for classic at all', () => {
    expect(FOOTER).not.toContain("branding.landingPreset === 'classic'");
  });

  it('loads the preset footers dynamically, so classic never evaluates them', () => {
    // Worse here than on the page, and for one reason: the footer is on every
    // route in the group, so a static import evaluates both preset trees on
    // every marketing render Ayman's stack serves rather than on one.
    for (const preset of LANDING_PRESETS.filter((p) => p !== 'classic')) {
      const module = `@/components/site/presets/${preset}/${preset}-footer`;
      expect({ preset, dynamic: FOOTER.includes(`await import('${module}')`) }).toEqual({
        preset,
        dynamic: true,
      });
      expect({ preset, static: FOOTER.includes(`from '${module}'`) }).toEqual({
        preset,
        static: false,
      });
    }
  });

  it('reads branding through the tagged loader, so a saved preset reaches the footer', () => {
    // Same argument the page's own version of this test makes: the read has to
    // be the tagged `'use cache'` entry, or changing the preset would swap the
    // landing page and leave the footer under it on the old one.
    expect(FOOTER).toContain('getBranding()');
  });

  it('is mounted exactly once, so the document carries exactly one <footer>', () => {
    // `agent-discovery.e2e.ts` asserts that on the delivered HTML. A preset
    // footer REPLACES this mount; a second `<SiteFooter />` — or a preset
    // landing page rendering a footer of its own — breaks a check that only
    // runs in Playwright, long after the change lands.
    expect(SITE_LAYOUT.match(/<SiteFooter\s*\/>/g) ?? []).toHaveLength(1);
    for (const preset of LANDING_PRESETS.filter((p) => p !== 'classic')) {
      const landing = readFileSync(
        join(WEB, 'components', 'site', 'presets', preset, `${preset}-landing.tsx`),
        'utf8',
      );
      expect({ preset, footers: (landing.match(/<footer[\s>]/g) ?? []).length }).toEqual({
        preset,
        footers: 0,
      });
    }
  });

  /**
   * Not one `<h*>`, on any of the three.
   *
   * The footer is streamed in the shell BEFORE the page's own content, so a
   * heading here is a heading that precedes the document's `<h1>`. Every
   * heading was taken out of the classic footer on 2026-09-13 after an
   * AI-readiness scan scored the site 0/20 on heading order, and a preset
   * footer is the obvious place for one to come back — a column label looks
   * exactly like an `<h3>`.
   */
  it('puts no heading in any footer', () => {
    const files = [
      FOOTER,
      ...LANDING_PRESETS.filter((p) => p !== 'classic').map((preset) =>
        readFileSync(
          join(WEB, 'components', 'site', 'presets', preset, `${preset}-footer.tsx`),
          'utf8',
        ),
      ),
    ];
    for (const text of files) {
      expect(text.replace(/\/\*[\s\S]*?\*\//g, ' ')).not.toMatch(/<h[1-6][\s>]/);
    }
  });
});
