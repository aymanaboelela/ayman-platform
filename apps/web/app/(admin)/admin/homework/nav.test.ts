import { describe, expect, it } from 'vitest';
import { homeworkBackHref } from './nav';

describe('homeworkBackHref', () => {
  it('carries a real filter back onto the list', () => {
    // The bug: opening a submission from «الكل» and tapping «رجوع» used to
    // land on the bare, pending-only default — not on «الكل».
    expect(homeworkBackHref('all')).toBe('/admin/homework?filter=all');
    expect(homeworkBackHref('accepted')).toBe('/admin/homework?filter=accepted');
    expect(homeworkBackHref('needs_work')).toBe('/admin/homework?filter=needs_work');
    expect(homeworkBackHref('pending')).toBe('/admin/homework?filter=pending');
  });

  it('falls back to the bare list for a missing or bogus filter', () => {
    expect(homeworkBackHref(undefined)).toBe('/admin/homework');
    expect(homeworkBackHref('')).toBe('/admin/homework');
    // A hand-edited URL should land on the default view, never on a 400 or a
    // query the API would reject.
    expect(homeworkBackHref('not-a-real-filter')).toBe('/admin/homework');
  });
});
