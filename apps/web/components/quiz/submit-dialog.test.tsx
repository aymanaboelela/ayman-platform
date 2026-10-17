import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { SubmitDialog } from './submit-dialog';
import type { SubmitDialogQuestion } from './submit-confirm-dialog';
import { apiGet } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiGet: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A five-question paper: 2 and 4 blank, 3 flagged (answered), 4 flagged too. */
const PAPER: SubmitDialogQuestion[] = [
  { slotPosition: 0, number: 1, answered: true, flagged: false },
  { slotPosition: 1, number: 2, answered: false, flagged: false },
  { slotPosition: 2, number: 3, answered: true, flagged: true },
  { slotPosition: 3, number: 4, answered: false, flagged: true },
  { slotPosition: 4, number: 5, answered: true, flagged: false },
];

function renderDialog(overrides: Partial<Parameters<typeof SubmitDialog>[0]> = {}) {
  return render(
    <SubmitDialog
      open
      onOpenChange={() => {}}
      attemptId="att-1"
      questions={[]}
      serverTime={new Date().toISOString()}
      onJump={() => {}}
      onConfirm={async () => {}}
      {...overrides}
    />,
  );
}

/**
 * `name` is matched as a PREFIX, not for equality, and that is about jsdom
 * rather than about the button.
 *
 * The confirm control renders both of its labels — «أيوه، نسلّم» and
 * «بيتسلّم…» — stacked in one grid cell, with the inactive one carrying
 * Tailwind's `invisible`. In a browser that is `visibility: hidden`, which
 * takes the spare label out of the accessibility tree, so the accessible name
 * really is just the active label. jsdom never runs Tailwind, so it computes
 * the name as both labels joined — and asserting equality would be asserting
 * a jsdom artefact. The real accessible name is covered in Playwright.
 */
function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', {
    name: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  }) as HTMLButtonElement;
}

describe('SubmitDialog — I11 (a failed preflight must not wedge the dialog)', () => {
  it('surfaces a retry and keeps confirm enabled when the preflight fetch fails', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network'));
    renderDialog();

    // The error state is reachable, with a retry affordance...
    expect(await screen.findByRole('button', { name: quizExperience.submit.countRetry })).toBeTruthy();
    expect(screen.getByText(quizExperience.submit.countFailed)).toBeTruthy();
    // ...and confirm is NOT dead: the count is advisory, the server recounts
    // on submit, so the student can still push through a transient blip.
    expect(button(copy.quiz.submitConfirmAction).disabled).toBe(false);
  });

  it('recovers on retry: a successful second preflight replaces the error with the count', async () => {
    mockApiGet.mockRejectedValueOnce(new Error('network'));
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 0, total: 3 });
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: quizExperience.submit.countRetry }));

    await waitFor(() => {
      expect(screen.getByText(copy.quiz.submitConfirmAllAnswered)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: quizExperience.submit.countRetry })).toBeNull();
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('while the preflight is still in flight, confirm stays disabled (no premature submit)', () => {
    mockApiGet.mockReturnValueOnce(new Promise(() => {}));
    renderDialog();

    expect(screen.getByText(quizExperience.submit.counting)).toBeTruthy();
    expect(button(copy.quiz.submitConfirmAction).disabled).toBe(true);
  });
});

describe('SubmitDialog — what it says about the paper', () => {
  it.each([
    [1, 'لسه فيه سؤال واحد من غير إجابة'],
    [2, 'لسه فيه سؤالين من غير إجابة'],
    [3, 'لسه فيه 3 أسئلة من غير إجابة'],
    [11, 'لسه فيه 11 سؤال من غير إجابة'],
  ])('says %i blank questions with the noun agreeing', async (count, sentence) => {
    mockApiGet.mockResolvedValueOnce({ unansweredCount: count, total: 20 });
    renderDialog();
    expect(await screen.findByText(sentence)).toBeTruthy();
    expect(screen.getByText(quizExperience.submit.unansweredAsk)).toBeTruthy();
  });

  it('lists each blank question, and the flagged answered ones as their own row', async () => {
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 2, total: 5 });
    renderDialog({ questions: PAPER });
    await screen.findByText('لسه فيه سؤالين من غير إجابة');

    // Blank: 2 and 4 (4 also flagged — it is still blank first).
    expect(screen.getByRole('button', { name: 'سؤال 2 — من غير إجابة' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'سؤال 4 — من غير إجابة' })).toBeTruthy();
    // Flagged and answered: only 3.
    expect(screen.getByRole('button', { name: 'سؤال 3 — عليه علامة مراجعة' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^سؤال 1/ })).toBeNull();
    expect(screen.getByText(quizExperience.submit.groupFlagged)).toBeTruthy();
  });

  it('hides the blank row once the SERVER says nothing is blank, but keeps the flags', async () => {
    // Local state can lag a save; the server's count is the authority.
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 0, total: 5 });
    renderDialog({ questions: PAPER });
    await screen.findByText(copy.quiz.submitConfirmAllAnswered);

    expect(screen.queryByRole('button', { name: /من غير إجابة/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'سؤال 3 — عليه علامة مراجعة' })).toBeTruthy();
  });

  it('closes the dialog when a question chip is pressed', async () => {
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 2, total: 5 });
    const onOpenChange = vi.fn();
    renderDialog({ questions: PAPER, onOpenChange });
    await screen.findByText('لسه فيه سؤالين من غير إجابة');

    fireEvent.click(screen.getByRole('button', { name: 'سؤال 4 — من غير إجابة' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('focuses «الرجوع للأسئلة» on open — changing one’s mind costs nothing', async () => {
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 0, total: 5 });
    renderDialog();
    await screen.findByText(copy.quiz.submitConfirmAllAnswered);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: copy.quiz.submitCancel }));
  });

  it('says the time left in minutes on a timed paper', async () => {
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 0, total: 5 });
    const now = Date.now();
    renderDialog({
      deadlineAt: new Date(now + 12 * 60_000 + 20_000).toISOString(),
      serverTime: new Date(now).toISOString(),
    });
    expect(await screen.findByText('فاضل 12 دقيقة')).toBeTruthy();
    expect(screen.getByText(new RegExp(quizExperience.submit.timeEnough))).toBeTruthy();
  });

  it('shows the pending label while the submission is in flight', async () => {
    mockApiGet.mockResolvedValueOnce({ unansweredCount: 0, total: 5 });
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    renderDialog({ onConfirm });
    await screen.findByText(copy.quiz.submitConfirmAllAnswered);

    const confirm = button(copy.quiz.submitConfirmAction);
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm.disabled).toBe(true));
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(within(confirm).getByText(copy.quiz.submitting)).toBeTruthy();

    release();
    await waitFor(() => expect(confirm.disabled).toBe(false));
  });
});
