import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { apiPatch, apiPost } from '@/lib/api';
import { QuestionForm } from './question-form';

vi.mock('@/lib/api', () => ({
  apiPost: vi.fn().mockResolvedValue({ bankEntryId: 'new-id', versionId: 'v-1' }),
  apiPatch: vi.fn().mockResolvedValue({ bankEntryId: 'existing-id', versionId: 'v-2' }),
  // The regrade preview the confirmation asks for: three answers on the old key.
  apiGet: vi.fn().mockResolvedValue({
    bankEntryId: 'existing-id',
    version: 1,
    answers: 3,
    finished: 3,
    inProgress: 0,
    students: 3,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

/** A published true/false question keyed «صح» — the shape of the live bug. */
const KEYED_TRUE = {
  type: 'true_false',
  categoryId: 'cat-1',
  stemHtml: '<p>حقوق المؤلف تشترط التسجيل</p>',
  defaultMark: 1,
  settings: { shuffleOptions: true, caseSensitive: false },
  options: [
    { bodyHtml: '<p>صح</p>', fraction: 1 },
    { bodyHtml: '<p>خطأ</p>', fraction: 0 },
  ],
} as never;

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

  it('keeps the bodies and drops the correctness controls when switching to ordering', () => {
    render(<QuestionForm categories={CATEGORIES} />);

    fireEvent.change(screen.getByLabelText(copy.quizAdmin.type, { exact: false }), {
      target: { value: 'ordering' },
    });

    // Nothing to tick: the row ORDER is the answer.
    expect(screen.queryByLabelText(copy.quizAdmin.markCorrect)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.quizAdmin.showWeights }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(copy.quizAdmin.orderingHint)).toBeInTheDocument();
    // The default two options are padded to the three the type needs.
    expect(screen.getAllByLabelText(copy.quizAdmin.options)).toHaveLength(3);
  });

  it('asks for the key instead of guessing it when switching back from ordering', () => {
    render(<QuestionForm categories={CATEGORIES} bankEntryId="entry-1" />);
    const typeSelect = screen.getByLabelText(copy.quizAdmin.type, { exact: false });

    fireEvent.change(typeSelect, { target: { value: 'ordering' } });
    fireEvent.change(typeSelect, { target: { value: 'mcq_single' } });

    // Every ordering row carries a weight of 0, and it stays that way: a first
    // row ticked FOR the instructor reads exactly like a key they chose.
    const radios = screen.getAllByRole('radio', { name: copy.quizAdmin.markCorrect });
    for (const radio of radios) expect(radio).not.toBeChecked();
    expect(screen.getByText(copy.quizAdmin.noCorrectYet)).toBeInTheDocument();

    fireEvent.click(radios[1]!);
    expect(radios[1]).toBeChecked();
    expect(screen.queryByText(copy.quizAdmin.noCorrectYet)).not.toBeInTheDocument();
  });

  it('starts a new question with no key, and a true/false with neither answer ticked', () => {
    render(<QuestionForm categories={CATEGORIES} />);
    for (const radio of screen.getAllByRole('radio', { name: copy.quizAdmin.markCorrect })) {
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByText(copy.quizAdmin.noCorrectYet)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(copy.quizAdmin.type, { exact: false }), {
      target: { value: 'true_false' },
    });
    for (const radio of screen.getAllByRole('radio', { name: copy.quizAdmin.markCorrect })) {
      expect(radio).not.toBeChecked();
    }
    expect(screen.getByText(copy.quizAdmin.noCorrectYet)).toBeInTheDocument();
  });

  it('reads the chosen key back in words and marks its row', () => {
    render(<QuestionForm categories={CATEGORIES} />);
    fireEvent.change(screen.getByLabelText(copy.quizAdmin.type, { exact: false }), {
      target: { value: 'true_false' },
    });
    const radios = screen.getAllByRole('radio', { name: copy.quizAdmin.markCorrect });
    fireEvent.click(radios[1]!);

    expect(screen.getByText(copy.quizAdmin.correctTag)).toBeInTheDocument();
    expect(
      screen.getByText(copy.quizAdmin.correctSummary.replace('{answer}', copy.quiz.false)),
    ).toBeInTheDocument();
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
    // The default two options start with nothing ticked — tick both and
    // assert the visible weight inputs re-split to 0.5 each.
    fireEvent.click(boxes[0]!);
    fireEvent.click(boxes[1]!);

    fireEvent.click(
      screen.getByRole('button', { name: copy.quizAdmin.showWeights }),
    );
    const weightInputs = screen.getAllByDisplayValue('0.5');
    expect(weightInputs).toHaveLength(2);
  });

  it('asks before publishing an edit, names the key change, and saves nothing until confirmed', async () => {
    render(<QuestionForm categories={CATEGORIES} bankEntryId="existing-id" defaultValues={KEYED_TRUE} publishOnSave />);

    fireEvent.click(screen.getAllByRole('radio', { name: copy.quizAdmin.markCorrect })[1]!);
    fireEvent.click(screen.getByRole('button', { name: copy.quizAdmin.bank.saveAndPublish }));

    expect(await screen.findByText(copy.quizAdmin.saveConfirmTitle)).toBeInTheDocument();
    expect(
      screen.getByText(formatCopy(copy.quizAdmin.saveConfirmKeyChanged, { from: 'صح', to: 'خطأ' })),
    ).toBeInTheDocument();
    // The answers already given on the old key — offered, and ticked, because the key moved.
    const regrade = await screen.findByRole('checkbox');
    expect(regrade).toBeChecked();
    expect(apiPatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: copy.quizAdmin.saveConfirmAction }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/api/admin/questions/existing-id/regrade', expect.anything(), {}),
    );
  });

  it('lets a mis-click walk away: «لأ، ارجع» saves nothing', async () => {
    render(<QuestionForm categories={CATEGORIES} bankEntryId="existing-id" defaultValues={KEYED_TRUE} publishOnSave />);

    fireEvent.click(screen.getByRole('button', { name: copy.quizAdmin.bank.saveAndPublish }));
    fireEvent.click(await screen.findByRole('button', { name: copy.quizAdmin.saveConfirmCancel }));

    await waitFor(() => expect(screen.queryByText(copy.quizAdmin.saveConfirmTitle)).not.toBeInTheDocument());
    expect(apiPatch).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });
});
