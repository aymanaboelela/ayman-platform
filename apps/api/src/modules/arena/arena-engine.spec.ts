import { ARENA_RULES } from '@ayman/contracts/arena';
import {
  abort,
  advance,
  answer,
  createMatch,
  disconnect,
  leave,
  nextDueAt,
  outcomeFor,
  reconnect,
  sideOf,
  viewFor,
  type EngineQuestion,
  type MatchState,
} from './arena-engine';

const R = ARENA_RULES;

function question(n: number): EngineQuestion {
  return {
    id: `q${n}`,
    type: 'mcq_single',
    stemHtml: `<p>سؤال ${n}</p>`,
    options: [
      { id: `q${n}-a`, bodyHtml: 'أ' },
      { id: `q${n}-b`, bodyHtml: 'ب' },
      { id: `q${n}-c`, bodyHtml: 'ج' },
    ],
    correct: [`q${n}-b`],
  };
}

const RIGHT = (n: number) => `q${n}-b`;
const WRONG = (n: number) => `q${n}-a`;
const WRONG2 = (n: number) => `q${n}-c`;

/** ماتش واقف على أول سؤال، والساعة عند لحظة فتحه. */
function started(count = 3): { state: MatchState; t: number } {
  const state = createMatch({
    id: 'm1',
    bootId: 'boot',
    courseId: 'c1',
    courseTitle: 'برمجة',
    cohortLabel: 'تانية · عربي',
    players: [
      { userId: 'alice', name: 'مريم', image: null },
      { userId: 'bob', name: 'ملك', image: '/b.webp' },
    ],
    questions: Array.from({ length: count }, (_, i) => question(i)),
    now: 1_000,
  });
  const t = 1_000 + R.vsMs;
  expect(advance(state, t)).toEqual([{ kind: 'question' }]);
  return { state, t };
}

describe('arena engine — the match starts', () => {
  it('refuses to match a student with themselves', () => {
    expect(() =>
      createMatch({
        id: 'x',
        bootId: 'b',
        courseId: 'c',
        courseTitle: '',
        cohortLabel: '',
        players: [
          { userId: 'same', name: 'a', image: null },
          { userId: 'same', name: 'a', image: null },
        ],
        questions: [question(0)],
        now: 0,
      }),
    ).toThrow();
  });

  it('shows VS first, then the same first question to both at the same moment', () => {
    const state = createMatch({
      id: 'm',
      bootId: 'b',
      courseId: 'c',
      courseTitle: 'ك',
      cohortLabel: 'ل',
      players: [
        { userId: 'alice', name: 'مريم', image: null },
        { userId: 'bob', name: 'ملك', image: null },
      ],
      questions: [question(0)],
      now: 0,
    });
    expect(viewFor(state, 0).stage).toBe('vs');
    expect(viewFor(state, 0).deadline).toBe(R.vsMs);
    expect(advance(state, R.vsMs - 1)).toEqual([]);
    advance(state, R.vsMs);
    const a = viewFor(state, 0);
    const b = viewFor(state, 1);
    expect(a.stage).toBe('question');
    expect(a.question?.id).toBe(b.question?.id);
    expect(a.deadline).toBe(b.deadline);
    expect(a.deadline).toBe(R.vsMs + R.questionMs);
  });

  it('never puts the right answer in a live question', () => {
    const { state } = started();
    const text = JSON.stringify(viewFor(state, 0));
    expect(text).not.toContain('correct');
    expect(viewFor(state, 0).reveal).toBeNull();
  });

  it('finds each player by their own id only', () => {
    const { state } = started();
    expect(sideOf(state, 'alice')).toBe(0);
    expect(sideOf(state, 'bob')).toBe(1);
    expect(sideOf(state, 'mallory')).toBeNull();
  });
});

describe('arena engine — scoring, exactly as asked', () => {
  it('gives the point to the first correct answer and closes the question for both', () => {
    const { state, t } = started();
    expect(answer(state, 1, 0, RIGHT(0), t + 3_000).result).toBe('right');
    expect(state.players[1].score).toBe(1);
    expect(state.stage).toBe('reveal');

    // الإجابة الصح التانية وصلت بعدها بمللي — متأخرة، والنقطة فضلت للأولى.
    expect(answer(state, 0, 0, RIGHT(0), t + 3_001).result).toBe('late');
    expect(state.players[0].score).toBe(0);

    const forBob = viewFor(state, 1).reveal;
    const forAlice = viewFor(state, 0).reveal;
    expect(forBob).toMatchObject({ winner: 'you', reason: 'correct', correctOptionIds: [RIGHT(0)] });
    expect(forAlice).toMatchObject({ winner: 'opponent', opponentOptionId: RIGHT(0), yourOptionId: null });
  });

  it('locks out a wrong answer and lets the other take the point at leisure', () => {
    const { state, t } = started();
    expect(answer(state, 0, 0, WRONG(0), t + 1_000).result).toBe('wrong');
    expect(state.stage).toBe('question');
    expect(viewFor(state, 0).you.state).toBe('locked');
    expect(viewFor(state, 0).yourPick).toBe(WRONG(0));
    expect(viewFor(state, 1).opponent.state).toBe('locked');

    // لسه مقفول عليه — ولا صح ولا غلط تاني بيتحسب.
    expect(answer(state, 0, 0, RIGHT(0), t + 1_500).result).toBe('ignored');
    expect(state.players[0].score).toBe(0);

    // التاني قعد يفكّر ١٣ ثانية، ولسه الوقت ماخلصش — النقطة ليه.
    expect(answer(state, 1, 0, RIGHT(0), t + R.questionMs - 1).result).toBe('right');
    expect(state.players[1].score).toBe(1);
    expect(viewFor(state, 0).reveal).toMatchObject({ winner: 'opponent', yourOptionId: WRONG(0) });
  });

  it('gives nobody the point when both are wrong, and closes at once', () => {
    const { state, t } = started();
    answer(state, 0, 0, WRONG(0), t + 1_000);
    const second = answer(state, 1, 0, WRONG2(0), t + 2_000);
    expect(second.result).toBe('wrong');
    expect(second.events).toContainEqual({ kind: 'both_wrong' });
    expect(state.stage).toBe('reveal');
    expect(state.players.map((p) => p.score)).toEqual([0, 0]);
    expect(viewFor(state, 0).reveal).toMatchObject({ winner: 'none', reason: 'both_wrong' });
  });

  it('gives nobody the point when time runs out', () => {
    const { state, t } = started();
    expect(advance(state, t + R.questionMs - 1)).toEqual([]);
    expect(advance(state, t + R.questionMs)).toEqual([{ kind: 'timeout' }]);
    expect(viewFor(state, 1).reveal).toMatchObject({ winner: 'none', reason: 'timeout' });
  });

  it('judges a late answer by when it reached the server, even before the sweeper ran', () => {
    const { state, t } = started();
    // مفيش advance بين الاتنين: الإجابة نفسها بتلاقي الوقت خلص.
    expect(answer(state, 0, 0, RIGHT(0), t + R.questionMs).result).toBe('late');
    expect(state.players[0].score).toBe(0);
    expect(viewFor(state, 0).reveal?.reason).toBe('timeout');
  });

  it('accepts an answer a millisecond before the deadline', () => {
    const { state, t } = started();
    expect(answer(state, 0, 0, RIGHT(0), t + R.questionMs - 1).result).toBe('right');
  });

  it('ignores an answer for another question, a stale one, or an option that is not on the paper', () => {
    const { state, t } = started();
    expect(answer(state, 0, 1, RIGHT(1), t + 100).result).toBe('ignored');
    expect(answer(state, 0, 0, 'not-an-option', t + 200).result).toBe('ignored');
    // اختيار مش موجود مابيقفلش السؤال على صاحبه.
    expect(viewFor(state, 0).you.state).toBe('thinking');
    answer(state, 1, 0, RIGHT(0), t + 300);
    advance(state, t + 300 + R.revealMs);
    expect(state.index).toBe(1);
    expect(answer(state, 0, 0, RIGHT(0), t + 400 + R.revealMs).result).toBe('late');
  });

  it('ignores answers before the first question opens', () => {
    const state = createMatch({
      id: 'm',
      bootId: 'b',
      courseId: 'c',
      courseTitle: '',
      cohortLabel: '',
      players: [
        { userId: 'alice', name: 'a', image: null },
        { userId: 'bob', name: 'b', image: null },
      ],
      questions: [question(0)],
      now: 0,
    });
    expect(answer(state, 0, 0, RIGHT(0), 100).result).toBe('ignored');
  });

  it('moves on after the reveal and ends on the last question with the higher score winning', () => {
    const { state, t } = started(2);
    answer(state, 0, 0, RIGHT(0), t + 1_000);
    advance(state, t + 1_000 + R.revealMs);
    expect(state.index).toBe(1);
    expect(state.stage).toBe('question');
    const t2 = t + 1_000 + R.revealMs;
    answer(state, 1, 1, WRONG(1), t2 + 500);
    answer(state, 0, 1, RIGHT(1), t2 + 900);
    expect(advance(state, t2 + 900 + R.revealMs)).toEqual([{ kind: 'end' }]);
    expect(state.end).toMatchObject({ winner: 0, reason: 'completed' });
    expect(outcomeFor(state, 0)).toBe('win');
    expect(outcomeFor(state, 1)).toBe('loss');
    expect(viewFor(state, 1).history).toEqual(['opponent', 'opponent']);
  });

  it('calls a level score a draw', () => {
    const { state, t } = started(2);
    answer(state, 0, 0, RIGHT(0), t + 1_000);
    advance(state, t + 1_000 + R.revealMs);
    const t2 = t + 1_000 + R.revealMs;
    answer(state, 1, 1, RIGHT(1), t2 + 100);
    advance(state, t2 + 100 + R.revealMs);
    expect(state.end).toMatchObject({ winner: null, reason: 'completed' });
    expect(outcomeFor(state, 0)).toBe('draw');
    expect(outcomeFor(state, 1)).toBe('draw');
  });

  it('only ever moves the sequence forward', () => {
    const { state, t } = started();
    const seen = [state.seq];
    answer(state, 0, 0, WRONG(0), t + 10);
    seen.push(state.seq);
    answer(state, 1, 0, RIGHT(0), t + 20);
    seen.push(state.seq);
    advance(state, t + 20 + R.revealMs);
    seen.push(state.seq);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('arena engine — «النت عنده قطع»', () => {
  it('pauses the match, freezes the clock and refuses answers while one side is gone', () => {
    const { state, t } = started();
    const events = disconnect(state, 1, t + 5_000);
    expect(events).toEqual([{ kind: 'offline', side: 1 }]);
    const view = viewFor(state, 0);
    expect(view.paused).toEqual({ who: 'opponent', graceUntil: t + 5_000 + R.graceMs });
    expect(view.opponent.state).toBe('offline');
    expect(view.deadline).toBeNull();
    expect(viewFor(state, 1).paused?.who).toBe('you');
    // الساعة واقفة: ولا timeout، ولا إجابة بتتقبل.
    expect(advance(state, t + R.questionMs + 1)).toEqual([]);
    expect(answer(state, 0, 0, RIGHT(0), t + 6_000).result).toBe('ignored');
  });

  it('gives the match to the one who stayed when the other does not come back in time', () => {
    const { state, t } = started();
    answer(state, 1, 0, RIGHT(0), t + 1_000);
    disconnect(state, 1, t + 2_000);
    expect(advance(state, t + 2_000 + R.graceMs - 1)).toEqual([]);
    expect(advance(state, t + 2_000 + R.graceMs)).toEqual([{ kind: 'end' }]);
    // حتى لو اللي فصل كان كسبان بالنقط.
    expect(state.end).toMatchObject({ winner: 0, reason: 'forfeit' });
    expect(outcomeFor(state, 0)).toBe('win');
    expect(outcomeFor(state, 1)).toBe('loss');
    expect(viewFor(state, 0).end).toMatchObject({ outcome: 'win', reason: 'forfeit' });
  });

  it('resumes the same question when the player is back within the grace period', () => {
    const { state, t } = started();
    answer(state, 0, 0, WRONG(0), t + 1_000);
    disconnect(state, 0, t + 3_000); // فاضل ١٢ ثانية
    const back = reconnect(state, 0, t + 10_000);
    expect(back).toContainEqual({ kind: 'online', side: 0 });
    expect(state.index).toBe(0);
    expect(state.stage).toBe('question');
    // الوقت اللي كان فاضل رجع زي ما هو، والإجابة الغلط لسه قافلة عليه.
    expect(state.stageEndsAt).toBe(t + 10_000 + (R.questionMs - 3_000));
    expect(viewFor(state, 0).you.state).toBe('locked');
    expect(answer(state, 1, 0, RIGHT(0), t + 11_000).result).toBe('right');
  });

  it('never resumes a question with less than the minimum on the clock', () => {
    const { state, t } = started();
    disconnect(state, 1, t + R.questionMs - 500);
    reconnect(state, 1, t + R.questionMs + 4_000);
    expect(state.stageEndsAt).toBe(t + R.questionMs + 4_000 + R.resumeMinMs);
  });

  it('keeps answer times honest across a pause', () => {
    const { state, t } = started();
    disconnect(state, 1, t + 2_000);
    reconnect(state, 1, t + 9_000);
    answer(state, 0, 0, RIGHT(0), t + 10_000);
    // ١٠ ثواني على الساعة، ٧ منهم واقف — ٣ ثواني تفكير.
    expect(state.rounds[0]!.answers[0]!.ms).toBe(3_000);
  });

  it('abandons the match with no winner when both are gone past their grace', () => {
    const { state, t } = started();
    disconnect(state, 0, t + 1_000);
    disconnect(state, 1, t + 2_000);
    expect(viewFor(state, 0).paused?.who).toBe('both');
    expect(advance(state, t + 1_000 + R.graceMs)).toEqual([]);
    expect(advance(state, t + 2_000 + R.graceMs)).toEqual([{ kind: 'end' }]);
    expect(state.end).toMatchObject({ winner: null, reason: 'abandoned' });
    expect(outcomeFor(state, 0)).toBe('none');
    expect(outcomeFor(state, 1)).toBe('none');
  });

  it('gives the match to whoever came back when the other ran out of grace meanwhile', () => {
    const { state, t } = started();
    disconnect(state, 0, t + 1_000);
    disconnect(state, 1, t + 5_000);
    advance(state, t + 1_000 + R.graceMs + 1); // مهلة الأول خلصت، التاني لسه
    expect(state.end).toBeNull();
    const events = reconnect(state, 1, t + 1_000 + R.graceMs + 2);
    expect(events).toContainEqual({ kind: 'end' });
    expect(state.end).toMatchObject({ winner: 1, reason: 'forfeit' });
  });

  it('treats walking out as a forfeit, at once', () => {
    const { state, t } = started();
    answer(state, 0, 0, RIGHT(0), t + 500);
    expect(leave(state, 0, t + 1_000)).toEqual([{ kind: 'end' }]);
    expect(state.end).toMatchObject({ winner: 1, reason: 'forfeit' });
    expect(leave(state, 1, t + 1_001)).toEqual([]);
  });

  it('ends a restarted match with no winner and no points', () => {
    const { state, t } = started();
    answer(state, 0, 0, RIGHT(0), t + 500);
    abort(state, t + 600);
    expect(state.end).toMatchObject({ winner: null, reason: 'aborted' });
    expect(outcomeFor(state, 0)).toBe('none');
    expect(viewFor(state, 1).end).toMatchObject({ outcome: 'none', reason: 'aborted', pointsEarned: 0 });
    expect(answer(state, 1, 0, RIGHT(0), t + 700).result).toBe('late');
  });

  it('asks to be swept at most a second from now, and not at all once over', () => {
    const { state, t } = started();
    expect(nextDueAt(state, t)).toBe(t + 1_000);
    disconnect(state, 0, t + 100);
    expect(nextDueAt(state, t + 100)).toBe(t + 1_100);
    abort(state, t + 200);
    expect(nextDueAt(state, t + 200)).toBeNull();
  });
});
