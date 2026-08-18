import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { formatCopy } from '@ayman/contracts/format';
import { ExamLockedDialog } from './exam-locked-dialog';

afterEach(cleanup);

const c = copy.library;

function open(remaining: number | null, total: number | null = 5) {
  render(
    <ExamLockedDialog remaining={remaining} total={total}>
      {c.lessonLocked}
    </ExamLockedDialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: c.lessonLocked }));
}

/**
 * The one padlock left in the product — `/library/[slug]`, `/path` and the
 * player's sidebar all open this. Everything here is asserted through the
 * accessibility tree, because every defect it guards against was invisible in
 * the DOM and obvious in it.
 */
describe('ExamLockedDialog', () => {
  it('says how many lectures are left, which is the only actionable fact', () => {
    open(3, 5);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      formatCopy(c.lockedExamBody, { remaining: 3, total: 5 }),
    );
  });

  it('states the rule without a count rather than printing a wrong one', () => {
    open(null, null);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(c.lockedExamBodyPlain);
  });

  /**
   * ⚠️ The regression this file exists for, and the report behind it: «الـ٢ بتن
   * دول مش شغالين».
   *
   * The footer used to carry «نفتحها دلوقتي» beside the dismiss — a link to
   * `blockerFor`'s answer, the nearest unfinished lesson ABOVE the locked one.
   * On the player that is, in the ordinary case, the lesson the student is
   * sitting on, so the dialog offered to take them to the page they were
   * already on and pressing it navigated to the current URL: no movement, no
   * message. The other button was never broken; it closed a dialog that left
   * the student exactly where they started, which reads as the same failure.
   *
   * The rule, asserted rather than commented: a dialog explaining a block
   * carries no control that lands the student where they already are.
   */
  it('offers no destination — nothing here can move the student forward', () => {
    open(2);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('actually closes when the dismiss is pressed', () => {
    open(2);

    fireEvent.click(screen.getByRole('button', { name: c.lockedClose }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /**
   * ⚠️ The X and the footer button both read «تمام» once, so the dialog had two
   * controls with one accessible name — ambiguous to a screen reader's control
   * list, to voice control, and to any `getByRole` that follows. Measured on
   * production: `button "تمام"` appeared twice in the a11y tree.
   * `exam-gate-dialog.tsx` states the rule; this dialog broke it, and so did
   * the tests written against it.
   */
  it('gives every control in the dialog a distinct accessible name', () => {
    open(2);

    const names = screen
      .getAllByRole('button')
      .map((el) => el.textContent?.trim() || el.getAttribute('aria-label') || '');

    expect(new Set(names).size).toBe(names.length);
  });
});
