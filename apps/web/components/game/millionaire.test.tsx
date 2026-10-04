import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import type { GameRound } from '@ayman/contracts/quiz/game';
import type { GameSound } from './use-game-sound';

const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({ apiPost: (...args: unknown[]) => apiPost(...args) }));

/** القراية «شغّالة» طول التست — نفس اللحظة اللي المالك كان بيدوس فيها. */
const speech = { enabled: true, supported: true, stuck: false, read: vi.fn(), stop: vi.fn(), toggle: vi.fn() };
vi.mock('./use-speech', () => ({ useSpeech: () => speech }));

const { Millionaire } = await import('./millionaire');

const c = copy.game;

const sound: GameSound = {
  enabled: false,
  play: vi.fn(),
  show: vi.fn(),
  unlock: vi.fn(),
  toggle: vi.fn(),
};

const round: GameRound = {
  mode: 'millionaire',
  level: 'medium',
  poolSize: 15,
  sessionId: '01990000-0000-7000-8000-00000000a001',
  practice: false,
  questions: [
    {
      id: '01990000-0000-7000-8000-00000000b001',
      type: 'mcq_single',
      stemHtml: '<p>كام بايت في الكيلوبايت؟</p>',
      level: 'easy',
      options: [
        { id: '01990000-0000-7000-8000-00000000c001', bodyHtml: '<p>1024</p>' },
        { id: '01990000-0000-7000-8000-00000000c002', bodyHtml: '<p>1000</p>' },
        { id: '01990000-0000-7000-8000-00000000c003', bodyHtml: '<p>8</p>' },
      ],
    },
    {
      id: '01990000-0000-7000-8000-00000000b002',
      type: 'true_false',
      stemHtml: '<p>الـRAM ذاكرة دائمة</p>',
      level: 'medium',
      options: [
        { id: '01990000-0000-7000-8000-00000000c004', bodyHtml: '<p>صح</p>' },
        { id: '01990000-0000-7000-8000-00000000c005', bodyHtml: '<p>غلط</p>' },
      ],
    },
  ],
};

const RIGHT = { correct: true, rightOptionIds: ['01990000-0000-7000-8000-00000000c001'] };

function option(text: string): HTMLElement {
  return screen.getAllByRole('button').find((button) => button.textContent?.includes(text))!;
}

function answerCalls() {
  return apiPost.mock.calls.filter(([path]) => path === '/api/me/game/answer');
}

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

beforeEach(() => {
  // jsdom مالوش `scrollIntoView` — الشاشة بتنزل لـ«إجابة نهائية؟» بيه.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  apiPost.mockReset();
  speech.read.mockReset();
});

/**
 * «أوقات بضغط ومش بتشتغل خالص، لازم أقعد أضغط كتير».
 *
 * الدوسة كانت بتوصل؛ اللي كان بيضيع هو «أيوه، نهائية»: طلب الإجابة يتأخر أو
 * يقع (السيرفر كان بيعيد حساب بنك الطالب كله مع كل إجابة)، و`check` يبلعه —
 * السؤال يرجع مفتوح من غير كلمة، والإجابة لسه دهبي، والتأكيد اختفى، والتايمر
 * يتخصم منه. والدوسة التانية على الإجابة الدهبي ماكانتش بتعمل حاجة.
 */
describe('Millionaire — a press is never swallowed', () => {
  it('locks an answer pressed while the question is still being read aloud', async () => {
    render(<Millionaire round={round} refetch={vi.fn()} onExit={vi.fn()} sound={sound} voice={false} />);
    await wait(1100);
    expect(speech.read).toHaveBeenCalledTimes(1);

    fireEvent.click(option('1024'));

    expect(screen.getByRole('dialog', { name: c.mlnFinal })).toBeInTheDocument();
  });

  it('takes a second press on the chosen answer as the final answer, for this recorded round', async () => {
    apiPost.mockResolvedValue(RIGHT);
    render(<Millionaire round={round} refetch={vi.fn()} onExit={vi.fn()} sound={sound} voice={false} />);

    fireEvent.click(option('1024'));
    fireEvent.click(option('1024'));
    await wait(0);

    expect(answerCalls()).toHaveLength(1);
    expect(answerCalls()[0]![2]).toEqual({
      questionId: round.questions[0]!.id,
      optionId: '01990000-0000-7000-8000-00000000c001',
      sessionId: round.sessionId,
    });
  });

  it('keeps a failed answer locked with the question still open, says why, and sends it again on the next press', async () => {
    // الطلب بيقع بعد ثانية ونص — وقت كفاية إن التايمر القديم كان يتخصم منه.
    apiPost.mockImplementationOnce(
      () => new Promise((_, reject) => setTimeout(() => reject(new TypeError('Failed to fetch')), 1500)),
    );
    apiPost.mockResolvedValue(RIGHT);
    const { container } = render(
      <Millionaire round={round} refetch={vi.fn()} onExit={vi.fn()} sound={sound} voice={false} />,
    );
    await wait(50);
    const timerBefore = container.querySelector('.mln-timer')?.textContent;

    fireEvent.click(option('1024'));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.mlnConfirm) }));
    expect(screen.getByRole('status')).toHaveTextContent(c.mlnChecking);
    await wait(1700);

    // التأكيد لسه مفتوح، والسبب مكتوب، والتايمر ماتخصمش منه.
    expect(screen.getByRole('dialog', { name: c.mlnFinal })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(c.mlnSendFailed);
    expect(container.querySelector('.mln-timer')?.textContent).toBe(timerBefore);
    expect(container.querySelector('.mln')?.getAttribute('data-phase')).toBe('locked');

    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.mlnConfirm) }));
    await wait(0);
    expect(answerCalls()).toHaveLength(2);
  });

  it('lets a covered-up answer be changed: the confirm sits under the answers, not over them', () => {
    render(<Millionaire round={round} refetch={vi.fn()} onExit={vi.fn()} sound={sound} voice={false} />);
    fireEvent.click(option('1024'));
    const dialog = screen.getByRole('dialog', { name: c.mlnFinal });
    // الصفحة بتنزل للتأكيد بدل ما يلزق فوق آخر اختيارين (sticky كان بياكل الدوس).
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(dialog.compareDocumentPosition(option('8'))).toBe(Node.DOCUMENT_POSITION_PRECEDING);

    fireEvent.click(option('1000'));
    expect(option('1000').getAttribute('data-state')).toBe('locked');
    expect(option('1024').getAttribute('data-state')).toBeNull();
  });
});
