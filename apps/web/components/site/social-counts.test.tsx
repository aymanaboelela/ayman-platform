import { cleanup, render, screen } from '@testing-library/react';
import { ContactSchema, type Contact } from '@ayman/contracts/admin/settings';
import { SocialCountsSchema, type SocialCounts } from '@ayman/contracts/admin/social-counts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
  `<SocialCounts>` is an async server component over two cached loaders. The
  loaders are mocked; what is pinned is the decision this component makes:
  nothing at all when there is nothing to show, and each figure linked to the
  stack's own profile — or to nothing — never to a bare platform root.
*/
const getSocialCounts = vi.fn<() => Promise<SocialCounts>>();
const getPublicSettingsOrDefaults = vi.fn<() => Promise<{ contact: Contact }>>();

vi.mock('@/lib/settings', () => ({
  getSocialCounts: () => getSocialCounts(),
  getPublicSettingsOrDefaults: () => getPublicSettingsOrDefaults(),
}));

// The fallback is per deployment; in this file it is "no account anywhere".
vi.mock('@/lib/tenant-contact', () => ({
  TENANT_CONTACT_FALLBACK: { youtube: null, instagram: null, tiktok: null, facebook: null },
}));

const { SocialCounts } = await import('./social-counts');

afterEach(() => cleanup());

beforeEach(() => {
  getSocialCounts.mockReset();
  getPublicSettingsOrDefaults.mockReset();
  getPublicSettingsOrDefaults.mockResolvedValue({ contact: ContactSchema.parse({}) });
});

describe('<SocialCounts>', () => {
  it('renders nothing when no count was entered (or the feature is off)', async () => {
    getSocialCounts.mockResolvedValue(SocialCountsSchema.parse({}));
    expect(await SocialCounts({ block: 'pk-social' })).toBeNull();
    // Not even asked for the links — nothing to link.
    expect(getPublicSettingsOrDefaults).not.toHaveBeenCalled();
  });

  it('renders nothing for zeros', async () => {
    getSocialCounts.mockResolvedValue(SocialCountsSchema.parse({ youtube: 0, tiktok: 0 }));
    expect(await SocialCounts({ block: 'pk-social' })).toBeNull();
  });

  it('shows each entered count in short form, linked to the stored profile', async () => {
    getSocialCounts.mockResolvedValue(SocialCountsSchema.parse({ youtube: 120_400, facebook: 28_000 }));
    getPublicSettingsOrDefaults.mockResolvedValue({
      contact: ContactSchema.parse({ youtube: 'https://www.youtube.com/@example' }),
    });

    render((await SocialCounts({ block: 'pk-social' }))!);

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('+120 ألف');
    expect(items[0]!.textContent).toContain('مشترك على يوتيوب');

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('https://www.youtube.com/@example');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');

    // Facebook has a count but no profile: shown, not linked.
    expect(items[1]!.textContent).toContain('28 ألف');
    expect(items[1]!.querySelector('a')).toBeNull();
  });
});
