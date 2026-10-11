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

const TOPIC_UNIT = '01990000-0000-7000-8000-0000000f0001';
const TOPIC_LESSON = '01990000-0000-7000-8000-0000000f0002';

/** نفس الكورس، بس فيه «تحديات»: الوحدة الأولى (الدرسين) والدرس التاني لوحده. */
function topicHub(): GameHub {
  const base = hub();
  return GameHubSchema.parse({
    ...base,
    courses: [
      {
        ...base.courses[0]!,
        topics: [
          { id: TOPIC_UNIT, title: 'الوحدة الأولى كلها', lessonIds: [LESSON_1, LESSON_2] },
          { id: TOPIC_LESSON, title: 'الدرس التاني بس', lessonIds: [LESSON_2] },
        ],
        topicBuckets: [
          { lessonId: LESSON_1, counts: { easy: 3, medium: 9, hard: 0 } },
          { lessonId: LESSON_2, counts: { easy: 1, medium: 3, hard: 0 } },
        ],
      },
      base.courses[1]!,
    ],
  });
}

describe('GamesHub — challenge topics', () => {
  it('swaps «الأسئلة من» for the course’s topics, counting overlapping topics once', () => {
    render(<GamesHub hub={topicHub()} />);
    pickCourse('البرمجة');
    expect(screen.queryByRole('radio', { name: new RegExp(c.scopeLesson) })).toBeNull();
    // «كل الكورسات» مالهاش معنى والتحدّي في كورس واحد.
    expect(screen.queryByLabelText(new RegExp(c.allCourses))).toBeNull();

    const unit = screen.getByText('الوحدة الأولى كلها').closest('label')!;
    const lesson = screen.getByText('الدرس التاني بس').closest('label')!;
    expect(unit).toHaveTextContent('16');
    // ٤ أسئلة: أقل من المليون (١٥)، باهت ومعاه السبب.
    expect(lesson).toHaveAttribute('data-short');
    // التحدّي الأول اتختار لوحده لأنه أول واحد يكفي.
    expect(within(unit).getByRole('checkbox')).toBeChecked();

    // الاتنين مع بعض = ١٦ مش ٢٠: الدرس التاني جوّه الوحدة.
    fireEvent.click(within(lesson).getByRole('checkbox'));
    expect(screen.getByText(formatCopy(c.summaryPool, { n: 16 }))).toBeInTheDocument();
  });

  it('starts a practice round on the picked topics', async () => {
    apiPost.mockResolvedValue({ mode: 'race', level: 'medium', questions: [], poolSize: 0, sessionId: null });
    render(<GamesHub hub={topicHub()} />);
    pickCourse('البرمجة');
    fireEvent.click(screen.getByLabelText(new RegExp(c.modePractice)));
    fireEvent.click(within(screen.getByText('الدرس التاني بس').closest('label')!).getByRole('checkbox'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(c.play) }));
    });
    expect(apiPost).toHaveBeenCalledWith('/api/me/game/rounds', expect.anything(), {
      mode: 'race',
      level: 'medium',
      courseId: COURSE,
      scope: 'all',
      topicIds: [TOPIC_UNIT, TOPIC_LESSON],
      practice: true,
    });
  });

  it('will not start with no topic picked, and says so', () => {
    render(<GamesHub hub={topicHub()} />);
    pickCourse('البرمجة');
    fireEvent.click(within(screen.getByText('الوحدة الأولى كلها').closest('label')!).getByRole('checkbox'));
    expect(screen.getByRole('button', { name: new RegExp(c.play) })).toBeDisabled();
    expect(screen.getByText(c.topicsPickOne)).toBeInTheDocument();
  });
});

describe('restoreChoice', () => {
  const fallback = {
    mode: 'millionaire' as const,
    courseId: null,
    scope: 'all' as const,
    scopeId: null,
    level: 'medium' as const,
    topicIds: [],
  };

  it('brings a saved lesson back when it is still there', () => {
    expect(
      restoreChoice(hub(), { mode: 'race', level: 'hard', courseId: COURSE, scope: 'lesson', scopeId: LESSON_2 }, fallback),
    ).toEqual({ mode: 'race', level: 'hard', courseId: COURSE, scope: 'lesson', scopeId: LESSON_2, topicIds: [] });
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
