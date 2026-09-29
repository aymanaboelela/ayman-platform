import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { GameHubSchema, defaultGameModes, type GameHub } from '@ayman/contracts/quiz/game';

const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({ apiPost: (...args: unknown[]) => apiPost(...args) }));
vi.mock('./millionaire', () => ({ Millionaire: () => <p>millionaire-stage</p> }));
vi.mock('./quiz-game', () => ({
  Backdrop: () => null,
  QuizGame: () => <p>race-stage</p>,
  SoundToggle: () => null,
}));
vi.mock('./use-game-sound', () => ({
  useGameSound: () => ({ enabled: false, play: vi.fn(), show: vi.fn(), unlock: vi.fn(), toggle: vi.fn() }),
}));

const { GamesHub, restoreChoice } = await import('./games-hub');

const c = copy.game;

const COURSE = '01990000-0000-7000-8000-0000000c0001';
const OTHER = '01990000-0000-7000-8000-0000000c0002';
const UNIT_1 = '01990000-0000-7000-8000-0000000d0001';
const UNIT_2 = '01990000-0000-7000-8000-0000000d0002';
const LESSON_1 = '01990000-0000-7000-8000-0000000e0001';
const LESSON_2 = '01990000-0000-7000-8000-0000000e0002';

/** كورس فيه درسين: الأول ١٨ سؤال (يكفي المليون)، والتاني ٨ (مايكفيش). */
function hub(overrides: Partial<GameHub> = {}): GameHub {
  return GameHubSchema.parse({
    total: 29,
    voice: false,
    courses: [
      {
        id: COURSE,
        title: 'البرمجة — تانية ثانوي',
        counts: { easy: 4, medium: 20, hard: 2 },
        sections: [
          { id: UNIT_1, title: 'الوحدة الأولى' },
          { id: UNIT_2, title: 'الوحدة التانية' },
        ],
        lessons: [
          { id: LESSON_1, title: 'المحاضرة الأولى', sectionId: UNIT_1 },
          { id: LESSON_2, title: 'المحاضرة التانية', sectionId: UNIT_2 },
        ],
        buckets: [
          { source: 'bank', lessonId: LESSON_1, sectionId: UNIT_1, counts: { easy: 2, medium: 14, hard: 2 } },
          { source: 'quiz', lessonId: LESSON_2, sectionId: UNIT_2, counts: { easy: 2, medium: 6, hard: 0 } },
        ],
        modes: defaultGameModes(),
      },
      {
        id: OTHER,
        title: 'كورس تاني',
        counts: { easy: 0, medium: 3, hard: 0 },
        buckets: [{ source: 'bank', lessonId: null, sectionId: null, counts: { easy: 0, medium: 3, hard: 0 } }],
      },
    ],
    ...overrides,
  });
}

/** jsdom هنا بيدّي `localStorage` من غير methods شغّالة — نفس الشيم بتاع `book-order-panel.test.tsx`. */
beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  apiPost.mockReset();
});

function pickCourse(title: string) {
  fireEvent.click(screen.getByLabelText(new RegExp(title)));
}

describe('GamesHub — what to play on', () => {
  it('offers the units and lessons that have questions, with counts, and greys the one too small for the game', () => {
    render(<GamesHub hub={hub()} />);
    pickCourse('البرمجة');

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(c.scopeLesson) }));
    const lessons = screen.getByRole('radiogroup', { name: c.scopeLessonPick });
    const first = within(lessons).getByText('المحاضرة الأولى').closest('label')!;
    const second = within(lessons).getByText('المحاضرة التانية').closest('label')!;
    expect(first).toHaveTextContent('18');
    expect(first).not.toHaveAttribute('data-short');
    // المليون محتاج ١٥ — درس فيه ٨ رمادي، ومعاه السبب.
    expect(second).toHaveAttribute('data-short');
    expect(second).toHaveTextContent(formatCopy(c.needsAtLeast, { n: 15 }));
    // الأول اتختار لوحده لأنه أول واحد يكفي.
    expect(within(first).getByRole('radio')).toBeChecked();
  });

  it('draws the round on the server with the scope the student picked', async () => {
    apiPost.mockResolvedValue({ mode: 'millionaire', level: 'medium', questions: [], poolSize: 0, sessionId: null });
    render(<GamesHub hub={hub()} />);
    pickCourse('البرمجة');
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(c.scopeUnit) }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(c.play) }));
    });

    expect(apiPost).toHaveBeenCalledWith('/api/me/game/rounds', expect.anything(), {
      mode: 'millionaire',
      level: 'medium',
      courseId: COURSE,
      scope: 'section',
      scopeId: UNIT_1,
    });
  });

  it('will not start a game the chosen questions cannot fill, and says why', () => {
    render(<GamesHub hub={hub()} />);
    pickCourse('كورس تاني');
    // ٣ أسئلة والمليون محتاج ١٥.
    expect(screen.getByRole('button', { name: new RegExp(c.play) })).toBeDisabled();
    expect(screen.getByText(/أقل من اللي/)).toBeInTheDocument();
  });

  it('says a game is closed on a course whose teacher turned both sources off', () => {
    const closed = hub();
    closed.courses[0]!.modes.millionaire = { useQuizzes: false, useBank: false, lessonIds: [] };
    render(<GamesHub hub={closed} />);
    pickCourse('البرمجة');
    expect(screen.getAllByText(c.modeClosed).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: new RegExp(c.play) })).toBeDisabled();
  });

  it('remembers the last choice on this device', () => {
    render(<GamesHub hub={hub()} />);
    pickCourse('البرمجة');
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(c.scopeLesson) }));
    const saved = JSON.parse(localStorage.getItem('game:last:v1') ?? '{}');
    expect(saved).toMatchObject({ courseId: COURSE, scope: 'lesson', scopeId: LESSON_1 });
  });
});

describe('restoreChoice', () => {
  const fallback = { mode: 'millionaire' as const, courseId: null, scope: 'all' as const, scopeId: null, level: 'medium' as const };

  it('brings a saved lesson back when it is still there', () => {
    expect(
      restoreChoice(hub(), { mode: 'race', level: 'hard', courseId: COURSE, scope: 'lesson', scopeId: LESSON_2 }, fallback),
    ).toEqual({ mode: 'race', level: 'hard', courseId: COURSE, scope: 'lesson', scopeId: LESSON_2 });
  });

  it('drops a course the student can no longer open, and a lesson that lost its questions', () => {
    expect(restoreChoice(hub(), { courseId: 'gone', scope: 'lesson', scopeId: LESSON_1 }, fallback)).toMatchObject({
      courseId: null,
      scope: 'all',
      scopeId: null,
    });
    expect(restoreChoice(hub(), { courseId: COURSE, scope: 'lesson', scopeId: 'gone' }, fallback)).toMatchObject({
      courseId: COURSE,
      scope: 'all',
    });
  });
});
