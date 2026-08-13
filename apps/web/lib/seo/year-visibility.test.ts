import { describe, expect, it } from 'vitest';
import { isYearIndexable } from './year-visibility';

const course = (year: number) => ({ year });

describe('isYearIndexable', () => {
  it('indexes a year that has a published course', () => {
    expect(isYearIndexable([course(2)], 2)).toBe(true);
  });

  /**
   * The case this function was written for: on 2026-08-13 the live catalogue
   * held exactly one course, in year 2. Years 1 and 3 rendered nothing but the
   * empty state while the sitemap advertised both at priority 0.7.
   */
  it('does not index a year whose courses are not published yet', () => {
    const live = [course(2)];
    expect(isYearIndexable(live, 1)).toBe(false);
    expect(isYearIndexable(live, 3)).toBe(false);
  });

  /**
   * ⚠️ The regression that would be silent and expensive.
   *
   * `getCatalogOrEmpty` returns `[]` for an unreachable API exactly as it does
   * for an empty catalogue. If this returned false on an empty list, one API
   * blip during a build would ship `noindex` on all three year pages and drop
   * them from the sitemap — a self-inflicted deindex with no error anywhere.
   */
  it('indexes every year when the catalogue is empty, because that may be an outage', () => {
    expect(isYearIndexable([], 1)).toBe(true);
    expect(isYearIndexable([], 2)).toBe(true);
    expect(isYearIndexable([], 3)).toBe(true);
  });

  it('self-heals the moment a course is published for that year', () => {
    expect(isYearIndexable([course(2)], 3)).toBe(false);
    expect(isYearIndexable([course(2), course(3)], 3)).toBe(true);
  });
});
