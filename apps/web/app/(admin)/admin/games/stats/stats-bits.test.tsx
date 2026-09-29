import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import type { GameSessionRow } from '@ayman/contracts/quiz/game-stats';
import { HardestList, ModeCard, PlayerList, SessionsTable } from './stats-bits';
import { Crown } from 'lucide-react';

const c = copy.admin.games;

afterEach(() => {
  cleanup();
});

const session: GameSessionRow = {
  id: 's1',
  userId: 'nanoid-student-1',
  name: 'مريم عبد الرحمن',
  mode: 'millionaire',
  level: 'medium',
  courseTitle: 'البرمجة',
  scopeTitle: 'المحاضرة الأولى',
  startedAt: '2026-09-29T18:00:00.000Z',
  durationSeconds: 420,
  questionCount: 15,
  answered: 9,
  correct: 8,
  score: 16_000,
  outcome: 'lost',
};

describe('game stats — who plays, and how long', () => {
  it('links every top player to their student page', () => {
    render(
      <PlayerList
        title={c.topPlays}
        metric="plays"
        tone="var(--viz-1)"
        rows={[{ userId: 'nanoid-student-1', name: 'مريم عبد الرحمن', plays: 12, seconds: 3600, bestScore: 64_000, lastPlayedAt: null }]}
      />,
    );
    const link = screen.getByRole('link', { name: 'مريم عبد الرحمن' });
    expect(link).toHaveAttribute('href', '/admin/students/nanoid-student-1');
    expect(screen.getByText('١٢')).toBeInTheDocument();
  });

  it('shows the best score in Latin digits, isolated inside the Arabic line', () => {
    render(
      <PlayerList
        title={c.topScore}
        metric="score"
        tone="var(--viz-3)"
        rows={[{ userId: 'u', name: 'سلمى', plays: 1, seconds: 60, bestScore: 1_000_000, lastPlayedAt: null }]}
      />,
    );
    expect(screen.getByText('1,000,000')).toHaveClass('[unicode-bidi:isolate]');
  });

  it('lists each recent round with its game, scope, time, result and outcome', () => {
    render(<SessionsTable rows={[session, { ...session, id: 's2', outcome: null, scopeTitle: null, courseTitle: null }]} />);
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent(c.modeMillionaire);
    expect(rows[1]).toHaveTextContent('المحاضرة الأولى');
    expect(rows[1]).toHaveTextContent(c.outcomeLost);
    // جولة من غير نطاق ولا كورس = «كل الكورسات»، وجولة ماخلصتش «ناقصة».
    expect(rows[2]).toHaveTextContent(c.allCoursesRound);
    expect(rows[2]).toHaveTextContent(c.outcomeOpen);
  });

  it('says so when nobody played', () => {
    render(<SessionsTable rows={[]} />);
    expect(screen.getByText(c.noPlays)).toBeInTheDocument();
  });

  it('opens the hardest question in the bank', () => {
    render(
      <HardestList rows={[{ questionId: 'v1', bankEntryId: 'b1', stem: 'كام بايت في الكيلوبايت؟', answers: 40, correct: 6, rate: 0.15 }]} />,
    );
    expect(screen.getByRole('link', { name: new RegExp(c.editQuestion) })).toHaveAttribute('href', '/admin/questions/b1');
    expect(screen.getByText('كام بايت في الكيلوبايت؟')).toBeInTheDocument();
  });

  it('draws a game card with its plays, players and levels', () => {
    render(
      <ModeCard
        icon={Crown}
        tone="var(--viz-3)"
        row={{ mode: 'millionaire', plays: 30, players: 12, seconds: 7200, correctRate: 0.62, bestScore: 125_000, levels: { easy: 10, medium: 15, hard: 5 } }}
      />,
    );
    expect(screen.getByRole('heading', { name: c.modeMillionaire })).toBeInTheDocument();
    expect(screen.getByText('٣٠')).toBeInTheDocument();
    expect(screen.getByText('125,000')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${c.levelHard} ٥`))).toBeInTheDocument();
  });
});
