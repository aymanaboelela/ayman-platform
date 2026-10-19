import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCopy } from '@ayman/contracts/format';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { PracticeQuestion } from '@ayman/contracts/practice';
import { QuestionEditor } from './question-editor';

const q = c.question;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const optionField = (letter: string) => formatCopy(q.optionLabel, { letter });
const keyRadio = (letter: string) => screen.getByRole('radio', { name: formatCopy(q.markCorrect, { letter }) });

describe('QuestionEditor', () => {
  it('refuses to save with no key chosen, says so, and never calls onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<QuestionEditor submitLabel={q.add} onSubmit={onSubmit} />);

    type(q.stem, 'أي من الآتي من حقوق الملكية الفكرية؟');
    type(optionField('أ'), 'حق المؤلف');
    type(optionField('ب'), 'حق الانتخاب');
    fireEvent.click(screen.getByRole('button', { name: q.add }));

    expect(await screen.findByText(q.errors.answer)).toBeTruthy();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows every field error on an empty save', async () => {
    const onSubmit = vi.fn();
    render(<QuestionEditor submitLabel={q.add} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: q.add }));

    expect(await screen.findByText(q.errors.stem)).toBeTruthy();
    expect(screen.getByText(q.errors.optionsCount)).toBeTruthy();
    expect(screen.getByText(q.errors.answer)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the option the radio marks, blank rows dropped, and clears for the next question', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<QuestionEditor submitLabel={q.add} onSubmit={onSubmit} />);

    type(q.stem, 'أي من الآتي من حقوق الملكية الفكرية؟');
    type(optionField('أ'), 'حق الانتخاب');
    type(optionField('ب'), 'حق المؤلف');
    type(optionField('ج'), 'حق التعليم');
    fireEvent.click(keyRadio('ب'));
    type(q.explanation, 'حق المؤلف بيحمي العمل الأصلي.');

    // The live preview marks the same row before anything is saved.
    const right = screen.getAllByText(q.previewRight);
    expect(right).toHaveLength(1);
    expect(right[0]!.closest('li')?.textContent).toContain('حق المؤلف');

    fireEvent.click(screen.getByRole('button', { name: q.add }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'mcq',
      stem: 'أي من الآتي من حقوق الملكية الفكرية؟',
      options: ['حق الانتخاب', 'حق المؤلف', 'حق التعليم'],
      answer: 1,
      explanation: 'حق المؤلف بيحمي العمل الأصلي.',
    });
    await waitFor(() => expect((screen.getByLabelText(q.stem) as HTMLTextAreaElement).value).toBe(''));
  });

  it('keeps the key on its own text when a row above it is removed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<QuestionEditor submitLabel={q.add} onSubmit={onSubmit} />);

    type(q.stem, 'سؤال فيه أربع اختيارات');
    type(optionField('أ'), 'واحد');
    type(optionField('ب'), 'اتنين');
    type(optionField('ج'), 'تلاتة');
    type(optionField('د'), 'أربعة');
    fireEvent.click(keyRadio('ج'));
    fireEvent.click(screen.getByRole('button', { name: formatCopy(q.removeOption, { letter: 'أ' }) }));

    // «تلاتة» is now the second row, and still the key.
    expect((keyRadio('ب') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: q.add }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ options: ['اتنين', 'تلاتة', 'أربعة'], answer: 1 });
  });

  it('caps the options at six and never goes under two', () => {
    render(<QuestionEditor submitLabel={q.add} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: q.addOption }));
    fireEvent.click(screen.getByRole('button', { name: q.addOption }));
    expect(screen.queryByRole('button', { name: q.addOption })).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(6);

    for (const letter of ['و', 'هـ', 'د', 'ج']) {
      fireEvent.click(screen.getByRole('button', { name: formatCopy(q.removeOption, { letter }) }));
    }
    const remove = screen.getByRole('button', { name: formatCopy(q.removeOption, { letter: 'أ' }) });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });

  it('writes a صح/غلط question with no options, and drops the key on a type switch', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<QuestionEditor submitLabel={q.add} onSubmit={onSubmit} />);

    type(q.stem, 'براءة الاختراع بتحمي الفكرة لمدة محدودة.');
    type(optionField('أ'), 'واحد');
    fireEvent.click(keyRadio('أ'));
    fireEvent.click(screen.getByRole('button', { name: q.typeToggle.tf }));

    // «أ» had no meaning on صح/غلط — nothing is preselected.
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: q.false }));
    fireEvent.click(screen.getByRole('button', { name: q.add }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'tf',
      stem: 'براءة الاختراع بتحمي الفكرة لمدة محدودة.',
      options: [],
      answer: 1,
      explanation: '',
    });
  });

  it('opens on the saved question when editing, and keeps it after a save', async () => {
    const saved: PracticeQuestion = {
      id: '0192f000-0000-7000-8000-0000000000aa',
      type: 'mcq',
      stem: 'سؤال محفوظ',
      options: ['أول', 'تاني'],
      answer: 1,
      explanation: '',
      position: 0,
    };
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<QuestionEditor initial={saved} number={3} submitLabel={q.save} onSubmit={onSubmit} onCancel={vi.fn()} />);

    expect(screen.getByRole('form', { name: formatCopy(q.number, { n: 3 }) })).toBeTruthy();
    expect((keyRadio('ب') as HTMLInputElement).checked).toBe(true);
    type(optionField('أ'), 'أول بعد التعديل');
    fireEvent.click(screen.getByRole('button', { name: q.save }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ options: ['أول بعد التعديل', 'تاني'], answer: 1 });
    expect((screen.getByLabelText(q.stem) as HTMLTextAreaElement).value).toBe('سؤال محفوظ');
  });
});
