import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { examSignals } from '@ayman/contracts/copy/exam-signals';
import { summariseExamSignals, type AdminExamSignal } from '@ayman/contracts/quiz/exam-signals';
import { ExamSignalsPanel, formatAway } from './exam-signals-panel';

const row = (overrides: Partial<AdminExamSignal>): AdminExamSignal => ({
  type: 'opened',
  at: '2026-10-25T17:00:00.000Z',
  questionNumber: 1,
  chars: null,
  text: null,
  awayMs: null,
  ...overrides,
});

afterEach(cleanup);

describe('ExamSignalsPanel', () => {
  it('says plainly when nothing happened', () => {
    render(<ExamSignalsPanel signals={summariseExamSignals([row({})])} />);
    expect(screen.getByText(examSignals.clean)).toBeTruthy();
  });

  it('shows the counts, the time away, and the pasted text itself', () => {
    render(
      <ExamSignalsPanel
        signals={summariseExamSignals([
          row({}),
          row({ type: 'paste', questionNumber: 3, chars: 21, text: 'answer from a chatbot' }),
          row({ type: 'hidden', questionNumber: 3 }),
          row({ type: 'visible', questionNumber: 3, awayMs: 200_000 }),
        ])}
      />,
    );
    expect(screen.getByText('لصق 1')).toBeTruthy();
    expect(screen.getByText('خروج 1')).toBeTruthy();
    expect(screen.getByText(`برا الامتحان ${formatAway(200_000)}`)).toBeTruthy();
    expect(screen.getByText('answer from a chatbot')).toBeTruthy();
  });
});

describe('formatAway', () => {
  it('reads in the largest unit that matters', () => {
    expect(formatAway(45_000)).toBe('45 ث');
    expect(formatAway(200_000)).toBe('3 د 20 ث');
    expect(formatAway(3_900_000)).toBe('1 س 5 د');
  });
});
