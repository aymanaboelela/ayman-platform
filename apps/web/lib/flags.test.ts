import { describe, expect, it, vi } from 'vitest';

// `lib/flags.ts` is a server module: it imports `next/cache`, which has no
// meaning under vitest. Only `stackFlag` — a pure function — is under test.
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

const { stackFlag } = await import('./flags');

const row = (key: string, enabled: boolean) => ({ key, descriptionAr: 'x', enabled, updatedAt: 'now' });

describe('stackFlag', () => {
  it('obeys the row when there is one, on either kind of stack', () => {
    expect(stackFlag([row('guide.firstVisit', true)], 'guide.firstVisit', false)).toBe(true);
    expect(stackFlag([row('guide.firstVisit', false)], 'guide.firstVisit', true)).toBe(false);
  });

  it('is OFF on a teacher’s stack whose API has not created the row yet', () => {
    // The case `isEnabled()` gets wrong: a missing row there answers the
    // ORIGINAL stack's default, which would switch a new feature on for a
    // teacher nobody opened it for, for as long as web is newer than API.
    expect(stackFlag([], 'guide.firstVisit', false)).toBe(false);
    expect(stackFlag([row('quiz.practiceMode', true)], 'guide.firstVisit', false)).toBe(false);
  });

  it('is OFF on a teacher’s stack when the flags could not be read at all', () => {
    expect(stackFlag(null, 'guide.firstVisit', false)).toBe(false);
  });

  it('is ON on the original stack when the row is missing or the read failed', () => {
    expect(stackFlag([], 'guide.firstVisit', true)).toBe(true);
    expect(stackFlag(null, 'guide.firstVisit', true)).toBe(true);
  });

  it('falls back to the plain default for a flag with no tenant default', () => {
    expect(stackFlag(null, 'quiz.practiceMode', false)).toBe(true);
    expect(stackFlag(null, 'catalog.showComingSoon', false)).toBe(false);
  });

  it('answers false for a key nobody declared', () => {
    expect(stackFlag([row('made.up', true)], 'made.up' as never, true)).toBe(false);
  });
});
