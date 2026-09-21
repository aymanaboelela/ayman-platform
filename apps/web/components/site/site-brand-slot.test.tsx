import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandingRead } from '@ayman/contracts/admin/settings';

/**
 * The marketing header's mark — the 36px circle beside the wordmark.
 *
 * ## The bug this file is the regression test for
 *
 * `<SiteNav>` called `<MediaSlot kind="mark">` with no `tenantKey`, so the
 * slot's only source was `getBrandAsset('mark')` — gated by `aymanOnly()`.
 * On a second instructor's live site that resolved to nothing and the header
 * drew `<MarkFallback>`: the first letter of their name in a circle. Measured
 * on `engmohamedsabry.com`, which had five branding images uploaded and wired
 * at the time, every one of them unreachable from that header.
 *
 * ## Why the read is here and not in the nav
 *
 * `<SiteNav>` is `'use client'` and `(site)/layout.tsx` is deliberately not
 * `async` — so the key can only arrive as an already-rendered node, on the
 * same contract `<SiteAccountSlot>` uses. That is what this component is.
 */

const getBranding = vi.fn<() => Promise<BrandingRead>>();

vi.mock('@/lib/settings', () => ({ getBranding: () => getBranding() }));

/* Only WHICH src is chosen is under test; the optimiser needs a loader and a
   config this harness has no reason to carry. */
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

const { SiteBrandSlot, SiteBrandSlotFallback } = await import('./site-brand-slot');

afterEach(cleanup);

function branding(overrides: Partial<BrandingRead> = {}): BrandingRead {
  return {
    accent: 'blue',
    accentHue: null,
    landingPreset: 'neon',
    landingLayout: 'classic',
    radius: 'default',
    logoLightAssetId: null,
    logoDarkAssetId: null,
    faviconAssetId: null,
    heroAssetId: null,
    portraitAssetId: null,
    loginAssetId: null,
    logoLightKey: null,
    logoDarkKey: null,
    faviconKey: null,
    heroKey: null,
    portraitKey: null,
    loginKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  getBranding.mockReset();
  getBranding.mockResolvedValue(branding());
});

describe('SiteBrandSlot — the instructor’s logo in the marketing header', () => {
  it('draws the uploaded logo in the nav mark', async () => {
    getBranding.mockResolvedValue(branding({ logoDarkKey: 'bb/dark.webp' }));

    const { container } = render(await SiteBrandSlot());
    const img = container.querySelector('img.site-mark');

    expect(img, 'an uploaded logo must reach the header').toBeTruthy();
    expect(img?.getAttribute('src')).toContain('bb/dark.webp');
  });

  /**
   * ⚠️ `logoDarkKey` FIRST — the slots are named after the GROUND the artwork
   * is drawn for, not after its own colour. The state a visitor meets first is
   * `--over`: the header sitting transparent on the landing hero, which is
   * dark on all three presets.
   */
  it('prefers the dark-ground logo over the light one', async () => {
    getBranding.mockResolvedValue(
      branding({ logoLightKey: 'aa/light.webp', logoDarkKey: 'bb/dark.webp' }),
    );

    const { container } = render(await SiteBrandSlot());

    expect(container.querySelector('img.site-mark')?.getAttribute('src')).toContain('bb/dark.webp');
  });

  /** An admin who uploaded exactly one file uploaded it to whichever slot they
   *  happened to open — a slightly-wrong-contrast mark beats a letter. */
  it('falls back to the one logo an admin did upload', async () => {
    getBranding.mockResolvedValue(branding({ logoLightKey: 'aa/light.webp' }));

    const { container } = render(await SiteBrandSlot());

    expect(container.querySelector('img.site-mark')?.getAttribute('src')).toContain('aa/light.webp');
  });

  /**
   * ONE uploaded mark cannot fill two boxes. The wordmark beside the circle
   * stays `<LogoFallback>`'s type lockup — which is not a placeholder, and is
   * what states the platform's name next to a picture carrying `alt=""`.
   */
  it('does not print the same file twice', async () => {
    getBranding.mockResolvedValue(
      branding({ logoLightKey: 'aa/one.webp', logoDarkKey: 'aa/one.webp' }),
    );

    const { container } = render(await SiteBrandSlot());

    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.querySelector('.wordmark')).toBeTruthy();
  });

  /**
   * ⚠️ ZERO PIXELS ON AYMAN'S STACK, asserted as an identity rather than
   * described.
   *
   * His `logoDarkAssetId` and `logoLightAssetId` are both `null` in production
   * (read off `app.site_settings`), and `TENANT_KEY` is unset in this harness,
   * so `getBrandAsset('mark')` resolves his registered photograph in both
   * branches. The resolved slot and the Suspense fallback must therefore emit
   * the same markup — which is also what makes the boundary resolving
   * invisible instead of a flash.
   */
  it('renders exactly what the header rendered before, with nothing uploaded', async () => {
    const resolved = render(await SiteBrandSlot()).container.innerHTML;
    cleanup();
    const fallback = render(<SiteBrandSlotFallback />).container.innerHTML;

    expect(resolved).toBe(fallback);
    expect(resolved).toContain('/brand/ayman-mark-2.webp');
  });
});

/**
 * The wiring, scanned — because everything above this passes on a header that
 * never mounts the slot.
 *
 * Each assertion in the suite above renders `<SiteBrandSlot>` DIRECTLY. That
 * is the right shape for "does it pick the right file", and it is blind to the
 * only way this fix can be lost: `{brandSlot}` deleted from the logo link, or
 * the prop dropped from the layout that fills it. Either leaves every test
 * here green and puts «م» back in a live instructor's header — which is
 * exactly how the original bug survived, since the two `<MediaSlot>` calls it
 * came from were also never rendered by a test.
 *
 * A source scan rather than a render of `<SiteNav>`: the nav drives
 * ScrollTrigger and reads `usePathname()`, so standing it up needs a GSAP and
 * a router harness to assert one child. The presets guard their own
 * boundaries the same way — see `neon-landing.test.ts`.
 */
describe('the header is actually wired to it', () => {
  const WEB = join(import.meta.dirname, '..', '..');
  const nav = readFileSync(join(WEB, 'components', 'site', 'site-nav.tsx'), 'utf8');
  const layout = readFileSync(join(WEB, 'app', '(site)', 'layout.tsx'), 'utf8');

  it('mounts the slot inside the logo link', () => {
    expect(nav).toContain('{brandSlot}');
  });

  /**
   * ⚠️ The nav must NOT reach `<MediaSlot>` again. It is `'use client'`, so a
   * call added back here could not be handed a `tenantKey` — it would resolve
   * through `getBrandAsset`, which `aymanOnly()` gates, and silently be a
   * fallback on every stack but his. That is the bug, restated as a rule.
   */
  it('leaves the brand read out of the client component', () => {
    expect(nav).not.toContain('MediaSlot kind=');
  });

  it('is handed one by the layout, inside a Suspense boundary', () => {
    expect(layout).toContain('brandSlot={');
    expect(layout).toContain('<SiteBrandSlotFallback />');
  });
});
