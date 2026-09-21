import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrandingRead } from '@ayman/contracts/admin/settings';
import type { CatalogList } from '@ayman/contracts/catalog';

/**
 * The one section on «الترمينال» that answers `whoami` — and the field it
 * could not read.
 *
 * `branding.portraitAssetId` has been on the write schema, in the database and
 * resolved to a storage key by the API the whole time. No preset read it, so
 * an instructor who uploaded their own photograph and wired it into the slot
 * got nothing on the page: measured on a live stack, `portrait.png` was
 * 912×1216, attached, and the landing page contained zero `<img>` elements.
 *
 * These tests fail on the code that shipped that way. The first one is the
 * whole bug; the two after it pin the order the three sources resolve in,
 * because "the logo is still there when there is no photograph" and "the
 * monogram is still there when there is neither" are the two things a later
 * tidy-up would collapse.
 */

const getBranding = vi.fn<() => Promise<BrandingRead>>();
const getCatalogOrEmpty = vi.fn<() => Promise<CatalogList>>();

vi.mock('@/lib/settings', () => ({ getBranding: () => getBranding() }));
vi.mock('@/lib/catalog', () => ({ getCatalogOrEmpty: () => getCatalogOrEmpty() }));

/* `next/image` wants a loader and a config this harness has no reason to
   carry; what is being asserted is only WHICH src the section chose, so the
   stub keeps it a plain `<img>` — exactly as `board-landing.test.tsx` does. */
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { NeonInstructor } = await import('./neon-instructor');

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
  getCatalogOrEmpty.mockReset();
  getBranding.mockResolvedValue(branding());
  getCatalogOrEmpty.mockResolvedValue({ courses: [], total: 0 });
});

describe('NeonInstructor — the instructor’s own photograph', () => {
  it('draws the uploaded portrait', async () => {
    getBranding.mockResolvedValue(branding({ portraitKey: 'aa/portrait.webp' }));

    const { container } = render(await NeonInstructor({ level: 1 }));
    const img = container.querySelector('.neon-who__portrait img');

    expect(img, 'a wired portrait must reach the page').toBeTruthy();
    expect(img?.getAttribute('src')).toContain('aa/portrait.webp');
  });

  /*
   * `whoami` has ONE answer. A face and a logo in the same card are two brands
   * arguing, and the logo already opens the page in `<NeonHero>`.
   */
  it('takes the mark’s place rather than standing beside it', async () => {
    getBranding.mockResolvedValue(
      branding({ portraitKey: 'aa/portrait.webp', logoDarkKey: 'bb/logo.webp' }),
    );

    const { container } = render(await NeonInstructor({ level: 1 }));

    expect(container.querySelector('.neon-who__mark')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('keeps the mark when there is no photograph', async () => {
    getBranding.mockResolvedValue(branding({ logoDarkKey: 'bb/logo.webp' }));

    const { container } = render(await NeonInstructor({ level: 1 }));

    expect(container.querySelector('.neon-who__portrait')).toBeNull();
    expect(container.querySelector('.neon-who__mark img')?.getAttribute('src')).toContain(
      'bb/logo.webp',
    );
  });

  /** A bordered empty box is not a designed empty state — see the component. */
  it('draws the monogram when there is neither', async () => {
    const { container } = render(await NeonInstructor({ level: 1 }));

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.neon-who__mark')?.getAttribute('data-drawn')).toBe('true');
  });

  /*
   * The name is stated in text right beside it, so a description of the photo
   * would announce the same brand twice to a screen reader.
   */
  it('leaves the portrait’s alt empty', async () => {
    getBranding.mockResolvedValue(branding({ portraitKey: 'aa/portrait.webp' }));

    const { container } = render(await NeonInstructor({ level: 1 }));

    expect(container.querySelector('.neon-who__portrait img')?.getAttribute('alt')).toBe('');
  });
});
