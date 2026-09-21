import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { formatCopy } from '@ayman/contracts/format';
import { MonthLockedDialog, type LockedLessonMonth } from './month-locked-dialog';

afterEach(cleanup);

const c = copy.library;

function open(props: { month?: LockedLessonMonth | null; courseSlug?: string } = {}) {
  render(
    <MonthLockedDialog {...props}>{c.lessonMonthLocked}</MonthLockedDialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: c.lessonMonthLocked }));
}

/**
 * The second padlock in the product, and the one this file exists to keep
 * DIFFERENT from the first.
 *
 * `exam-locked-dialog.test.tsx` asserts that its dialog offers no destination
 * — that is the rule that dialog is written to. This one asserts the opposite,
 * because a month lock is waiting on a payment rather than on work, and a
 * padlock with nothing behind it would be better hidden than drawn.
 */
describe('MonthLockedDialog', () => {
  it('names the month and what subscribing to it opens', () => {
    open({ month: { id: 'm-2', title: 'شهر ٣ — نوفمبر', lessonCount: 5 } });

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      formatCopy(c.lockedMonthBody, { month: 'شهر ٣ — نوفمبر', count: 5 }),
    );
  });

  /**
   * The SHIPPED path today, not an edge case: no student-facing payload maps a
   * lesson to its month (`CatalogLessonSchema` has no `monthIds`), so every
   * caller falls here until one does. Naming a month we guessed would sell the
   * wrong month.
   */
  it('says the true, vaguer thing when no month can be named', () => {
    open();

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(c.lockedMonthBodyPlain);
  });

  /**
   * `?month=` is not decoration. `proxy.ts` 307s `/courses/:slug` to
   * `/library/:slug` for any student with live access, and owning ONE month
   * makes that true — so a bare course link here returns them to the page they
   * pressed it from. The parameter is what the proxy exempts on.
   */
  it('offers the month, carrying the id the proxy exempts on', () => {
    open({ courseSlug: 'programming-y1', month: { id: 'm-3', title: 'شهر ٣', lessonCount: 5 } });

    expect(screen.getByRole('link', { name: c.lockedMonthCta })).toHaveAttribute(
      'href',
      '/courses/programming-y1?month=m-3',
    );
  });

  /** A screen that does not know its course renders no link at all — a dead
   *  `<a>` is worse than a sentence. */
  it('drops the CTA rather than rendering it dead', () => {
    open();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  /** And the same when the course IS known but the month is not: that link
   *  would be a bare `/courses/:slug`, which the proxy bounces straight back. */
  it('drops the CTA when no month can be named', () => {
    open({ courseSlug: 'programming-y1' });

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('actually closes when the dismiss is pressed', () => {
    open({ courseSlug: 'programming-y1' });

    fireEvent.click(screen.getByRole('button', { name: c.lockedMonthClose }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /** The X reads «إغلاق» and the footer «مش دلوقتي» — the exam dialog shipped
   *  both as «تمام» and `exam-gate-dialog.tsx` states the rule. */
  it('gives every control in the dialog a distinct accessible name', () => {
    open({ courseSlug: 'programming-y1' });

    const names = screen
      .getAllByRole('button')
      .map((el) => el.textContent?.trim() || el.getAttribute('aria-label') || '');

    expect(new Set(names).size).toBe(names.length);
  });
});
