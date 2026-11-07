import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaLobbySchema, type ArenaLobby as Lobby } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { ArenaLobby } from './arena-lobby';
import type { ArenaSound } from './use-arena-sound';

const c = arenaCopy.lobby;
const sound: ArenaSound = { enabled: false, play: vi.fn(), unlock: vi.fn(), toggle: vi.fn() };

const COURSE = '0190aaaa-0000-7000-8000-000000000001';
const COURSE_2 = '0190aaaa-0000-7000-8000-000000000002';
const TOPIC = '0190cccc-0000-7000-8000-000000000001';

afterEach(cleanup);

const arenaTopic = (overrides = {}) => ({
  id: TOPIC,
  title: 'تحدّي الأسبوع',
  scope: ['الوحدة الأولى', 'الدرس التالت | أساسيات الواجهة'],
  questions: 30,
  playable: true,
  waiting: 2,
  ...overrides,
});

function lobby(overrides: Partial<Lobby> = {}): Lobby {
  return ArenaLobbySchema.parse({
    cohort: { label: 'تانية · عربي' },
    blocked: null,
    courses: [{ id: COURSE, title: 'البرمجة', questions: 30, playable: true, topics: [arenaTopic()] }],
    me: { name: 'مريم', image: null, points: 0, wins: 0, draws: 0, losses: 0, played: 0, rank: null, todayPoints: 0 },
    view: { phase: 'idle' },
    board: { cohortLabel: '', rows: [], me: null },
    at: 0,
    ...overrides,
  });
}

function show(data: Lobby, onPlay = vi.fn()) {
  render(<ArenaLobby lobby={data} courseId={COURSE} onCourse={vi.fn()} onPlay={onPlay} error={null} sound={sound} />);
  return onPlay;
}

describe('ArenaLobby — the teacher picks the challenge', () => {
  it('shows the one arena challenge, what it covers, and one start button', () => {
    const onPlay = show(lobby());
    expect(screen.getByText('تحدّي الأسبوع', { selector: '.ca-topic__name' })).toBeInTheDocument();
    const scope = screen.getByRole('list', { name: c.arenaOn });
    expect(within(scope).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'الوحدة الأولى',
      'الدرس التالت | أساسيات الواجهة',
    ]);
    expect(screen.getByText('2 في الطابور')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.start) }));
    expect(onPlay).toHaveBeenCalledWith(`t:${COURSE}:${TOPIC}`);
  });

  it('offers nothing to pick: no topic list, no «your own challenge», one course = no course picker', () => {
    show(lobby());
    expect(screen.getAllByRole('button').filter((button) => button.classList.contains('ca-start'))).toHaveLength(1);
    expect(screen.queryByRole('radiogroup')).toBeNull();
    // The scope is read-only chips, not toggles to compose a challenge with.
    expect(screen.queryByRole('button', { name: 'الوحدة الأولى' })).toBeNull();
    expect(within(screen.getByRole('list', { name: c.arenaOn })).queryAllByRole('button')).toHaveLength(0);
  });

  it('a course the teacher has not set yet cannot be played', () => {
    show(lobby({ courses: [{ id: COURSE, title: 'البرمجة', questions: 0, playable: false, topics: [] }] }));
    expect(screen.getByText(c.noArenaTitle)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(c.start) })).toBeNull();
  });

  it('a challenge whose bank is still too small keeps its button shut', () => {
    show(lobby({ courses: [{ id: COURSE, title: 'البرمجة', questions: 3, playable: false, topics: [arenaTopic({ questions: 3, playable: false })] }] }));
    expect(screen.getByRole('button', { name: new RegExp(c.start) })).toBeDisabled();
    expect(screen.getByText(c.topicTooFew)).toBeInTheDocument();
  });

  it('two subscribed courses: the student picks the course, never what is inside it', () => {
    const onCourse = vi.fn();
    const data = lobby({
      courses: [
        { id: COURSE, title: 'البرمجة', questions: 30, playable: true, topics: [arenaTopic()] },
        { id: COURSE_2, title: 'الذكاء الاصطناعي', questions: 0, playable: false, topics: [] },
      ],
    });
    render(<ArenaLobby lobby={data} courseId={COURSE} onCourse={onCourse} onPlay={vi.fn()} error={null} sound={sound} />);
    fireEvent.click(screen.getByRole('radio', { name: /الذكاء الاصطناعي/ }));
    expect(onCourse).toHaveBeenCalledWith(COURSE_2);
  });
});
