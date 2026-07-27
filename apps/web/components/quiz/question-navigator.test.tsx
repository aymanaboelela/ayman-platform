import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionNavigator, type NavigatorQuestion } from './question-navigator';

afterEach(() => {
  cleanup();
});

const QUESTIONS: NavigatorQuestion[] = [
  { slotPosition: 0, answered: false, flagged: false },
  { slotPosition: 1, answered: false, flagged: false },
  { slotPosition: 2, answered: false, flagged: false },
];

/**
 * I6 regression. The app is RTL-only (`<html lang="ar" dir="rtl">`,
 * `app/layout.tsx`) — this grid is `grid-cols-*` under that direction, so
 * column 1 (Q1) sits at the visual RIGHT and reading order runs
 * right-to-left. Rendered inside a `dir="rtl"` ancestor, exactly like the
 * real app, to match the environment the bug (and the fix) actually live in.
 *
 * These assertions are RTL-shaped on purpose: an LTR-shaped test — "ArrowRight
 * moves to the next item, ArrowLeft to the previous" — would have passed
 * against the ORIGINAL buggy handler (it hardcoded exactly that LTR mapping)
 * and proven nothing. The correct RTL mapping is the reverse: ArrowLeft is
 * the key that points toward the next item (visually further left, i.e.
 * further into RTL reading order), and ArrowRight points back toward the
 * previous one.
 */
describe('QuestionNavigator keyboard arrows under dir="rtl"', () => {
  it('ArrowLeft moves focus to the NEXT question', () => {
    const onSelect = vi.fn();
    render(
      <div dir="rtl">
        <QuestionNavigator questions={QUESTIONS} current={0} onSelect={onSelect} />
      </div>,
    );

    const first = screen.getByRole('button', { name: 'السؤال 1' });
    const second = screen.getByRole('button', { name: 'السؤال 2' });
    first.focus();
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: 'ArrowLeft' });

    expect(second).toHaveFocus();
  });

  it('ArrowRight moves focus to the PREVIOUS question', () => {
    const onSelect = vi.fn();
    render(
      <div dir="rtl">
        <QuestionNavigator questions={QUESTIONS} current={1} onSelect={onSelect} />
      </div>,
    );

    const second = screen.getByRole('button', { name: 'السؤال 2' });
    const first = screen.getByRole('button', { name: 'السؤال 1' });
    second.focus();
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: 'ArrowRight' });

    expect(first).toHaveFocus();
  });

  it('ArrowLeft at the last question stays put (clamped, does not wrap)', () => {
    const onSelect = vi.fn();
    render(
      <div dir="rtl">
        <QuestionNavigator questions={QUESTIONS} current={2} onSelect={onSelect} />
      </div>,
    );

    const last = screen.getByRole('button', { name: 'السؤال 3' });
    last.focus();
    fireEvent.keyDown(last, { key: 'ArrowLeft' });

    expect(last).toHaveFocus();
  });

  it('Home and End remain logical first/last in both directions', () => {
    const onSelect = vi.fn();
    render(
      <div dir="rtl">
        <QuestionNavigator questions={QUESTIONS} current={1} onSelect={onSelect} />
      </div>,
    );

    const current = screen.getByRole('button', { name: 'السؤال 2' });
    const firstQuestion = screen.getByRole('button', { name: 'السؤال 1' });
    const lastQuestion = screen.getByRole('button', { name: 'السؤال 3' });
    current.focus();

    fireEvent.keyDown(current, { key: 'End' });
    expect(lastQuestion).toHaveFocus();

    fireEvent.keyDown(lastQuestion, { key: 'Home' });
    expect(firstQuestion).toHaveFocus();
  });
});
