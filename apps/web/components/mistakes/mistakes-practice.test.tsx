import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MistakeAnswerResult, MistakeEntry } from '@ayman/contracts/mistakes';
import { mistakesCopy } from '@ayman/contracts/copy/mistakes';

const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({ apiPost: (...args: unknown[]) => apiPost(...args) }));

const { MistakesPractice } = await import('./mistakes-practice');

const c = mistakesCopy.practice;

const entry: MistakeEntry = {
  questionVersionId: '01990000-0000-7000-8000-00000000c001',
  type: 'mcq_single',
  stemHtml: '<p>كام بايت في الكيلوبايت؟</p>',
  options: [
    { id: '01990000-0000-7000-8000-00000000d001', bodyHtml: '<p>1024</p>' },
    { id: '01990000-0000-7000-8000-00000000d002', bodyHtml: '<p>1000</p>' },
  ],
  courseTitle: 'كورس الاختبار',
  courseSlug: 'test',
  lessonTitle: 'اختبار',
  missedAt: new Date().toISOString(),
  timesMissed: 1,
  streakRight: 0,
  source: 'quiz',
};

function option(text: string): HTMLElement {
  return screen.getAllByRole('button').find((button) => button.textContent?.includes(text))!;
}

afterEach(() => {
  cleanup();
  apiPost.mockReset();
});

/**
 * نفس درس `quiz-game.tsx`: الضغطة الأولانية لازم توّري أثرها فورًا، قبل رد
 * السيرفر — من غيره الزرار بيفضل شكله زي قبل الضغط لحد الرد، والطالب بيدوس
 * تاني ظنًا إنها ماخدتش.
 */
describe('MistakesPractice — the first press shows up immediately', () => {
  it('marks the pressed option "pending" before the server answers, and disables the rest', async () => {
    let resolve!: (value: MistakeAnswerResult) => void;
    apiPost.mockReturnValue(new Promise((r) => { resolve = r; }));

    render(<MistakesPractice queue={[entry]} onAnswered={vi.fn()} onExit={vi.fn()} />);
    fireEvent.click(option('1024'));

    expect(option('1024').getAttribute('data-state')).toBe('pending');
    expect(option('1000')).toBeDisabled();

    await act(async () => {
      resolve({ correct: true, rightOptionIds: [entry.options[0]!.id], streakRight: 1, mastered: false });
      await Promise.resolve();
    });
  });

  it('shows right/wrong and calls onAnswered with the server result', async () => {
    const result: MistakeAnswerResult = {
      correct: false,
      rightOptionIds: [entry.options[0]!.id],
      streakRight: 0,
      mastered: false,
    };
    apiPost.mockResolvedValue(result);
    const onAnswered = vi.fn();

    render(<MistakesPractice queue={[entry]} onAnswered={onAnswered} onExit={vi.fn()} />);
    await act(async () => {
      fireEvent.click(option('1000'));
      await Promise.resolve();
    });

    expect(option('1024').getAttribute('data-state')).toBe('right');
    expect(option('1000').getAttribute('data-state')).toBe('wrong');
    expect(screen.getByText(c.wrong)).toBeInTheDocument();
    expect(onAnswered).toHaveBeenCalledWith(entry, result);
  });

  it('shows a mastered badge and a finishing summary once the queue is done', async () => {
    apiPost.mockResolvedValue({
      correct: true,
      rightOptionIds: [entry.options[0]!.id],
      streakRight: 2,
      mastered: true,
    });

    render(<MistakesPractice queue={[entry]} onAnswered={vi.fn()} onExit={vi.fn()} />);
    await act(async () => {
      fireEvent.click(option('1024'));
      await Promise.resolve();
    });

    expect(screen.getByText(c.mastered)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: c.next }));

    expect(screen.getByText(c.done)).toBeInTheDocument();
  });
});
