import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy/admin';
import { defaultGameModes, type GameBankDetail } from '@ayman/contracts/quiz/game';

const saveGameModesAction = vi.fn();
vi.mock('../actions', () => ({ saveGameModesAction: (...args: unknown[]) => saveGameModesAction(...args) }));

const { ModesForm } = await import('./modes-form');

const c = copy.admin.games;
const LESSON = '01990000-0000-7000-8000-0000000e0001';

const detail: GameBankDetail = {
  courseId: '01990000-0000-7000-8000-0000000c0001',
  courseTitle: 'البرمجة',
  general: { categoryId: null, categoryName: null, ready: 0 },
  quizQuestions: 12,
  sections: [
    {
      id: '01990000-0000-7000-8000-0000000d0001',
      title: 'الوحدة الأولى',
      lessons: [
        { id: LESSON, title: 'المحاضرة الأولى', kind: 'video', quizQuestions: 12, categoryId: null, categoryName: null, ready: 6 },
      ],
    },
  ],
  modes: defaultGameModes(),
};

afterEach(() => {
  cleanup();
  saveGameModesAction.mockReset();
});

function card(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).closest('section')!;
}

describe('ModesForm — where each game draws from', () => {
  it('starts on today’s behaviour and has nothing to save', () => {
    render(<ModesForm detail={detail} />);
    for (const title of [c.modeMillionaire, c.modeRace, c.modeSurvival]) {
      const switches = within(card(title)).getAllByRole('switch');
      expect(switches.every((toggle) => toggle.getAttribute('aria-checked') === 'true')).toBe(true);
    }
    expect(screen.getByRole('button', { name: new RegExp(c.save) })).toBeDisabled();
  });

  it('saves all three games together — one source off here, one lesson there', async () => {
    saveGameModesAction.mockImplementation(async (_courseId: string, modes: unknown) => ({ ok: true, modes }));
    render(<ModesForm detail={detail} />);

    fireEvent.click(within(card(c.modeRace)).getAllByRole('switch')[0]!);
    const survival = card(c.modeSurvival);
    fireEvent.click(within(survival).getByRole('radio', { name: c.lessonsSome }));
    fireEvent.click(within(survival).getByRole('checkbox'));
    expect(screen.getByText(c.unsaved)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(c.save) }));
    });

    expect(saveGameModesAction).toHaveBeenCalledWith(detail.courseId, {
      millionaire: { useQuizzes: true, useBank: true, lessonIds: [] },
      race: { useQuizzes: false, useBank: true, lessonIds: [] },
      survival: { useQuizzes: true, useBank: true, lessonIds: [LESSON] },
    });
    expect(screen.getByRole('status')).toHaveTextContent(c.saved);
  });

  it('marks a game closed when both sources are off, and says when a save failed', async () => {
    saveGameModesAction.mockResolvedValue({ ok: false });
    render(<ModesForm detail={detail} />);
    const race = card(c.modeRace);
    for (const toggle of within(race).getAllByRole('switch')) fireEvent.click(toggle);
    expect(within(race).getByText(c.modeOff)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(c.save) }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(c.saveFailed);
  });
});
