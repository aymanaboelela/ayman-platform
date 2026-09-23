import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandingRead } from '@ayman/contracts/admin/settings';
import type { HomeBlock, HomeBlockProps } from '@ayman/contracts/admin/home-blocks';

/**
 * «الاستوديو» — the preset whose whole argument is that the instructor's face
 * is on the page.
 *
 * These assertions are about EFFECT, not mechanism: «an `<img>` pointing at
 * the portrait key comes out» rather than «`<StudioHero>` was handed
 * `portraitKey`». The second passes on a component that takes the prop and
 * draws nothing, which is exactly the bug this preset exists to fix — measured
 * on the live stack, `neon` had the portrait attached and rendered zero
 * images.
 */

const getBranding = vi.fn<() => Promise<BrandingRead>>();

vi.mock('@/lib/settings', () => ({ getBranding: () => getBranding() }));
vi.mock('@/lib/catalog', () => ({ getCatalogOrEmpty: async () => ({ courses: [] }) }));
vi.mock('@/lib/tenant', () => ({
  IS_AYMAN: false,
  tenantName: () => 'المنصة',
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

const { default: StudioLanding } = await import('./studio-landing');

afterEach(cleanup);

function branding(overrides: Partial<BrandingRead> = {}): BrandingRead {
  return {
    accent: 'blue',
    accentHue: null,
    landingPreset: 'studio',
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
  } as BrandingRead;
}

let seq = 0;
function block(props: HomeBlockProps, key?: string): HomeBlock {
  seq += 1;
  return {
    id: `block-${seq}`,
    key: key ?? `${props.type}-${seq}`,
    position: seq,
    isPublished: true,
    props,
    imageKey: null,
  };
}

const HERO: HomeBlockProps = {
  type: 'hero',
  eyebrowAr: 'برمجة',
  headlineAr: 'البرمجة أسهل ما تتخيّل',
  subheadlineAr: 'من أول سطر كود',
  rotatingAr: [],
  leadAr: '',
  ctaLabelAr: 'إنشاء حساب',
  ctaHref: '/register',
  secondaryCtaLabelAr: '',
  secondaryCtaHref: '/courses',
  stats: [],
  imageAssetId: null,
};

beforeEach(() => {
  getBranding.mockResolvedValue(branding());
});

describe('the instructor is the page', () => {
  it('draws the uploaded portrait at the top of the page', async () => {
    getBranding.mockResolvedValue(branding({ portraitKey: '04/sabry.webp' }));

    const { container } = render(await StudioLanding({ blocks: [block(HERO)], honorBoard: [] }));

    const portrait = container.querySelector('.st-hero__portrait');
    expect(portrait).not.toBeNull();
    expect(portrait?.getAttribute('src')).toContain('04/sabry.webp');
  });

  it('still renders the opener when no portrait has been uploaded', async () => {
    const { container } = render(await StudioLanding({ blocks: [block(HERO)], honorBoard: [] }));

    // A tenant who has just switched preset has no portrait yet. The opener
    // must be a working page, not a reserved empty rectangle.
    expect(container.querySelector('.st-hero__portrait')).toBeNull();
    expect(container.textContent).toContain('البرمجة أسهل ما تتخيّل');
    expect(container.querySelector('.st-code')).not.toBeNull();
  });

  it('shows real code with its Arabic comment set right-to-left', async () => {
    const { container } = render(await StudioLanding({ blocks: [block(HERO)], honorBoard: [] }));

    const body = container.querySelector('.st-code__body');
    // The block itself is LTR or the brackets around an Arabic string reorder
    // into something nobody typed; the comment inside it is RTL because it is
    // prose.
    expect(body?.getAttribute('dir')).toBe('ltr');
    expect(container.querySelector('.st-code__comment')?.getAttribute('dir')).toBe('rtl');
    expect(body?.textContent).toContain('print(');
  });
});

describe('the page always has exactly one h1', () => {
  it('gives it to the opener when there is one', async () => {
    const { container } = render(await StudioLanding({ blocks: [block(HERO)], honorBoard: [] }));

    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe('البرمجة أسهل ما تتخيّل');
  });

  it('falls back to a hidden one when no section can carry it', async () => {
    // A page of nothing but a closing panel. `cta` is refused on purpose: a
    // document whose only heading sits below every word of its content is one
    // nobody can navigate by headings.
    const cta: HomeBlockProps = {
      type: 'cta',
      headlineAr: 'ابدأ دلوقتي',
      leadAr: '',
      ctaLabelAr: 'حساب جديد',
      ctaHref: '/register',
    };

    const { container } = render(await StudioLanding({ blocks: [block(cta)], honorBoard: [] }));

    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.className).toContain('sr-only');
  });
});

describe('two about blocks can sit on one page', () => {
  it('anchors each on its own key', async () => {
    const about = (titleAr: string): HomeBlockProps => ({
      type: 'about',
      titleAr,
      body1Ar: '',
      body2Ar: '',
      roleAr: '',
      chipsAr: [],
      imageAssetId: null,
    });

    const { container } = render(
      await StudioLanding({
        blocks: [
          block(HERO),
          block(about('البرمجة أسهل'), 'about'),
          block(about('مين اللي بيشرح؟'), 'about-teacher'),
        ],
        honorBoard: [],
      }),
    );

    // Duplicate ids are invalid HTML whose in-page links break in silence.
    expect(container.querySelector('#about')).not.toBeNull();
    expect(container.querySelector('#about-teacher')).not.toBeNull();
  });
});
