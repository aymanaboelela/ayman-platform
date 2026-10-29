import { cleanup, render, screen, within } from '@testing-library/react';
import { ContactSchema, type Contact } from '@ayman/contracts/admin/settings';
import { SocialCountsSchema, type SocialCounts } from '@ayman/contracts/admin/social-counts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  `<SocialProofBand>` — the follower band under the classic hero. The two
  cached loaders are mocked; what is pinned is what reaches the HTML: nothing
  at all when there is nothing to show (Ayman's page must not change by a byte
  until his figures exist), the combined figure summed from the RAW counts,
  and each card's final figure in the server markup — the count-up is
  decoration over it, never the only place the number lives.
*/
const getSocialCounts = vi.fn<() => Promise<SocialCounts>>();
const getPublicSettingsOrDefaults = vi.fn<() => Promise<{ contact: Contact }>>();

vi.mock('@/lib/settings', () => ({
  getSocialCounts: () => getSocialCounts(),
  getPublicSettingsOrDefaults: () => getPublicSettingsOrDefaults(),
}));

vi.mock('@/lib/tenant-contact', () => ({
  TENANT_CONTACT_FALLBACK: { youtube: null, instagram: null, tiktok: null, facebook: null },
}));

const { SocialProofBand } = await import('./social-proof-band');

afterEach(() => cleanup());

beforeEach(() => {
  getSocialCounts.mockReset();
  getPublicSettingsOrDefaults.mockReset();
  getPublicSettingsOrDefaults.mockResolvedValue({ contact: ContactSchema.parse({}) });
});

const contact = ContactSchema.parse({
  youtube: 'https://www.youtube.com/@example',
  facebook: 'https://www.facebook.com/example',
  instagram: 'https://www.instagram.com/example',
});

describe('<SocialProofBand>', () => {
  it('renders nothing when no count was entered, or the feature is off', async () => {
    getSocialCounts.mockResolvedValue(SocialCountsSchema.parse({}));
    expect(await SocialProofBand()).toBeNull();
  });

  it('renders nothing for zeros', async () => {
    getSocialCounts.mockResolvedValue(SocialCountsSchema.parse({ youtube: 0, facebook: 0 }));
    expect(await SocialProofBand()).toBeNull();
  });

  it('heads the band with the combined total of the raw counts', async () => {
    // 24,700 + 28,700 + 108,000 = 161,400. Summing the rounded figures
    // (24 + 28 + 108) would claim 160 — understated by a whole thousand.
    getSocialCounts.mockResolvedValue(
      SocialCountsSchema.parse({ youtube: 24_700, facebook: 28_700, instagram: 108_000 }),
    );
    getPublicSettingsOrDefaults.mockResolvedValue({ contact });

    render((await SocialProofBand())!);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toContain('+161 ألف');
    expect(heading.textContent).toContain('متابع على السوشيال ميديا');
    expect(screen.getByRole('region').getAttribute('aria-labelledby')).toBe(heading.id);
  });

  it('shows one card per network with its final figure and a link to the profile', async () => {
    getSocialCounts.mockResolvedValue(
      SocialCountsSchema.parse({ youtube: 24_700, facebook: 28_700, instagram: 108_000 }),
    );
    getPublicSettingsOrDefaults.mockResolvedValue({ contact });

    render((await SocialProofBand())!);

    const cards = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining('+24 ألف'),
      expect.stringContaining('+28 ألف'),
      // 108 is «آلاف», not «ألف»: the hundreds keep the 3–10 form (`arabicCount`).
      expect.stringContaining('108 آلاف'),
    ]);
    expect(cards[0]!.textContent).toContain('مشترك على يوتيوب');
    expect(cards[0]!.textContent).toContain('زيارة القناة');

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://www.youtube.com/@example',
      'https://www.facebook.com/example',
      'https://www.instagram.com/example',
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
    // The accessible name says the number, what it counts, and that it leaves.
    expect(links[0]!.getAttribute('aria-label')).toContain('+24 ألف مشترك على يوتيوب');
  });

  it('shows a figure with no profile, unlinked and without «زيارة»', async () => {
    getSocialCounts.mockResolvedValue(SocialCountsSchema.parse({ youtube: 24_700, tiktok: 40_000 }));
    getPublicSettingsOrDefaults.mockResolvedValue({ contact });

    render((await SocialProofBand())!);

    const cards = screen.getAllByRole('listitem');
    expect(cards[1]!.textContent).toContain('40 ألف');
    expect(cards[1]!.querySelector('a')).toBeNull();
    expect(cards[1]!.textContent).not.toContain('زيارة');
  });

  it('drops the combined figure when only one network has a count', async () => {
    getSocialCounts.mockResolvedValue(SocialCountsSchema.parse({ youtube: 24_700 }));

    render((await SocialProofBand())!);

    // With one network the total would only repeat the card beside it.
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('region', { name: 'المتابعين على السوشيال ميديا' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
