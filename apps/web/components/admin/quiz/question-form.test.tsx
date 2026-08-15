import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { apiPatch } from '@/lib/api';
import { QuestionForm } from './question-form';

vi.mock('@/lib/api', () => ({
  apiPost: vi.fn().mockResolvedValue({ bankEntryId: 'new-id', versionId: 'v-1' }),
  apiPatch: vi.fn().mockResolvedValue({ bankEntryId: 'existing-id', versionId: 'v-2' }),
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

  it('shows the stem and the options as text, never as the markup they are stored as', () => {
    // The exact shape `parseQuestionBlocks` and the seed write. Rendered raw,
    // the Latin tags and the Arabic content reorder against each other under
    // bidi and the `</p>` lands mid-sentence — the instructor cannot tell
    // which way an ordering question even reads.
    render(
      <QuestionForm
        categories={CATEGORIES}
        bankEntryId="entry-1"
        defaultValues={
          {
            type: 'mcq_single',
            categoryId: 'cat-1',
            stemHtml: '<p>رتّب من الأسرع للأبطأ:</p>',
            defaultMark: 1,
            settings: { shuffleOptions: true, caseSensitive: false },
            options: [
              { bodyHtml: '<p>CPU ثم Cache ثم RAM ثم Storage</p>', fraction: 1 },
              { bodyHtml: '<p>Storage ثم RAM ثم Cache ثم CPU</p>', fraction: 0 },
            ],
          } as never
        }
      />,
    );

    expect(screen.getByLabelText(copy.quizAdmin.stem)).toHaveValue('رتّب من الأسرع للأبطأ:');
    expect(screen.getByDisplayValue('CPU ثم Cache ثم RAM ثم Storage')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Storage ثم RAM ثم Cache ثم CPU')).toBeInTheDocument();
  });

  it('wraps what the instructor typed back into paragraphs on save', async () => {
    render(
      <QuestionForm
        categories={CATEGORIES}
        bankEntryId="entry-1"
        defaultValues={
          {
            type: 'mcq_single',
            categoryId: 'cat-1',
            stemHtml: '<p>سؤال قديم</p>',
            defaultMark: 1,
            settings: { shuffleOptions: true, caseSensitive: false },
            options: [
              { bodyHtml: '<p>أ</p>', fraction: 1 },
              { bodyHtml: '<p>ب</p>', fraction: 0 },
            ],
          } as never
        }
      />,
    );

    fireEvent.change(screen.getByLabelText(copy.quizAdmin.stem), {
      target: { value: 'لو س < 5 يبقى إيه؟' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.quizAdmin.save }));

    await waitFor(() => expect(apiPatch).toHaveBeenCalled());
    const payload = vi.mocked(apiPatch).mock.calls[0]![1] as {
      stemHtml: string;
      options: { bodyHtml: string }[];
    };
    // The `<` is content, not a tag — escaped, not passed through to the
    // sanitizer to be eaten.
    expect(payload.stemHtml).toBe('<p>لو س &lt; 5 يبقى إيه؟</p>');
    // Options nobody touched go back exactly as they were stored.
    expect(payload.options.map((option) => option.bodyHtml)).toEqual(['<p>أ</p>', '<p>ب</p>']);
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
