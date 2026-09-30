import { describe, expect, it } from 'vitest';
import { gradingListHref, normalizeGradingQuery } from './nav';

describe('gradingListHref', () => {
  it('omits the default tab and every absent filter', () => {
    expect(gradingListHref({ tab: 'queue' })).toBe('/admin/grading');
  });

  it('carries a non-default tab, sort, exam and day', () => {
    // The bug: the paper's «رجوع» used to be the bare `/admin/grading`
    // string — always the queue tab — so opening a paper from «اتصحّح خلاص»
    // or from an exam/day filter and tapping back threw the admin onto a
    // different, usually much shorter list.
    expect(
      gradingListHref({ tab: 'marked', sort: 'latest', exam: 'lesson-1', day: '2026-09-28' }),
    ).toBe('/admin/grading?tab=marked&sort=latest&exam=lesson-1&day=2026-09-28');
  });

  it('can carry a filter even while the tab stays at its default', () => {
    // Mirrors the list page's own `hrefFor`: every field is independent.
    expect(gradingListHref({ tab: 'queue', exam: 'lesson-1' })).toBe(
      '/admin/grading?exam=lesson-1',
    );
  });
});

describe('normalizeGradingQuery', () => {
  it('accepts a known tab and drops an unknown one to the default', () => {
    expect(normalizeGradingQuery({ tab: 'marked' }).tab).toBe('marked');
    expect(normalizeGradingQuery({ tab: 'not-a-tab' }).tab).toBe('queue');
    expect(normalizeGradingQuery({}).tab).toBe('queue');
  });

  it('drops an invalid sort, exam or day rather than forwarding junk', () => {
    expect(normalizeGradingQuery({ sort: 'not-a-sort' }).sort).toBeUndefined();
    expect(normalizeGradingQuery({ sort: 'latest' }).sort).toBe('latest');
    expect(normalizeGradingQuery({ exam: '' }).exam).toBeUndefined();
    expect(normalizeGradingQuery({ exam: 'lesson-1' }).exam).toBe('lesson-1');
    expect(normalizeGradingQuery({ day: 'not-a-date' }).day).toBeUndefined();
    expect(normalizeGradingQuery({ day: '2026-09-28' }).day).toBe('2026-09-28');
  });

  it('round-trips into a paper back-link identical to the list it came from', () => {
    const query = { tab: 'late', sort: 'earliest', exam: 'lesson-2', day: '2026-09-01' };
    expect(gradingListHref(normalizeGradingQuery(query))).toBe(
      '/admin/grading?tab=late&sort=earliest&exam=lesson-2&day=2026-09-01',
    );
  });

  it('a hand-edited URL with junk lands on the plain default list', () => {
    expect(
      gradingListHref(normalizeGradingQuery({ tab: 'bogus', sort: 'bogus', day: 'bogus' })),
    ).toBe('/admin/grading');
  });
});
