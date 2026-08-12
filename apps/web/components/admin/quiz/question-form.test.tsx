import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { QuestionForm } from './question-form';

vi.mock('@/lib/api', () => ({
  apiPost: vi.fn().mockResolvedValue({ bankEntryId: 'new-id' }),
  apiPatch: vi.fn().mockResolvedValue({ bankEntryId: 'existing-id' }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const CATEGORIES = [{ id: 'cat-1', name: 'فئة تجريبية' }];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QuestionForm', () => {
  it('renders a visible alert (not nowhere) for an invalid submit and never calls onSaved', async () => {
    const onSaved = vi.fn();
    // The illegal state a type switch can produce: two mcq_single options
    // both carrying full credit — `countFullCredit === 1` fails.
    render(
      <QuestionForm
        categories={CATEGORIES}
        onSaved={onSaved}
        defaultValues={
          {
            type: 'mcq_single',
            categoryId: 'cat-1',
            stemHtml: '<p>س</p>',
            defaultMark: 1,
            settings: { shuffleOptions: true, caseSensitive: false },
            options: [
              { bodyHtml: '<p>أ</p>', fraction: 1 },
              { bodyHtml: '<p>ب</p>', fraction: 1 },
            ],
          } as never
        }
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: copy.quizAdmin.save }));

    // Both the form-level banner AND the options-field error render
    // role="alert" — the assertion is that AT LEAST one is visible, which is
    // the regression guard for the discriminated-union trap (a union-level
    // refinement reports at path: [], which no field could ever display).
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((alert) => alert.textContent && alert.textContent.length > 0)).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('swaps the option shape when the type changes to true/false', () => {
    render(<QuestionForm categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText(copy.quizAdmin.type, { exact: false }), {
      target: { value: 'true_false' },
    });

    expect(screen.getByDisplayValue(copy.quiz.true)).toBeInTheDocument();
    expect(screen.getByDisplayValue(copy.quiz.false)).toBeInTheDocument();
  });

  it('collapses the options away entirely for an essay question', () => {
    render(<QuestionForm categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText(copy.quizAdmin.type, { exact: false }), {
      target: { value: 'essay' },
    });

    expect(screen.queryByLabelText(copy.quizAdmin.markCorrect)).not.toBeInTheDocument();
  });

  it('keeps mcq_multi weights summing to 1 as boxes are ticked', () => {
    render(<QuestionForm categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText(copy.quizAdmin.type, { exact: false }), {
      target: { value: 'mcq_multi' },
    });

    const boxes = screen.getAllByRole('checkbox', { name: copy.quizAdmin.markCorrect });
    // The default two options start at fraction 1/0 — tick the second so BOTH
    // are ticked and assert the visible weight inputs re-split to 0.5 each.
    fireEvent.click(boxes[1]!);

    fireEvent.click(
      screen.getByRole('button', { name: copy.quizAdmin.showWeights }),
    );
    const weightInputs = screen.getAllByDisplayValue('0.5');
    expect(weightInputs).toHaveLength(2);
  });
});
