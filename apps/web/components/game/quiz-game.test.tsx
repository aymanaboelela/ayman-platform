import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import type { GameRound } from '@ayman/contracts/quiz/game';
import type { GameSound } from './use-game-sound';

const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({ apiPost: (...args: unknown[]) => apiPost(...args) }));
vi.mock('./finish-round', () => ({ finishRound: vi.fn() }));

const { QuizGame } = await import('./quiz-game');

const c = copy.game;

const sound: GameSound = {
  enabled: false,
  play: vi.fn(),
  show: vi.fn(),
  unlock: vi.fn(),
  toggle: vi.fn(),
};

const RIGHT_ID = '01990000-0000-7000-8000-00000000c001';
const WRONG_ID = '01990000-0000-7000-8000-00000000c002';

function round(practice: boolean): GameRound {
  return {
    mode: 'race',
    level: 'medium',
    poolSize: 2,
    sessionId: '01990000-0000-7000-8000-00000000a001',
    practice,
    questions: [
      {
        id: '01990000-0000-7000-8000-00000000b001',
        type: 'mcq_single',
        stemHtml: '<p>range(3) بتطلّع كام رقم؟</p>',
        level: 'easy',
        options: [
          { id: RIGHT_ID, bodyHtml: '<p>تلاتة</p>' },
          { id: WRONG_ID, bodyHtml: '<p>اتنين</p>' },
        ],
      },
      {
        id: '01990000-0000-7000-8000-00000000b002',
        type: 'true_false',
        stemHtml: '<p>السؤال التاني</p>',
        level: 'medium',
        options: [
          { id: '01990000-0000-7000-8000-00000000c004', bodyHtml: '<p>صح</p>' },
          { id: '01990000-0000-7000-8000-00000000c005', bodyHtml: '<p>غلط</p>' },
        ],
      },
    ],
  };
}

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

async function pastCountdown() {
  // ٣، ٢، ١ — ٨٠٠ مللي لكل رقم، وكل رقم تايمر لوحده بعد ما اللي قبله يترسم.
  for (let i = 0; i < 4; i++) await wait(850);
}

afterEach(() => {
  cleanup();
  apiPost.mockReset();
});

describe('QuizGame — the right answer and its explanation after a miss', () => {
  it('shows the right option and the teacher’s explanation, and waits for «اللي بعده» instead of moving on', async () => {
    apiPost.mockResolvedValue({ correct: false, rightOptionIds: [RIGHT_ID], explanationHtml: '<p>0 و1 و2.</p>' });
    render(<QuizGame round={round(false)} refetch={vi.fn()} onExit={vi.fn()} sound={sound} />);
    await pastCountdown();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /اتنين/ }));
    });
    expect(screen.getByText(c.rightAnswer)).toBeInTheDocument();
    expect(screen.getByText('0 و1 و2.')).toBeInTheDocument();

    // لو كانت بتعدّي لوحدها كانت هتروح للسؤال التاني بعد ٢.٢ ثانية.
    for (let i = 0; i < 3; i++) await wait(900);
    expect(screen.getByText('0 و1 و2.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.next) }));
    expect(screen.getByText('السؤال التاني')).toBeInTheDocument();
  }, 15_000);

  it('runs a practice round with no timer and no hearts, and a miss costs nothing', async () => {
    apiPost.mockResolvedValue({ correct: false, rightOptionIds: [RIGHT_ID], explanationHtml: null });
    const { container } = render(<QuizGame round={round(true)} refetch={vi.fn()} onExit={vi.fn()} sound={sound} />);
    await pastCountdown();

    expect(container.querySelector('.gm-timer')).toBeNull();
    expect(container.querySelector('.gm-heart')).toBeNull();
    expect(screen.getByText(c.practiceBadge)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /اتنين/ }));
    });
    // من غير شرح: الصح بس.
    expect(screen.getByText(c.rightAnswer)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.next) }));
    // غلطة في التدريب ماخلّصتش الجولة.
    expect(screen.getByText('السؤال التاني')).toBeInTheDocument();
  }, 15_000);
});
