import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARENA_RULES, type ArenaMatchView } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { formatCopy } from '@ayman/contracts/format';
import { ArenaBoard } from './arena-board';
import { ArenaMatch, ArenaResult } from './arena-screens';
import { initialState } from './arena-state';
import type { ArenaSound } from './use-arena-sound';

const c = arenaCopy;
const sound: ArenaSound = { enabled: false, play: vi.fn(), unlock: vi.fn(), toggle: vi.fn() };

afterEach(cleanup);

function match(overrides: Partial<ArenaMatchView> = {}): ArenaMatchView {
  return {
    id: 'm1',
    seq: 1,
    courseTitle: 'برمجة',
    cohortLabel: 'تانية · عربي',
    total: 7,
    index: 2,
    stage: 'question',
    you: { player: { name: 'مريم', image: null }, score: 1, state: 'thinking' },
    opponent: { player: { name: 'ملك', image: null }, score: 1, state: 'thinking' },
    question: {
      index: 2,
      id: 'q2',
      type: 'mcq_single',
      stemHtml: '<p>كام بايت في الكيلوبايت؟</p>',
      options: [
        { id: 'o1', bodyHtml: '1024' },
        { id: 'o2', bodyHtml: '1000' },
        { id: 'o3', bodyHtml: '8' },
      ],
    },
    deadline: Date.now() + 10_000,
    questionMs: ARENA_RULES.questionMs,
    paused: null,
    yourPick: null,
    reveal: null,
    history: ['you', 'opponent'],
    end: null,
    ...overrides,
  };
}

function play(view: ArenaMatchView, onAnswer = vi.fn()) {
  render(
    <ArenaMatch
      state={initialState({ phase: 'match', match: view }, Date.now(), Date.now())}
      match={view}
      onAnswer={onAnswer}
      onLeave={vi.fn()}
      sound={sound}
    />,
  );
  return onAnswer;
}

describe('ArenaMatch', () => {
  it('shows the same question with lettered options and sends the pick', () => {
    const onAnswer = play(match());
    expect(screen.getByText('كام بايت في الكيلوبايت؟')).toBeTruthy();
    const options = screen.getAllByRole('button').filter((b) => b.className.includes('ca-option'));
    expect(options).toHaveLength(3);
    fireEvent.click(options[0]!);
    expect(onAnswer).toHaveBeenCalledWith('o1');
  });

  it('locks every option after a wrong answer and says the point is still open for the other', () => {
    play(match({ yourPick: 'o2', you: { player: { name: 'مريم', image: null }, score: 1, state: 'locked' } }));
    const options = screen.getAllByRole('button').filter((b) => b.className.includes('ca-option'));
    expect(options.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(options[1]!.getAttribute('data-state')).toBe('wrong');
    expect(screen.getByText(formatCopy(c.play.youWrong, { name: 'ملك' }))).toBeTruthy();
  });

  it('tells the student the opponent missed and the point is up for grabs', () => {
    play(match({ opponent: { player: { name: 'ملك', image: null }, score: 1, state: 'locked' } }));
    expect(screen.getByText(formatCopy(c.play.opponentWrong, { name: 'ملك' }))).toBeTruthy();
  });

  it('reveals the right option, and who picked what, only after the question closes', () => {
    play(
      match({
        stage: 'reveal',
        opponent: { player: { name: 'ملك', image: null }, score: 2, state: 'thinking' },
        reveal: {
          index: 2,
          correctOptionIds: ['o1'],
          yourOptionId: null,
          opponentOptionId: 'o1',
          winner: 'opponent',
          reason: 'correct',
        },
      }),
    );
    const options = screen.getAllByRole('button').filter((b) => b.className.includes('ca-option'));
    expect(options[0]!.getAttribute('data-state')).toBe('right');
    expect(options[2]!.getAttribute('data-state')).toBe('dim');
    expect(screen.getByText(formatCopy(c.play.opponentRight, { name: 'ملك' }))).toBeTruthy();
  });

  it('puts «النت قطع عند …» over the match while the opponent is gone', () => {
    play(
      match({
        opponent: { player: { name: 'ملك', image: null }, score: 1, state: 'offline' },
        paused: { who: 'opponent', graceUntil: Date.now() + 15_000 },
        deadline: null,
      }),
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(formatCopy(c.play.opponentOfflineTitle, { name: 'ملك' }))).toBeTruthy();
  });

  it('asks before walking out', () => {
    play(match());
    fireEvent.click(screen.getByRole('button', { name: c.play.leave }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(formatCopy(c.play.leaveBody, { name: 'ملك' }))).toBeTruthy();
  });
});

describe('ArenaResult', () => {
  it('celebrates a win with the points earned and the new total', () => {
    const view = match({
      stage: 'ended',
      you: { player: { name: 'مريم', image: null }, score: 4, state: 'thinking' },
      end: { outcome: 'win', reason: 'completed', pointsEarned: 3, capped: false, totalPoints: 21 },
    });
    const { container } = render(<ArenaResult match={view} onAgain={vi.fn()} onLobby={vi.fn()} sound={sound} />);
    expect(screen.getByText(c.result.win)).toBeTruthy();
    expect(screen.getByText(formatCopy(c.result.pointsEarned, { n: 3 }))).toBeTruthy();
    expect(screen.getByText(formatCopy(c.result.total, { n: 21 }))).toBeTruthy();
    expect(container.querySelector('.ca-confetti')).not.toBeNull();
  });

  it('labels a forfeit as one, and says «الماتش اتقطع» after a restart', () => {
    const forfeit = match({
      stage: 'ended',
      end: { outcome: 'win', reason: 'forfeit', pointsEarned: 3, capped: false, totalPoints: 3 },
    });
    render(<ArenaResult match={forfeit} onAgain={vi.fn()} onLobby={vi.fn()} sound={sound} />);
    expect(screen.getByText(c.result.forfeitWin)).toBeTruthy();
    cleanup();
    const aborted = match({ stage: 'ended', end: { outcome: 'none', reason: 'aborted', pointsEarned: 0, capped: false, totalPoints: null } });
    const { container } = render(<ArenaResult match={aborted} onAgain={vi.fn()} onLobby={vi.fn()} sound={sound} />);
    expect(screen.getByText(c.result.aborted)).toBeTruthy();
    expect(container.querySelector('.ca-confetti')).toBeNull();
  });

  it('offers «ماتش تاني»', () => {
    const onAgain = vi.fn();
    const view = match({ stage: 'ended', end: { outcome: 'draw', reason: 'completed', pointsEarned: 1, capped: true, totalPoints: 45 } });
    render(<ArenaResult match={view} onAgain={onAgain} onLobby={vi.fn()} sound={sound} />);
    fireEvent.click(screen.getByRole('button', { name: c.result.again }));
    expect(onAgain).toHaveBeenCalled();
    expect(screen.getByText(c.result.draw)).toBeTruthy();
  });
});

describe('ArenaBoard', () => {
  it('puts the top three on the podium and the rest in a ladder, with the student marked', () => {
    const { container } = render(
      <ArenaBoard
        board={{
          cohortLabel: 'تانية · عربي',
          rows: [
            { rank: 1, name: 'آية', image: null, points: 30, wins: 10, played: 12, isMe: false },
            { rank: 2, name: 'جنى', image: null, points: 21, wins: 7, played: 9, isMe: true },
            { rank: 3, name: 'لارا', image: null, points: 9, wins: 3, played: 8, isMe: false },
            { rank: 4, name: 'نور', image: null, points: 3, wins: 1, played: 4, isMe: false },
          ],
          me: null,
        }}
      />,
    );
    expect(container.querySelectorAll('.rk-podium__slot[data-place]')).toHaveLength(3);
    expect(container.querySelectorAll('.ca-ladder__row')).toHaveLength(1);
    expect(screen.getByText(c.board.me)).toBeTruthy();
  });

  it('shows the dragons on his stack — the suite runs as it', () => {
    const { container } = render(
      <ArenaBoard
        board={{ cohortLabel: '', rows: [{ rank: 1, name: 'آية', image: null, points: 3, wins: 1, played: 1, isMe: false }], me: null }}
      />,
    );
    expect(container.querySelector('.rk-dragon')).not.toBeNull();
  });
});
