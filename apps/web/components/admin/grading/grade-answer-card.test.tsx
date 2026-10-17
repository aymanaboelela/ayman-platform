import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminGrading } from '@ayman/contracts/copy/admin-grading';
import { GradeAnswerCard, type GradingQuestion } from './grade-answer-card';
import { gradeAnswerAction } from '@/app/(admin)/admin/grading/actions';

vi.mock('@/app/(admin)/admin/grading/actions', () => ({ gradeAnswerAction: vi.fn() }));

const mockGrade = vi.mocked(gradeAnswerAction);
const g = adminGrading;

beforeEach(() => {
  mockGrade.mockResolvedValue({ ok: true, scaledScore: 50 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A single-answer question, two marks, «أ» right — the student picked «ب». */
function choiceQuestion(overrides: Partial<GradingQuestion> = {}): GradingQuestion {
  return {
    attemptQuestionId: '11111111-1111-4111-8111-111111111111',
    slotPosition: 2,
    type: 'mcq_single',
    questionHtml: '<p>أسرع ذاكرة؟</p>',
    responseText: 'RAM',
    response: { kind: 'choice', optionIds: ['opt-b'] },
    chosenOptionIds: ['opt-b'],
    rightAnswerText: 'Cache',
    rightOptionIds: ['opt-a'],
    options: [
      { id: 'opt-a', bodyHtml: '<p>Cache</p>', position: 0, isRight: true },
      { id: 'opt-b', bodyHtml: '<p>RAM</p>', position: 1, isRight: false },
      { id: 'opt-c', bodyHtml: '<p>Disk</p>', position: 2, isRight: false },
    ],
    correctness: 'graded_wrong',
    maxMark: 2,
    mark: 0,
    feedbackHtml: null,
    ...overrides,
  };
}

function renderCard(question: GradingQuestion, onGraded = vi.fn()) {
  render(<GradeAnswerCard attemptId="22222222-2222-4222-8222-222222222222" question={question} onGraded={onGraded} />);
  return { onGraded };
}

describe('GradeAnswerCard — nothing changes by accident', () => {
  it('shows the options read-only: no control to change the answer until asked for', () => {
    renderCard(choiceQuestion());

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    // The marks are words as well as colour, and the letters are the paper's.
    expect(screen.getByText(g.studentChoice)).toBeTruthy();
    expect(screen.getByText(g.rightOption)).toBeTruthy();
    expect(screen.getByText('ب')).toBeTruthy();
    // Clicking an option row does nothing at all.
    fireEvent.click(screen.getByText('Disk'));
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('reads the verdict off the raw row state', () => {
    renderCard(choiceQuestion({ correctness: 'graded_right', chosenOptionIds: ['opt-a'], mark: 2 }));
    expect(screen.getByText(g.correctness.correct)).toBeTruthy();
  });

  it('saves a mark without touching the answer — and without asking, when nothing stored changes', async () => {
    renderCard(choiceQuestion());

    fireEvent.click(screen.getByRole('button', { name: g.save }));

    await waitFor(() => expect(mockGrade).toHaveBeenCalledTimes(1));
    const [, , payload] = mockGrade.mock.calls[0]!;
    expect(payload).not.toHaveProperty('response');
    expect(payload.mark).toBe(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps an unanswered question unanswered when it is marked', async () => {
    renderCard(choiceQuestion({ chosenOptionIds: [], response: null, mark: null, correctness: 'needs_grading' }));
    expect(screen.getByText(g.unanswered)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/الدرجة/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: g.save }));

    // A first mark on an unmarked answer is the screen's ordinary job — no
    // confirmation — and the payload carries no `response` at all.
    await waitFor(() => expect(mockGrade).toHaveBeenCalledTimes(1));
    expect(mockGrade.mock.calls[0]![2]).toEqual({ mark: 1, feedbackHtml: undefined });
  });

  it('asks before overwriting a stored mark, old beside new', async () => {
    renderCard(choiceQuestion({ correctness: 'graded_right', chosenOptionIds: ['opt-a'], mark: 2 }));

    fireEvent.change(screen.getByLabelText(/الدرجة/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: g.save }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(g.confirmTitle)).toBeTruthy();
    expect(within(dialog).getByText('من 2 من 2 لـ 1 من 2')).toBeTruthy();
    expect(mockGrade).not.toHaveBeenCalled();

    // «رجوع» writes nothing.
    fireEvent.click(within(dialog).getByRole('button', { name: g.confirmCancel }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockGrade).not.toHaveBeenCalled();
  });

  it('changes the recorded answer only through «تعديل», a confirmation, and only then sends it', async () => {
    const { onGraded } = renderCard(choiceQuestion());

    fireEvent.click(screen.getByRole('button', { name: g.editAnswer }));
    expect(screen.getByText(g.editHint)).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);

    // Picking the right option suggests its mark, and says so.
    fireEvent.click(radios[0]!);
    expect(screen.getByText(g.markSuggested)).toBeTruthy();
    expect((screen.getByLabelText(/الدرجة/) as HTMLInputElement).value).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: g.save }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('من ب لـ أ')).toBeTruthy();
    expect(within(dialog).getByText('من 0 من 2 لـ 2 من 2')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: g.confirmAction }));

    await waitFor(() => expect(mockGrade).toHaveBeenCalledTimes(1));
    expect(mockGrade.mock.calls[0]![2]).toEqual({
      mark: 2,
      feedbackHtml: undefined,
      response: { kind: 'choice', optionIds: ['opt-a'] },
    });
    await waitFor(() => expect(onGraded).toHaveBeenCalledWith(50));
    // Back to read-only, now showing the corrected answer as the student's.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('says a mark the new answer leaves alone is unchanged, rather than striking it through', async () => {
    renderCard(choiceQuestion());

    fireEvent.click(screen.getByRole('button', { name: g.editAnswer }));
    fireEvent.click(screen.getAllByRole('radio')[2]!); // «ج», wrong like «ب»: still 0
    fireEvent.click(screen.getByRole('button', { name: g.save }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('من ب لـ ج')).toBeTruthy();
    expect(within(dialog).getByText('من غير تغيير: 0 من 2')).toBeTruthy();
    expect(within(dialog).queryByText('من 0 من 2 لـ 0 من 2')).toBeNull();
  });

  it('does not send `response` when the edit ends where it started', async () => {
    renderCard(choiceQuestion());

    fireEvent.click(screen.getByRole('button', { name: g.editAnswer }));
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[0]!);
    fireEvent.click(radios[1]!); // back to the stored «ب»
    fireEvent.click(screen.getByRole('button', { name: g.save }));

    await waitFor(() => expect(mockGrade).toHaveBeenCalledTimes(1));
    expect(mockGrade.mock.calls[0]![2]).not.toHaveProperty('response');
  });

  it('«إلغاء التعديل» puts back the stored answer and the stored mark', () => {
    renderCard(choiceQuestion());

    fireEvent.click(screen.getByRole('button', { name: g.editAnswer }));
    fireEvent.click(screen.getAllByRole('radio')[0]!);
    fireEvent.click(screen.getByRole('button', { name: g.cancelEdit }));

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect((screen.getByLabelText(/الدرجة/) as HTMLInputElement).value).toBe('0');
  });
});
