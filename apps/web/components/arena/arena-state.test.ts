import { describe, expect, it } from 'vitest';
import { ARENA_RULES, type ArenaMatchView, type ArenaView } from '@ayman/contracts/arena';
import {
  arenaReducer,
  clockText,
  cueFor,
  initialState,
  isLatinText,
  mergeView,
  patienceRanOut,
  remainingMs,
  screenOf,
} from './arena-state';

function match(overrides: Partial<ArenaMatchView> = {}): ArenaMatchView {
  return {
    id: 'm1',
    seq: 3,
    courseTitle: 'برمجة',
    cohortLabel: 'تانية · عربي',
    total: 7,
    index: 0,
    stage: 'question',
    you: { player: { name: 'مريم', image: null }, score: 0, status: 'thinking' },
    opponent: { player: { name: 'ملك', image: null }, score: 0, status: 'thinking' },
    question: {
      index: 0,
      id: 'q0',
      type: 'mcq_single',
      stemHtml: '<p>؟</p>',
      options: [
        { id: 'a', bodyHtml: 'أ' },
        { id: 'b', bodyHtml: 'ب' },
      ],
    },
    deadline: 20_000,
    questionMs: ARENA_RULES.questionMs,
    paused: null,
    yourPick: null,
    reveal: null,
    history: [],
    end: null,
    ...overrides,
  };
}

const inMatch = (m: ArenaMatchView): ArenaView => ({ phase: 'match', match: m });

describe('mergeView — the newest copy of the match wins', () => {
  it('keeps the newer sequence when the POST reply and the stream frame cross', () => {
    const newer = inMatch(match({ seq: 5 }));
    const older = inMatch(match({ seq: 4, yourPick: 'a' }));
    expect(mergeView(newer, older)).toBe(newer);
    expect(mergeView(older, newer)).toBe(newer);
  });

  it('takes a different match, or a different phase, as it comes', () => {
    const current = inMatch(match({ id: 'old', seq: 99, end: { outcome: 'win', reason: 'completed', pointsEarned: 3, capped: false, totalPoints: 3 } }));
    const next = inMatch(match({ id: 'new', seq: 0 }));
    expect(mergeView(current, next)).toBe(next);
    expect(mergeView(next, { phase: 'idle' })).toEqual({ phase: 'idle' });
  });

  it('ignores a late «queued» frame once the match has started', () => {
    const live = inMatch(match());
    const late: ArenaView = { phase: 'queued', courseId: 'c', courseTitle: '', cohortLabel: '', since: 1 };
    expect(mergeView(live, late)).toBe(live);
  });
});

describe('arenaReducer', () => {
  it('learns the server clock from every frame', () => {
    const state = initialState({ phase: 'idle' }, 10_000, 9_000);
    expect(state.offset).toBe(1_000);
    const next = arenaReducer(state, { type: 'clock', at: 5_000, now: 5_500 });
    expect(next.offset).toBe(-500);
  });

  it('goes back to «idle» — and so back into the queue — when the server says the seat was lost', () => {
    const queued: ArenaView = { phase: 'queued', courseId: 'c1', courseTitle: '', cohortLabel: '', since: 1 };
    let state = arenaReducer(initialState(queued, 0, 0), { type: 'start', courseId: 'c1', now: 0 });
    state = arenaReducer(state, { type: 'beat', at: 10, now: 10, phase: 'idle' });
    expect(state.view.phase).toBe('idle');
    expect(state.want).toBe('c1');
    expect(screenOf(state)).toBe('search');
    const inGame = arenaReducer(initialState(inMatch(match()), 0, 0), { type: 'beat', at: 0, now: 0, phase: 'idle' });
    expect(inGame.view.phase).toBe('match');
  });

  it('goes searching the moment «يلا نبدأ» is pressed, before the server answers', () => {
    const state = arenaReducer(initialState({ phase: 'idle' }, 0, 0), { type: 'start', courseId: 'c1', now: 100 });
    expect(screenOf(state)).toBe('search');
    expect(state.want).toBe('c1');
  });

  it('leaves the result screen at once for «ماتش تاني»', () => {
    const ended = initialState(
      inMatch(match({ stage: 'ended', end: { outcome: 'loss', reason: 'completed', pointsEarned: 0, capped: false, totalPoints: 0 } })),
      0,
      0,
    );
    expect(screenOf(ended)).toBe('result');
    const again = arenaReducer(ended, { type: 'start', courseId: 'c1', now: 1 });
    expect(screenOf(again)).toBe('search');
  });

  it('clears the pending pick and the «late» note when the next question arrives', () => {
    let state = initialState(inMatch(match()), 0, 0);
    state = arenaReducer(state, { type: 'answer-sent', optionId: 'a' });
    expect(state.pending).toBe('a');
    state = arenaReducer(state, { type: 'answer-result', result: 'late', view: inMatch(match({ seq: 4, stage: 'reveal' })) });
    expect(state.late).toBe(true);
    state = arenaReducer(state, {
      type: 'frame',
      fx: 'question',
      at: 0,
      now: 0,
      view: inMatch(match({ seq: 6, index: 1 })),
    });
    expect(state.pending).toBeNull();
    expect(state.late).toBe(false);
    expect(state.fx?.fx).toBe('question');
  });

  it('plays the same effect twice when it happens twice', () => {
    let state = initialState(inMatch(match()), 0, 0);
    state = arenaReducer(state, { type: 'frame', fx: 'opponent_wrong', at: 0, now: 0, view: inMatch(match({ seq: 4 })) });
    const first = state.fx?.key;
    state = arenaReducer(state, { type: 'frame', fx: 'opponent_wrong', at: 0, now: 0, view: inMatch(match({ seq: 5 })) });
    expect(state.fx?.key).not.toBe(first);
  });

  it('goes back to the lobby with a note when the shared bank was too small', () => {
    let state = arenaReducer(initialState({ phase: 'idle' }, 0, 0), { type: 'start', courseId: 'c1', now: 0 });
    state = arenaReducer(state, { type: 'frame', fx: 'no_questions', at: 0, now: 0, view: { phase: 'idle' } });
    expect(screenOf(state)).toBe('lobby');
    expect(state.error).toBe('no_questions');
  });
});

describe('screenOf', () => {
  it('maps every server phase to a screen', () => {
    expect(screenOf({ view: { phase: 'idle' }, want: null })).toBe('lobby');
    expect(screenOf({ view: { phase: 'queued', courseId: 'c', courseTitle: '', cohortLabel: '', since: 0 }, want: 'c' })).toBe('search');
    expect(screenOf({ view: inMatch(match({ stage: 'vs' })), want: null })).toBe('versus');
    expect(screenOf({ view: inMatch(match({ stage: 'reveal' })), want: null })).toBe('question');
  });
});

describe('the clock on screen', () => {
  it('counts down against the server clock, never below zero', () => {
    expect(remainingMs(10_000, 500, 9_000)).toBe(500);
    expect(remainingMs(10_000, 0, 11_000)).toBe(0);
    expect(remainingMs(null, 0, 0)).toBe(0);
  });

  it('writes minutes and seconds', () => {
    expect(clockText(67_900)).toBe('01:07');
    expect(clockText(-5)).toBe('00:00');
  });

  it('asks «نستنى كمان؟» after a minute with nobody', () => {
    expect(patienceRanOut(0, ARENA_RULES.searchPatienceMs - 1, ARENA_RULES.searchPatienceMs)).toBe(false);
    expect(patienceRanOut(0, ARENA_RULES.searchPatienceMs, ARENA_RULES.searchPatienceMs)).toBe(true);
    expect(patienceRanOut(null, 999_999, ARENA_RULES.searchPatienceMs)).toBe(false);
  });
});

describe('isLatinText', () => {
  it('isolates a Latin option and leaves an Arabic one alone', () => {
    expect(isLatinText('<p>len()</p>')).toBe(true);
    expect(isLatinText('<p>8</p>')).toBe(true);
    expect(isLatinText('<p>x[0]</p>')).toBe(true);
    expect(isLatinText('<p>خطأ</p>')).toBe(false);
    expect(isLatinText('<p>3 نقط</p>')).toBe(false);
    expect(isLatinText('<p><code>print</code> بتطبع</p>')).toBe(false);
  });
});

describe('cueFor', () => {
  it('plays the point the right way round for each side', () => {
    expect(cueFor('you_right', null)).toBe('right');
    expect(cueFor('opponent_right', null)).toBe('lost-point');
    expect(cueFor('opponent_wrong', null)).toBe('steal');
    expect(cueFor('opponent_offline', null)).toBe('alert');
  });

  it('plays the result the match actually had', () => {
    const end = (outcome: 'win' | 'loss' | 'draw') =>
      match({ end: { outcome, reason: 'completed', pointsEarned: 0, capped: false, totalPoints: 0 } });
    expect(cueFor('end', end('win'))).toBe('win');
    expect(cueFor('end', end('loss'))).toBe('lose');
    expect(cueFor('end', end('draw'))).toBe('draw');
  });
});
