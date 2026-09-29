import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ARENA_RULES, type ArenaFrame, type ArenaView } from '@ayman/contracts/arena';
import type { EngineAward, EngineQuestion, MatchState } from './arena-engine';
import { MemoryArenaKv } from './arena-kv';
import { MemoryArenaRealtime } from './arena-realtime';
import type { ArenaEligibility, ArenaRecordsPort } from './arena.ports';
import { ArenaService, fxFor } from './arena.service';

const R = ARENA_RULES;

const COURSE = '0190aaaa-0000-7000-8000-000000000001';
const OTHER_COURSE = '0190aaaa-0000-7000-8000-000000000002';
const SYSTEM = '0190bbbb-0000-7000-8000-000000000001';

function eligible(name: string, stream: 'general' | 'languages', courses = [COURSE]): ArenaEligibility {
  return {
    name,
    image: null,
    cohort: { systemId: SYSTEM, year: 2, stream },
    cohortLabel: `تانية · ${stream}`,
    blocked: null,
    courses: courses.map((id) => ({ id, title: `كورس ${id.slice(-1)}`, questions: 20, playable: true })),
  };
}

const PEOPLE: Record<string, ArenaEligibility> = {
  alice: eligible('مريم', 'general', [COURSE, OTHER_COURSE]),
  bob: eligible('ملك', 'general', [COURSE, OTHER_COURSE]),
  carol: eligible('نور', 'languages'),
  erin: eligible('سلمى', 'general', [COURSE]),
  free: { ...eligible('حر', 'general'), blocked: 'no_subscription', courses: [] },
  noyear: { ...eligible('بلا سنة', 'general'), cohort: null, blocked: 'no_year', courses: [] },
};

function questions(n: number): EngineQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    type: 'mcq_single' as const,
    stemHtml: `<p>${i}</p>`,
    options: [
      { id: `q${i}-a`, bodyHtml: 'أ' },
      { id: `q${i}-b`, bodyHtml: 'ب' },
    ],
    correct: [`q${i}-b`],
  }));
}

function setup(options: { questionCount?: number; bootId?: string; kv?: MemoryArenaKv; clock?: { now: number } } = {}) {
  const clock = options.clock ?? { now: 1_000_000 };
  const kv = options.kv ?? new MemoryArenaKv(() => clock.now);
  const realtime = new MemoryArenaRealtime();
  const recorded: MatchState[] = [];
  const records: ArenaRecordsPort = {
    async record(state) {
      recorded.push(structuredClone(state));
      const award = (side: 0 | 1): EngineAward => {
        const won = state.end?.winner === side && state.end.reason !== 'aborted';
        return { points: won ? R.points.win : 0, capped: false, total: won ? R.points.win : 0 };
      };
      return [award(0), award(1)];
    },
    async me() {
      return { points: 0, wins: 0, draws: 0, losses: 0, played: 0, rank: null, todayPoints: 0 };
    },
    async board() {
      return { cohortLabel: '', rows: [], me: null };
    },
  };
  const service = new ArenaService(
    kv,
    realtime,
    {
      async eligibility(userId) {
        const person = PEOPLE[userId];
        if (!person) throw new Error(`no fixture for ${userId}`);
        return person;
      },
    },
    { build: async (_course, _users, count) => questions(Math.min(count, options.questionCount ?? 7)) },
    records,
    () => clock.now,
  );
  if (options.bootId) Object.defineProperty(service, 'bootId', { value: options.bootId });
  return { service, kv, realtime, recorded, clock };
}

function lastFrame(realtime: MemoryArenaRealtime, userId: string): Extract<ArenaFrame, { type: 'view' }> {
  const frames = realtime.sent.get(userId) ?? [];
  const last = frames.at(-1);
  if (!last || last.type !== 'view') throw new Error(`no view frame for ${userId}`);
  return last;
}

function matchOf(view: ArenaView) {
  if (view.phase !== 'match') throw new Error(`expected a match, got ${view.phase}`);
  return view.match;
}

async function online(service: ArenaService, ...users: string[]) {
  for (const user of users) await service.streamOpened(user);
}

describe('ArenaService — matchmaking', () => {
  it('pairs two students from the same cohort and the same course', async () => {
    const { service, realtime } = setup();
    await online(service, 'alice', 'bob');
    expect((await service.join('alice', COURSE)).phase).toBe('queued');
    const view = await service.join('bob', COURSE);
    const match = matchOf(view);
    expect(match.stage).toBe('vs');
    expect(match.opponent.player.name).toBe('مريم');
    expect(lastFrame(realtime, 'alice').fx).toBe('matched');
    expect(matchOf(lastFrame(realtime, 'alice').view).opponent.player.name).toBe('ملك');
  });

  it('never pairs the Arabic stream with the languages stream', async () => {
    const { service } = setup();
    await online(service, 'alice', 'carol');
    await service.join('alice', COURSE);
    expect((await service.join('carol', COURSE)).phase).toBe('queued');
    expect((await service.lobby('alice')).view.phase).toBe('queued');
  });

  it('never pairs two students queued for different courses', async () => {
    const { service } = setup();
    await online(service, 'alice', 'bob');
    await service.join('alice', OTHER_COURSE);
    expect((await service.join('bob', COURSE)).phase).toBe('queued');
  });

  it('never pairs a student with themselves, however many tabs join', async () => {
    const { service, kv } = setup();
    await online(service, 'alice');
    await service.join('alice', COURSE);
    expect((await service.join('alice', COURSE)).phase).toBe('queued');
    await service.sweepQueues();
    const queues = await kv.smembers('arena:queues');
    const members = (await Promise.all(queues.map((q) => kv.zall(`arena:q:${q}`)))).flat();
    expect(members.map((m) => m.member)).toEqual(['alice']);
  });

  it('keeps a student in one queue at a time — the new course replaces the old', async () => {
    const { service } = setup();
    await online(service, 'alice', 'bob');
    await service.join('alice', COURSE);
    const moved = await service.join('alice', OTHER_COURSE);
    expect(moved).toMatchObject({ phase: 'queued', courseId: OTHER_COURSE });
    // بوب في الكورس الأولاني مابيلاقيش أليس هناك.
    expect((await service.join('bob', COURSE)).phase).toBe('queued');
  });

  it('keeps the waiting time when the same queue is joined again', async () => {
    const { service, clock } = setup();
    await online(service, 'alice');
    const first = await service.join('alice', COURSE);
    clock.now += 5_000;
    await service.beat('alice');
    const again = await service.join('alice', COURSE);
    expect(again).toMatchObject({ phase: 'queued', since: first.phase === 'queued' ? first.since : -1 });
  });

  it('drops a student whose heartbeat stopped instead of matching a ghost', async () => {
    const { service, clock } = setup();
    await online(service, 'alice');
    await service.join('alice', COURSE);
    clock.now += R.beatTtlMs + 1;
    await online(service, 'bob');
    expect((await service.join('bob', COURSE)).phase).toBe('queued');
    expect((await service.lobby('alice')).view.phase).toBe('idle');
  });

  it('refuses a student with no paid subscription, no year, or a course they cannot play', async () => {
    const { service } = setup();
    await expect(service.join('free', COURSE)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.join('noyear', COURSE)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.join('carol', OTHER_COURSE)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sends a student already in a match back to it instead of queueing again', async () => {
    const { service } = setup();
    await online(service, 'alice', 'bob');
    await service.join('alice', COURSE);
    const id = matchOf(await service.join('bob', COURSE)).id;
    expect(matchOf(await service.join('alice', OTHER_COURSE)).id).toBe(id);
  });

  it('lets a student cancel the search', async () => {
    const { service, realtime } = setup();
    await online(service, 'alice', 'bob');
    await service.join('alice', COURSE);
    expect(await service.cancel('alice')).toEqual({ phase: 'idle' });
    expect(lastFrame(realtime, 'alice').fx).toBe('left_queue');
    expect((await service.join('bob', COURSE)).phase).toBe('queued');
  });

  it('sends both back to the lobby when the shared bank is too small for a match', async () => {
    const { service, realtime } = setup({ questionCount: 2 });
    await online(service, 'alice', 'bob');
    await service.join('alice', COURSE);
    expect(await service.join('bob', COURSE)).toEqual({ phase: 'idle' });
    expect(lastFrame(realtime, 'alice').fx).toBe('no_questions');
  });
});

/** ماتش بين أليس وبوب، واقف على أول سؤال. */
async function playing(options: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(options);
  await online(ctx.service, 'alice', 'bob');
  await ctx.service.join('alice', COURSE);
  const id = matchOf(await ctx.service.join('bob', COURSE)).id;
  ctx.clock.now += R.vsMs;
  await ctx.service.sweep();
  expect(lastFrame(ctx.realtime, 'alice').fx).toBe('question');
  return { ...ctx, id };
}

describe('ArenaService — a match, end to end', () => {
  it('scores the first right answer, reveals it to both, and moves on', async () => {
    const { service, realtime, id, clock } = await playing();
    clock.now += 2_000;
    const bob = await service.answer('bob', id, 0, 'q0-b', clock.now);
    expect(bob.result).toBe('right');
    expect(lastFrame(realtime, 'alice').fx).toBe('opponent_right');
    expect(lastFrame(realtime, 'bob').fx).toBe('you_right');
    expect((await service.answer('alice', id, 0, 'q0-b', clock.now + 1)).result).toBe('late');
    clock.now += R.revealMs;
    await service.sweep();
    expect(matchOf(lastFrame(realtime, 'alice').view).index).toBe(1);
  });

  it('lets the other take the point after a wrong answer', async () => {
    const { service, realtime, id, clock } = await playing();
    expect((await service.answer('alice', id, 0, 'q0-a', clock.now + 500)).result).toBe('wrong');
    expect(lastFrame(realtime, 'bob').fx).toBe('opponent_wrong');
    expect(matchOf(lastFrame(realtime, 'bob').view).opponent.state).toBe('locked');
    expect((await service.answer('bob', id, 0, 'q0-b', clock.now + 9_000)).result).toBe('right');
  });

  it('ignores an answer from somebody who is not in the match', async () => {
    const { service, id, clock } = await playing();
    await expect(service.answer('erin', id, 0, 'q0-b', clock.now)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.answer('alice', 'no-such-match', 0, 'q0-b', clock.now)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('plays every question, writes the match once, and shows the points on the result', async () => {
    const { service, realtime, recorded, id, clock } = await playing({ questionCount: 3 });
    for (let i = 0; i < 3; i++) {
      await service.answer('alice', id, i, `q${i}-b`, clock.now + 100);
      clock.now += 100 + R.revealMs;
      // الاتنين لسه فاتحين — من غير نبض، بعد ١٢ ثانية «النت قطع».
      await service.beat('alice');
      await service.beat('bob');
      await service.sweep();
    }
    const end = matchOf(lastFrame(realtime, 'alice').view).end;
    expect(lastFrame(realtime, 'alice').fx).toBe('end');
    expect(end).toMatchObject({ outcome: 'win', reason: 'completed', pointsEarned: R.points.win });
    expect(matchOf(lastFrame(realtime, 'bob').view).end?.outcome).toBe('loss');
    expect(recorded).toHaveLength(1);
    // اللوبي بعد النهاية = اللوبي، والماتش مابيتسحبش تاني.
    expect((await service.lobby('alice')).view.phase).toBe('idle');
    await service.sweep();
    expect(recorded).toHaveLength(1);
  });

  it('tells the other «النت قطع», then gives the match away when nobody comes back', async () => {
    const { service, realtime, recorded, id, clock } = await playing();
    await service.streamClosed('bob');
    clock.now += 3_000;
    await service.beat('alice');
    await service.sweep();
    expect(lastFrame(realtime, 'alice').fx).toBe('opponent_offline');
    expect(matchOf(lastFrame(realtime, 'alice').view).paused?.who).toBe('opponent');

    for (let s = 0; s < R.graceMs; s += 2_000) {
      clock.now += 2_000;
      await service.beat('alice');
      await service.sweep();
    }
    expect(matchOf(lastFrame(realtime, 'alice').view).end).toMatchObject({ outcome: 'win', reason: 'forfeit' });
    expect(recorded[0]?.end).toMatchObject({ winner: 0, reason: 'forfeit' });
    expect(id).toBeTruthy();
  });

  it('resumes the same question when the stream comes back within the grace', async () => {
    const { service, realtime, clock } = await playing();
    await service.streamClosed('bob');
    clock.now += 3_000;
    await service.beat('alice');
    await service.sweep();
    clock.now += 5_000;
    await service.beat('alice');
    const back = await service.streamOpened('bob');
    expect(matchOf(back).paused?.who).toBe('you');
    await service.sweep();
    expect(lastFrame(realtime, 'alice').fx).toBe('opponent_back');
    const view = matchOf(lastFrame(realtime, 'bob').view);
    expect(view.paused).toBeNull();
    expect(view.index).toBe(0);
    expect(view.stage).toBe('question');
  });

  it('treats a stream that blinks for a moment as nothing at all', async () => {
    const { service, realtime, clock } = await playing();
    await service.streamClosed('bob');
    clock.now += 1_000;
    await service.streamOpened('bob');
    await service.sweep();
    expect(lastFrame(realtime, 'alice').fx).not.toBe('opponent_offline');
  });

  it('forfeits at once on «انسحاب»', async () => {
    const { service, realtime, id } = await playing();
    const view = matchOf(await service.leave('alice', id));
    expect(view.end).toMatchObject({ outcome: 'loss', reason: 'forfeit' });
    expect(matchOf(lastFrame(realtime, 'bob').view).end?.outcome).toBe('win');
  });

  it('ends a match left behind by a restarted process as «اتقطع» for both, with no points', async () => {
    const first = await playing({ bootId: 'old-boot' });
    const second = setup({ bootId: 'new-boot', kv: first.kv, clock: first.clock });
    expect(await second.service.closeOrphans()).toBe(1);
    for (const user of ['alice', 'bob']) {
      const frame = lastFrame(second.realtime, user);
      expect(frame.fx).toBe('aborted');
      expect(matchOf(frame.view).end).toMatchObject({ outcome: 'none', reason: 'aborted', pointsEarned: 0 });
    }
    expect(second.recorded[0]?.end?.reason).toBe('aborted');
    // وماتش جديد بعدها بيشتغل عادي.
    await second.service.streamOpened('alice');
    await second.service.streamOpened('bob');
    await second.service.join('alice', COURSE);
    expect(matchOf(await second.service.join('bob', COURSE)).stage).toBe('vs');
  });
});

describe('fxFor', () => {
  it('lets the end of a match win over everything else', () => {
    const state = { end: { winner: 0, reason: 'completed', at: 0 } } as unknown as MatchState;
    expect(fxFor(state, [{ kind: 'timeout' }, { kind: 'end' }], 1)).toBe('end');
    const aborted = { end: { winner: null, reason: 'aborted', at: 0 } } as unknown as MatchState;
    expect(fxFor(aborted, [{ kind: 'end' }], 0)).toBe('aborted');
  });
});
