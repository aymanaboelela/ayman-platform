import { describe, expect, it } from 'vitest';
import { ACCENT_RAMPS, RADIUS_RAMPS, renderBrandingStyle } from './branding';

const DECLARATION = /^--[a-z0-9-]+:[a-z0-9(). ,%/#-]+$/;

const accents = Object.keys(ACCENT_RAMPS) as Array<keyof typeof ACCENT_RAMPS>;
const radii = Object.keys(RADIUS_RAMPS) as Array<keyof typeof RADIUS_RAMPS>;

/** Every `{ … }` body in the emitted stylesheet, split into declarations. */
function allDeclarations(css: string): string[] {
  return [...css.matchAll(/\{([^{}]*)\}/g)].flatMap((match) =>
    match[1]!.split(';').filter(Boolean),
  );
}

describe('renderBrandingStyle', () => {
  it('emits exactly three rules: light, system-dark, and explicit-dark', () => {
    const css = renderBrandingStyle({ accent: 'amber', radius: 'default' });
    expect(css).toMatch(
      /^:root:root\{[^{}]*\}@media \(prefers-color-scheme:dark\)\{:root:root:not\(\[data-theme="light"\]\)\{[^{}]*\}\}:root:root\[data-theme="dark"\]\{[^{}]*\}$/,
    );
  });

  /**
   * The regression that motivates the doubled `:root`. `THEME_SCRIPT` only
   * stamps `data-theme` when a choice was SAVED, so a system-dark first-time
   * visitor matches `:root:not([data-theme="light"])` in `color.css` and
   * nothing else. An override that only covers `:root[data-theme="dark"]`
   * leaves that visitor on the shipped amber.
   */
  it('covers the system-dark visitor who never touched the theme toggle', () => {
    const css = renderBrandingStyle({ accent: 'violet', radius: 'default' });
    expect(css).toContain('@media (prefers-color-scheme:dark)');
    expect(css).toContain(':root:root:not([data-theme="light"])');
    expect(css).toContain(ACCENT_RAMPS.violet.dark[0]);
  });

  /**
   * Doubling `:root` puts every rule one class-level above its `color.css`
   * counterpart, so the override does not depend on source order — React
   * hoists `<style>` elements and makes no promise about where they land
   * relative to the framework's own stylesheet.
   */
  it('out-specifies color.css rather than relying on source order', () => {
    const css = renderBrandingStyle({ accent: 'cyan', radius: 'sharp' });
    for (const selector of css.match(/[^{}]+(?=\{--)/g) ?? []) {
      expect(selector).toContain(':root:root');
    }
  });

  it('every declaration it emits is a safe custom property', () => {
    for (const accent of accents) {
      for (const radius of radii) {
        for (const declaration of allDeclarations(renderBrandingStyle({ accent, radius }))) {
          expect(declaration).toMatch(DECLARATION);
        }
      }
    }
  });

  it('contains no character that could terminate the <style> element', () => {
    for (const accent of accents) {
      const css = renderBrandingStyle({ accent, radius: 'soft' });
      expect(css).not.toMatch(/[<>]/);
    }
  });

  it('the amber/default pair is a no-op against the shipped tokens', () => {
    const css = renderBrandingStyle({ accent: 'amber', radius: 'default' });
    expect(css).toContain('--a-9:oklch(0.770 0.152 72)');
    expect(css).toContain('--r-lg:8px');
  });

  it('never emits a card radius above the 8px ceiling', () => {
    for (const radius of radii) {
      expect(RADIUS_RAMPS[radius].lg).toBeLessThanOrEqual(8);
    }
  });

  it('offers no green or red accent — those are reserved for quiz correctness', () => {
    expect(Object.keys(ACCENT_RAMPS)).not.toContain('green');
    expect(Object.keys(ACCENT_RAMPS)).not.toContain('red');
  });

  it('throws on a slot it does not know rather than emitting undefined into CSS', () => {
    // @ts-expect-error deliberately invalid at runtime — this is the injection path
    expect(() => renderBrandingStyle({ accent: 'evil', radius: 'default' })).toThrow();
    // @ts-expect-error same, for the radius half
    expect(() => renderBrandingStyle({ accent: 'amber', radius: '}</style><script>' })).toThrow();
  });

  it('the dark rules carry the accent ramp only — radius is theme-independent', () => {
    const css = renderBrandingStyle({ accent: 'cyan', radius: 'soft' });
    const dark = css.slice(css.indexOf('@media'));
    expect(dark).not.toContain('--r-');
    expect(dark).toContain('--a-9:');
  });
});
