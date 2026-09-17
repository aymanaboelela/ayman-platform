import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STUDENT_NAV,
  activeStudentNav,
  isAttemptRoute,
  isRailForcedCollapsed,
} from './student-nav-items';

describe('activeStudentNav', () => {
  it('matches an exact top-level route', () => {
    expect(activeStudentNav('/path')?.href).toBe('/path');
  });

  it('lights «الكورسات» from inside the lesson player', () => {
    // The player lives under /courses/:slug/lessons/:id but is reached from
    // /library, which is what the rail entry points at. Without the alias the
    // rail lights nothing while a student is watching a lesson.
    expect(activeStudentNav('/courses/python-1/lessons/abc')?.href).toBe('/library');
  });

  it('matches the library itself', () => {
    expect(activeStudentNav('/library')?.href).toBe('/library');
  });

  it('prefers the longest matching href', () => {
    // `/settings/devices` is the only entry under /settings today, but the
    // rule — not the current table — is what this asserts: were a shorter
    // `/settings` entry ever added, the deeper one must still win.
    expect(activeStudentNav('/settings/devices')?.href).toBe('/settings/devices');
  });

  it('matches /dashboard exactly and never by prefix', () => {
    expect(activeStudentNav('/dashboard')?.href).toBe('/dashboard');
    // A future `/dashboard/reports` must resolve to that child's own entry, or
    // to nothing — never to the root, which would light two links at once.
    expect(activeStudentNav('/dashboard/reports')).toBeNull();
  });

  it('returns null for a route outside the table', () => {
    expect(activeStudentNav('/quizzes/abc/attempt/def/review')).toBeNull();
  });

  it('never returns two entries for one path', () => {
    // The regression this guards: per-item `startsWith` lets both /courses and
    // /settings/devices match at once, and two links end up carrying
    // aria-current="page" — which tells a screen reader the user is in two
    // places. `activeStudentNav` returning a single item is the fix.
    for (const path of [
      '/dashboard',
      '/path',
      '/library',
      '/foundations',
      '/playground',
      '/settings/devices',
    ]) {
      const matches = STUDENT_NAV.filter((item) => activeStudentNav(path)?.href === item.href);
      expect(matches).toHaveLength(1);
    }
  });
});

describe('every rail entry stays inside the student shell', () => {
  /**
   * The defect this is written for, not a tidiness rule.
   *
   * «الكتب» pointed at `/books` for months. That is a `(site)` route — the
   * marketing shop — so pressing it in the rail navigated OUT of the app: the
   * rail disappeared, the topbar was replaced by the marketing header, and the
   * only way back was the browser's own button. It was deliberate at the time
   * (the shop had no other entrance) and the comment above the entry said so,
   * which is exactly why nobody read it as a bug. It was reported as one:
   * «متفتحهاش صفحة لوحدها».
   *
   * A rail is a promise that the thing it points at is part of this
   * application. The fix was `(app)/store`; this is what stops the next entry
   * from quietly making the same trade.
   *
   * Source-level rather than a click in Playwright: a browser test would catch
   * it, twenty minutes later, on a shard — and only if someone thought to
   * write one per entry. This fails on a laptop, on every entry, for free.
   */
  it('resolves each href to a page under app/(app)', () => {
    const group = join(__dirname, '..', '..', 'app', '(app)');
    const outside = STUDENT_NAV.filter(
      (item) => !existsSync(join(group, item.href, 'page.tsx')),
    ).map((item) => `${item.labelAr} → ${item.href}`);

    expect(
      outside,
      `these rail entries do not resolve to a page inside the student shell, so pressing them leaves the app: ${outside.join(', ')}`,
    ).toEqual([]);
  });

  it('finds the group at all, so the walk cannot pass by finding nothing', () => {
    expect(STUDENT_NAV.length).toBeGreaterThan(5);
  });
});

describe('isAttemptRoute', () => {
  it('is true for a running attempt', () => {
    expect(isAttemptRoute('/quizzes/lesson-1/attempt/attempt-1')).toBe(true);
  });

  it('is FALSE for the review screen under it', () => {
    // The review screen is not a graded, timed attempt and must keep the
    // shell. This is what the anchored `$` in the pattern buys.
    expect(isAttemptRoute('/quizzes/lesson-1/attempt/attempt-1/review')).toBe(false);
  });

  it('is false for the quiz landing page', () => {
    expect(isAttemptRoute('/quizzes/lesson-1')).toBe(false);
  });

  it('is false elsewhere in the app', () => {
    expect(isAttemptRoute('/dashboard')).toBe(false);
  });
});

describe('isRailForcedCollapsed', () => {
  it('is true inside the lesson player', () => {
    expect(isRailForcedCollapsed('/courses/python-1/lessons/lesson-9')).toBe(true);
  });

  it('is false on the course page above it', () => {
    expect(isRailForcedCollapsed('/courses/python-1')).toBe(false);
  });

  it('is false on the catalog', () => {
    expect(isRailForcedCollapsed('/courses')).toBe(false);
  });
});
