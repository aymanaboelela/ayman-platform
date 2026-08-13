import { describe, expect, it } from 'vitest';
import { ContactSchema, SeoSchema } from './admin/settings';
import { OFFICIAL_PROFILES, SAME_AS } from './site-profiles';
import { copy } from './copy/ar';

/**
 * These four URLs are seeded straight into `site_settings.contact` on every
 * container boot, and rendered into the footer and into JSON-LD's `sameAs`.
 * Anything wrong with them is wrong on a live page, so the shape is asserted
 * against the SAME schema the API validates a PATCH body with.
 */
describe('official profiles', () => {
  it('every profile passes the contact schema that will store it', () => {
    const parsed = ContactSchema.parse({
      youtube: OFFICIAL_PROFILES.youtube,
      instagram: OFFICIAL_PROFILES.instagram,
      tiktok: OFFICIAL_PROFILES.tiktok,
      facebook: OFFICIAL_PROFILES.facebook,
    });
    expect(parsed.youtube).toBe(OFFICIAL_PROFILES.youtube);
    expect(parsed.instagram).toBe(OFFICIAL_PROFILES.instagram);
  });

  /**
   * `optionalUrl` refuses anything that is not `https://`, because an
   * `http://` link in the footer is a mixed-content warning on every page that
   * renders it.
   */
  it('is https throughout', () => {
    for (const url of Object.values(OFFICIAL_PROFILES)) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  /**
   * A bare platform root is the failure this whole module exists to prevent:
   * the footer shipped `https://www.youtube.com/`, `https://www.facebook.com/`
   * and `https://www.tiktok.com/` for months, so every social icon sent a
   * student to the platform's own front page instead of to him. Each URL must
   * carry a PATH identifying the account.
   */
  it('names an account, never a platform homepage', () => {
    for (const url of Object.values(OFFICIAL_PROFILES)) {
      const { pathname } = new URL(url);
      expect(pathname.replace(/\/+$/, '')).not.toBe('');
    }
  });

  it('sameAs carries every profile, so the footer cannot link one the crawler is not told about', () => {
    expect([...SAME_AS].sort()).toEqual(Object.values(OFFICIAL_PROFILES).sort());
  });
});

/**
 * The seed writes `copy.seo.defaultTitle` and `copy.seo.homeDescription` into
 * the SEO section. `SeoSchema` caps them at 70 and 160 characters — and
 * `copy.seo.description` (the long one) is over that cap, which is why the
 * seed deliberately uses `homeDescription` instead. If either string is later
 * rewritten past its limit, the seed would start throwing on every boot.
 */
describe('seeded SEO copy fits the schema that stores it', () => {
  it('accepts the title and description the seed writes', () => {
    expect(() =>
      SeoSchema.parse({
        titleAr: copy.seo.defaultTitle,
        descriptionAr: copy.seo.homeDescription,
      }),
    ).not.toThrow();
  });

  it('rejects the LONG description — the reason homeDescription is used', () => {
    expect(() => SeoSchema.parse({ descriptionAr: copy.seo.description })).toThrow();
  });
});
