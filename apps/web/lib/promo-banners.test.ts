import { describe, expect, it, vi } from 'vitest';
import type { PublicPromoBanner } from '@ayman/contracts/admin/promo-banners';

vi.mock('next/cache', () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));
vi.mock('@/lib/api', () => ({ apiGet: vi.fn() }));
vi.mock('@/lib/entitlements', () => ({ getEntitlements: vi.fn() }));

const { bannersFor } = await import('./promo-banners');

const KEY = 'ab/0192f0e4-7b1c-7cc0-9f00-0123456789ab.webp';

function banner(overrides: Partial<PublicPromoBanner>): PublicPromoBanner {
  return { id: 'b', title: null, imageKey: KEY, linkUrl: null, years: [], startsOn: null, endsOn: null, ...overrides };
}

describe('bannersFor', () => {
  // 22:30 UTC on the 6th is the 7th in Cairo.
  const now = new Date('2026-11-06T22:30:00.000Z');

  it('drops what has not started and what has ended, by the Cairo day', () => {
    const list = [
      banner({ id: 'open' }),
      banner({ id: 'starts-today', startsOn: '2026-11-07' }),
      banner({ id: 'tomorrow', startsOn: '2026-11-08' }),
      banner({ id: 'ended-yesterday', endsOn: '2026-11-06' }),
      banner({ id: 'last-day', endsOn: '2026-11-07' }),
    ];
    expect(bannersFor(list, null, now).map((b) => b.id)).toEqual(['open', 'starts-today', 'last-day']);
  });

  it("keeps a year's banner for that year only, and everyone's for everyone", () => {
    const list = [banner({ id: 'all' }), banner({ id: 'y2', years: [2] })];
    expect(bannersFor(list, 2, now).map((b) => b.id)).toEqual(['all', 'y2']);
    expect(bannersFor(list, 3, now).map((b) => b.id)).toEqual(['all']);
    expect(bannersFor(list, null, now).map((b) => b.id)).toEqual(['all']);
  });

  it('classifies the link on the server, and draws a bad one as no link', () => {
    const list = [
      banner({ id: 'in', linkUrl: '/library' }),
      banner({ id: 'out', linkUrl: 'https://example.com/x' }),
      banner({ id: 'bad', linkUrl: '//evil.example' }),
      banner({ id: 'none' }),
    ];
    expect(bannersFor(list, null, now).map((b) => b.linkKind)).toEqual(['internal', 'external', null, null]);
  });
});
