import { describe, expect, it } from 'vitest';
import {
  PromoBannerCreateSchema,
  PromoBannerPatchSchema,
  cairoDayKey,
  promoBannerForYear,
  promoBannerInWindow,
  promoBannerLinkKind,
} from './promo-banners';

const KEY = 'ab/0192f0e4-7b1c-7cc0-9f00-0123456789ab.webp';

describe('where a banner may link', () => {
  it('takes a path on this site and an https page elsewhere', () => {
    expect(promoBannerLinkKind('/library')).toBe('internal');
    expect(promoBannerLinkKind('/courses/python-101?from=banner')).toBe('internal');
    expect(promoBannerLinkKind('https://wa.me/201000000000')).toBe('external');
  });

  it('refuses another origin dressed as a path, and anything that is not https', () => {
    expect(promoBannerLinkKind('//evil.example/x')).toBeNull();
    expect(promoBannerLinkKind('/\\evil.example')).toBeNull();
    expect(promoBannerLinkKind('http://example.com')).toBeNull();
    expect(promoBannerLinkKind('javascript:alert(1)')).toBeNull();
    expect(promoBannerLinkKind('library')).toBeNull();
    expect(promoBannerLinkKind('https://localhost')).toBeNull();
  });
});

describe('the create and patch schemas', () => {
  it('needs only a picture, and defaults to live for everyone with no window', () => {
    expect(PromoBannerCreateSchema.parse({ imageKey: KEY })).toEqual({
      title: null,
      imageKey: KEY,
      linkUrl: null,
      years: [],
      isActive: true,
      startsOn: null,
      endsOn: null,
    });
  });

  it('refuses a window that ends before it starts', () => {
    expect(
      PromoBannerCreateSchema.safeParse({ imageKey: KEY, startsOn: '2026-11-10', endsOn: '2026-11-09' }).success,
    ).toBe(false);
    // One day, both ends inclusive, is a real window.
    expect(
      PromoBannerCreateSchema.safeParse({ imageKey: KEY, startsOn: '2026-11-10', endsOn: '2026-11-10' }).success,
    ).toBe(true);
  });

  it('a patch carries no defaults — renaming does not switch a stopped banner back on', () => {
    expect(PromoBannerPatchSchema.parse({ title: 'جديد' })).toEqual({ title: 'جديد' });
  });

  it('refuses an image key that is not a library picture', () => {
    expect(PromoBannerCreateSchema.safeParse({ imageKey: '../etc/passwd' }).success).toBe(false);
  });
});

describe('who sees a banner, and when', () => {
  it('is inside its window on both end days', () => {
    const banner = { startsOn: '2026-11-01', endsOn: '2026-11-07' };
    expect(promoBannerInWindow(banner, '2026-10-31')).toBe(false);
    expect(promoBannerInWindow(banner, '2026-11-01')).toBe(true);
    expect(promoBannerInWindow(banner, '2026-11-07')).toBe(true);
    expect(promoBannerInWindow(banner, '2026-11-08')).toBe(false);
    expect(promoBannerInWindow({ startsOn: null, endsOn: null }, '2030-01-01')).toBe(true);
  });

  it('counts the day on the Cairo calendar', () => {
    expect(cairoDayKey(new Date('2026-11-04T23:30:00.000Z'))).toBe('2026-11-05');
  });

  it('reaches everyone when aimed at no year, and only that year otherwise', () => {
    expect(promoBannerForYear({ years: [] }, null)).toBe(true);
    expect(promoBannerForYear({ years: [2] }, 2)).toBe(true);
    expect(promoBannerForYear({ years: [2] }, 3)).toBe(false);
    expect(promoBannerForYear({ years: [2] }, null)).toBe(false);
  });
});
