import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import { addPracticeQuestions } from '@/app/(admin)/admin/practice/actions';
import { PasteQuestionsDialog } from './paste-questions-dialog';

const refresh = vi.fn();

vi.mock('@/app/(admin)/admin/practice/actions', () => ({
  addPracticeQuestions: vi.fn().mockResolvedValue({ ok: true, data: {} }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SET_ID = '0192f000-0000-7000-8000-000000000001';

const GOOD = [
  'أي من الآتي من حقوق الملكية الفكرية؟',
  'أ) حق المؤلف',
  'ب) حق الانتخاب',
  'الإجابة: أ',
  'الشرح: حق المؤلف بيحمي العمل الأصلي.',
  '',
  'براءة الاختراع بتحمي الفكرة للأبد.',
  'أ) صح',
  'ب) غلط',
  'الإجابة: ب',
].join('\n');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function open() {
  render(<PasteQuestionsDialog setId={SET_ID} />);
  fireEvent.click(screen.getByRole('button', { name: c.editor.paste }));
  return screen.getByLabelText(c.paste.textLabel);
}

describe('PasteQuestionsDialog', () => {
  it('previews each parsed block and sends them as ONE batch, in order', async () => {
    fireEvent.change(open(), { target: { value: GOOD } });

    const commit = await screen.findByRole('button', { name: 'إضافة سؤالين' });
    // The parsed result, key and all — not an echo of the text.
    expect(screen.getByText('حق المؤلف').closest('li')?.textContent).toContain(c.question.previewRight);
    expect(screen.getByText(c.question.types.tf)).toBeTruthy();

    fireEvent.click(commit);
    await waitFor(() => expect(addPracticeQuestions).toHaveBeenCalledTimes(1));
    expect(addPracticeQuestions).toHaveBeenCalledWith(SET_ID, [
      {
        type: 'mcq',
        stem: 'أي من الآتي من حقوق الملكية الفكرية؟',
        options: ['حق المؤلف', 'حق الانتخاب'],
        answer: 0,
        explanation: 'حق المؤلف بيحمي العمل الأصلي.',
      },
      { type: 'tf', stem: 'براءة الاختراع بتحمي الفكرة للأبد.', options: [], answer: 1, explanation: '' },
    ]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('names the broken paragraph and sends nothing while any block is broken', async () => {
    fireEvent.change(open(), { target: { value: `${GOOD}\n\nسؤال من غير إجابة\nأ) واحد\nب) اتنين` } });

    expect(await screen.findByText('فقرة 3')).toBeTruthy();
    const alert = screen.getAllByRole('alert').find((node) => node.closest('li')?.textContent?.includes('فقرة 3'));
    expect(alert).toBeTruthy();
    expect(screen.getByText(c.paste.blockedByErrors)).toBeTruthy();

    const commit = screen.getByRole('button', { name: 'إضافة سؤالين' });
    expect((commit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(commit);
    expect(addPracticeQuestions).not.toHaveBeenCalled();
  });

  it('keeps the text when the API refuses, so nothing typed is lost', async () => {
    vi.mocked(addPracticeQuestions).mockResolvedValueOnce({ ok: false, message: c.errors.failed });
    const box = open();
    fireEvent.change(box, { target: { value: GOOD } });
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة سؤالين' }));

    await waitFor(() => expect(addPracticeQuestions).toHaveBeenCalled());
    expect((screen.getByLabelText(c.paste.textLabel) as HTMLTextAreaElement).value).toBe(GOOD);
    expect(refresh).not.toHaveBeenCalled();
  });
});
