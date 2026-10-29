import { describe, expect, it } from 'vitest';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import {
  SocialCountsInputSchema,
  SocialCountsSchema,
  shortFollowerCount,
  visibleSocialCounts,
} from '@ayman/contracts/admin/social-counts';

describe('shortFollowerCount', () => {
  it.each([
    [0, '0'],
    [850, '850'],
    [999, '999'],
    [1000, 'ألف'],
    [1050, '+ألف'],
    [1200, '1.2 ألف'],
    [1250, '+1.2 ألف'],
    [2000, 'ألفين'],
    [2300, '2.3 ألف'],
    [5000, '5 آلاف'],
    [9999, '+9.9 ألف'],
    [10_000, '10 آلاف'],
    [11_000, '11 ألف'],
    [120_000, '120 ألف'],
    [120_400, '+120 ألف'],
    [103_000, '103 آلاف'],
    [999_999, '+999 ألف'],
    [1_000_000, 'مليون'],
    [1_500_000, '1.5 مليون'],
    [2_000_000, 'مليونين'],
    [3_000_000, '3 ملايين'],
    [12_700_000, '+12 مليون'],
  ])('%i → %s', (count, expected) => {
    expect(shortFollowerCount(count)).toBe(expected);
  });

  // Rounding up would claim a number the profile contradicts one tap later.
  it('never reads higher than the real count', () => {
    expect(shortFollowerCount(1199)).toBe('+1.1 ألف');
    expect(shortFollowerCount(1_999_999)).toBe('+1.9 مليون');
  });
});

describe('visibleSocialCounts', () => {
  it('drops empty and zero counts and keeps display order', () => {
    const counts = SocialCountsInputSchema.parse({ tiktok: 40_000, youtube: 120_000, facebook: 0 });
    expect(visibleSocialCounts(counts)).toEqual([
      { network: 'youtube', count: 120_000 },
      { network: 'tiktok', count: 40_000 },
    ]);
  });

  it('is empty for a stack nobody has filled in', () => {
    expect(visibleSocialCounts(SocialCountsSchema.parse({}))).toEqual([]);
  });
});

describe('storage', () => {
  // CLAUDE.md §2 rule 2: a row a new stack never wrote must read as EMPTY.
  it('reads a settings row that predates the key as all-empty counts', () => {
    expect(SiteSettingsSchema.parse({}).socialCounts).toEqual({
      youtube: null,
      facebook: null,
      instagram: null,
      tiktok: null,
      updatedAt: null,
    });
  });

  it('does not let the form send its own «last updated»', () => {
    expect(SocialCountsInputSchema.safeParse({ updatedAt: '2026-10-29T00:00:00.000Z' }).success).toBe(false);
  });

  it('rejects negative and fractional counts', () => {
    expect(SocialCountsInputSchema.safeParse({ youtube: -1 }).success).toBe(false);
    expect(SocialCountsInputSchema.safeParse({ youtube: 1.5 }).success).toBe(false);
  });
});
