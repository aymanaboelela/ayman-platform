import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArenaLobbySchema, type ArenaLobby as Lobby } from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { ArenaLobby } from './arena-lobby';
import type { ArenaSound } from './use-arena-sound';

const c = arenaCopy.lobby;
const sound: ArenaSound = { enabled: false, play: vi.fn(), unlock: vi.fn(), toggle: vi.fn() };

const COURSE = '0190aaaa-0000-7000-8000-000000000001';
const UNIT = '0190cccc-0000-7000-8000-000000000001';
const LESSON = '0190cccc-0000-7000-8000-000000000003';
const OPEN = '0190dddd-0000-7000-8000-000000000001';

afterEach(cleanup);

function lobby(overrides: Partial<Lobby> = {}): Lobby {
  return ArenaLobbySchema.parse({
    cohort: { label: 'تانية · عربي' },
    blocked: null,
    courses: [
      {
        id: COURSE,
        title: 'البرمجة',
        questions: 40,
        playable: true,
        topics: [
          { id: UNIT, title: 'الوحدة الأولى', questions: 30, playable: true, waiting: 2 },
          { id: LESSON, title: 'الدرس التالت بس', questions: 5, playable: false, waiting: 0 },
        ],
      },
    ],
    me: { name: 'مريم', image: null, points: 0, wins: 0, draws: 0, losses: 0, played: 0, rank: null, todayPoints: 0 },
    view: { phase: 'idle' },
    board: { cohortLabel: '', rows: [], me: null },
    at: 0,
    challenges: [
      {
        id: OPEN,
        by: { name: 'ملك', image: null },
        courseId: COURSE,
        courseTitle: 'البرمجة',
        topicTitles: ['الوحدة الأولى'],
        since: 0,
        mine: false,
      },
    ],
    ...overrides,
  });
}

function show(data: Lobby, onPlay = vi.fn()) {
  render(<ArenaLobby lobby={data} courseId={COURSE} onCourse={vi.fn()} onPlay={onPlay} error={null} sound={sound} />);
  return onPlay;
}

describe('ArenaLobby — challenge topics', () => {
  it('plays a topic from its own row, and says who is waiting in it', () => {
    const onPlay = show(lobby());
    // الكورس فيه تحديات — مفيش «يلا نبدأ» على الكورس كله.
    expect(screen.queryByRole('button', { name: new RegExp(c.start) })).toBeNull();
    const unit = screen.getByText('الوحدة الأولى', { selector: '.ca-topic__name' }).closest('li')!;
    expect(unit).toHaveTextContent('2 في الطابور');
    fireEvent.click(within(unit).getByRole('button', { name: new RegExp(c.topicPlay) }));
    expect(onPlay).toHaveBeenCalledWith(`t:${COURSE}:${UNIT}`);
    // تحدّي أسئلته أقل من الماتش — زراره مقفول.
    const lesson = screen.getByText('الدرس التالت بس', { selector: '.ca-topic__name' }).closest('li')!;
    expect(within(lesson).getByRole('button', { name: new RegExp(c.topicPlay) })).toBeDisabled();
  });

  it('opens a challenge on the picked topics', () => {
    const onPlay = show(lobby());
    const create = screen.getByRole('button', { name: new RegExp(c.createCta) });
    expect(create).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'الوحدة الأولى', pressed: false }));
    fireEvent.click(screen.getByRole('button', { name: 'الدرس التالت بس', pressed: false }));
    fireEvent.click(create);
    expect(onPlay).toHaveBeenCalledWith(`n:${COURSE}:${UNIT},${LESSON}`);
  });

  it('lists classmates’ open challenges with an accept button, but not on your own', () => {
    const onPlay = show(lobby());
    fireEvent.click(screen.getByRole('button', { name: new RegExp(c.accept) }));
    expect(onPlay).toHaveBeenCalledWith(`c:${OPEN}`);

    cleanup();
    show(lobby({ challenges: [{ ...lobby().challenges[0]!, mine: true }] }));
    expect(screen.getByText(c.openMine)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(c.accept) })).toBeNull();
  });
});
