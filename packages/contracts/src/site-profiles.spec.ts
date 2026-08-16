import { describe, expect, it } from 'vitest';
import { ContactSchema, SeoSchema } from './admin/settings';
import {
  OFFICIAL_PROFILES,
  OFFICIAL_WHATSAPP_CHANNEL,
  OFFICIAL_WHATSAPP_E164,
  SAME_AS,
} from './site-profiles';
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
 * The WhatsApp pair is seeded into `site_settings.contact` exactly like the
 * four profiles above, so it faces the same schema on the way in — and one of
 * the two has a failure mode a URL does not: a phone number written in the
 * national form seeds a number that does not exist, and nothing downstream can
 * tell. `wa.me/00102…` opens WhatsApp and finds nobody.
 */
describe('official WhatsApp contacts', () => {
  it('both pass the contact schema that will store them', () => {
    const parsed = ContactSchema.parse({
      whatsapp: OFFICIAL_WHATSAPP_E164,
      whatsappChannel: OFFICIAL_WHATSAPP_CHANNEL,
    });
    expect(parsed.whatsapp).toBe(OFFICIAL_WHATSAPP_E164);
    expect(parsed.whatsappChannel).toBe(OFFICIAL_WHATSAPP_CHANNEL);
  });

  it('the number is E.164 with Egypt’s country code REPLACING the trunk zero', () => {
    // «0102 1196367» → «+20 102 1196367». `+200102…` would keep both, which is
    // the mistake this asserts against — it parses, it stores, and it dials
    // nobody.
    expect(OFFICIAL_WHATSAPP_E164).toBe('+201021196367');
    expect(OFFICIAL_WHATSAPP_E164.startsWith('+200')).toBe(false);
  });

  it('the channel is a channel, not the WhatsApp homepage', () => {
    const { pathname } = new URL(OFFICIAL_WHATSAPP_CHANNEL);
    expect(pathname.startsWith('/channel/')).toBe(true);
    expect(pathname.replace('/channel/', '')).not.toBe('');
  });

  /**
   * `SAME_AS` asserts to a crawler that each URL identifies the same entity as
   * this site. A broadcast feed does not, which is why the channel lives in its
   * own constant — and why this is a test rather than a comment.
   */
  it('the channel is deliberately absent from sameAs', () => {
    expect(SAME_AS).not.toContain(OFFICIAL_WHATSAPP_CHANNEL);
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
