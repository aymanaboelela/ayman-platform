import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts';
import { LessonLockDialog } from './lesson-lock-dialog';

afterEach(cleanup);

const c = copy.library;

function open(blockedBy: Parameters<typeof LessonLockDialog>[0]['blockedBy'], isExam = false) {
  render(
    <LessonLockDialog blockedBy={blockedBy} isExam={isExam} courseSlug="programming-foundation">
      {c.lessonLocked}
    </LessonLockDialog>,
  );
  fireEvent.click(screen.getByRole('button', { name: c.lessonLocked }));
}

const blocker = { id: 'lesson-3', title: 'المحاضرة الثالثة', kind: 'video' as const };

/**
 * The dialog three screens now share — `/library/[slug]`, `/path` and the
 * player's sidebar. Everything here is asserted through the accessibility
 * tree, because both defects it guards against were invisible in the DOM and
 * obvious in it.
 */
describe('LessonLockDialog', () => {
  it('names the exact lesson in the way, and offers to open it', () => {
    open(blocker);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      c.lockedBecause.replace('{lesson}', blocker.title),
    );
    expect(screen.getByRole('link', { name: c.lockedGo })).toHaveAttribute(
      'href',
      '/courses/programming-foundation/lessons/lesson-3',
    );
  });

  /**
   * ⚠️ The regression this file exists for.
   *
   * The X and the footer button both read «تمام», so the dialog had two
   * controls with one accessible name — ambiguous to a screen reader's control
   * list, to voice control, and to any `getByRole` that follows. Measured on
   * production: `button "تمام"` appeared twice in the a11y tree.
   * `exam-gate-dialog.tsx` states the rule; this dialog broke it, and so did
   * the two written against it.
   */
  it('gives every control in the dialog a distinct accessible name', () => {
    open(blocker);

    const names = screen
      .getAllByRole('button')
      .concat(screen.getAllByRole('link'))
      .map((el) => el.textContent?.trim() || el.getAttribute('aria-label') || '');

    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * «للمطلوب» was a preposition and a noun with no verb in it, and it was read
   * as not being a control at all — «دي مش مشغّالين أصلاً». The link worked; it
   * did not look like it would. A label with no verb in it is the failure, so
   * that is what is asserted rather than the exact wording.
   */
  it('labels the way forward with a verb, not a destination', () => {
    open(blocker);

    const label = screen.getByRole('link', { name: c.lockedGo }).textContent ?? '';
    expect(label.startsWith('لل')).toBe(false);
    expect(label.length).toBeGreaterThan(4);
  });

  it('offers no destination for the exam, which no single lesson blocks', () => {
    open(null, true);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(c.lockedExam);
    expect(screen.queryByRole('link', { name: c.lockedGo })).toBeNull();
  });

  it('falls back to the generic reason when the blocker cannot be named', () => {
    open(null);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(c.lockedGeneric);
  });
});
