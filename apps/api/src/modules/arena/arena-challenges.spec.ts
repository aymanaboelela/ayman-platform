import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ARENA_RULES, type ArenaView } from '@ayman/contracts/arena';
import type { EngineQuestion } from './arena-engine';
import { MemoryArenaKv } from './arena-kv';
import { pickQuestions } from './arena-matchmaking';
import { MemoryArenaRealtime } from './arena-realtime';
import type { ArenaEligibility, ArenaRecordsPort } from './arena.ports';
import { ArenaService } from './arena.service';

/**
 * «ساحة التحدي» على «التحديات»: طابور لكل تحدّي، و«تحدّي من اختيارك» اللي
 * زميل من نفس الطابور بيقبله. نفس الـfakes بتاعة `arena.service.spec.ts` —
 * Redis في الذاكرة، ومفيش Postgres.
 */

const COURSE = '0190aaaa-0000-7000-8000-000000000001';
const FLAT = '0190aaaa-0000-7000-8000-000000000003';
const SYSTEM = '0190bbbb-0000-7000-8000-000000000001';
const UNIT_1 = '0190cccc-0000-7000-8000-000000000001';
const LESSON_3 = '0190cccc-0000-7000-8000-000000000003';
const SMALL = '0190cccc-0000-7000-8000-000000000009';

function person(name: string, stream: 'general' | 'languages'): ArenaEligibility {
  return {
    name,
    image: null,
    cohort: { systemId: SYSTEM, year: 2, stream },
    cohortLabel: `تانية · ${stream}`,
    blocked: null,
    courses: [
      {
        id: COURSE,
        title: 'البرمجة',
        questions: 40,
        playable: true,
        topics: [
          { id: UNIT_1, title: 'الوحدة الأولى', questions: 30, playable: true, waiting: 0 },
          { id: LESSON_3, title: 'الدرس التالت بس', questions: 12, playable: true, waiting: 0 },
          { id: SMALL, title: 'لسه صغير', questions: 3, playable: false, waiting: 0 },
        ],
      },
      { id: FLAT, title: 'كورس من غير تحديات', questions: 20, playable: true, topics: [] },
    ],
  };
}

const PEOPLE: Record<string, ArenaEligibility> = {
  alice: person('مريم', 'general'),
  bob: person('ملك', 'general'),
  dina: person('دينا', 'general'),
  carol: person('نور', 'languages'),
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

function setup() {
  const clock = { now: 1_000_000 };
  const kv = new MemoryArenaKv(() => clock.now);
  const realtime = new MemoryArenaRealtime();
  const builds: Array<{ course: string; topics: readonly string[] }> = [];
  const records: ArenaRecordsPort = {
    async record() {
      return [
        { points: 0, capped: false, total: 0 },
        { points: 0, capped: false, total: 0 },
      ];
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
        const found = PEOPLE[userId];
        if (!found) throw new Error(`no fixture for ${userId}`);
        return found;
      },
    },
    {
      build: async (course, _users, count, topics = []) => {
        builds.push({ course, topics });
        return questions(count);
      },
    },
    records,
    () => clock.now,
  );
  return { service, kv, realtime, clock, builds };
}

const online = async (service: ArenaService, ...users: string[]) => {
  for (const user of users) await service.streamOpened(user);
};

function matchOf(view: ArenaView) {
  if (view.phase !== 'match') throw new Error(`expected a match, got ${view.phase}`);
  return view.match;
}

describe('arena — admin topics', () => {
  it('pairs two students only when they picked the same topic, and plays that topic’s questions', async () => {
    const { service, builds } = setup();
    await online(service, 'alice', 'bob', 'dina');
    expect((await service.join('alice', COURSE, UNIT_1)).phase).toBe('queued');
    // نفس الكورس، تحدّي تاني — مستنية لوحدها.
    expect((await service.join('bob', COURSE, LESSON_3)).phase).toBe('queued');

    const match = matchOf(await service.join('dina', COURSE, UNIT_1));
    expect(match.opponent.player.name).toBe('مريم');
    expect(match.courseTitle).toBe('البرمجة · الوحدة الأولى');
    expect(builds).toEqual([{ course: COURSE, topics: [UNIT_1] }]);
  });

  it('says how many classmates wait in each topic', async () => {
    const { service } = setup();
    await online(service, 'alice', 'bob');
    await service.join('alice', COURSE, LESSON_3);
    const lobby = await service.lobby('bob');
    const topics = lobby.courses.find((course) => course.id === COURSE)!.topics;
    expect(topics.find((topic) => topic.id === LESSON_3)?.waiting).toBe(1);
    expect(topics.find((topic) => topic.id === UNIT_1)?.waiting).toBe(0);
  });

  it('refuses the whole course once it has topics, and a topic too small to fill a match', async () => {
    const { service } = setup();
    await online(service, 'alice');
    await expect(service.join('alice', COURSE)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.join('alice', COURSE, SMALL)).rejects.toBeInstanceOf(ForbiddenException);
    // كورس من غير تحديات زي ما كان.
    expect((await service.join('alice', FLAT)).phase).toBe('queued');
  });
});

describe('arena — a student’s own challenge', () => {
  it('opens a challenge classmates see, and the first to accept plays it', async () => {
    const { service, builds } = setup();
    await online(service, 'alice', 'bob', 'dina');
    const waiting = await service.createChallenge('alice', COURSE, [UNIT_1, LESSON_3]);
    expect(waiting.phase === 'queued' && waiting.challengeId).toBeTruthy();

    const lobby = await service.lobby('bob');
    expect(lobby.challenges).toHaveLength(1);
    const open = lobby.challenges[0]!;
    expect(open).toMatchObject({ by: { name: 'مريم' }, topicTitles: ['الوحدة الأولى', 'الدرس التالت بس'], mine: false });
    expect((await service.lobby('alice')).challenges[0]?.mine).toBe(true);
    // ولا userId بتاع حد تاني في الرد.
    expect(JSON.stringify(lobby.challenges)).not.toContain('alice');

    const match = matchOf(await service.acceptChallenge('bob', open.id));
    expect(match.opponent.player.name).toBe('مريم');
    expect(builds).toEqual([{ course: COURSE, topics: [UNIT_1, LESSON_3] }]);

    // اتقبل خلاص: مش في اللستة، والتالت بياخد ٤٠٤.
    expect((await service.lobby('dina')).challenges).toEqual([]);
    await expect(service.acceptChallenge('dina', open.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps a challenge inside its queue — another stream never sees it or accepts it', async () => {
    const { service } = setup();
    await online(service, 'alice', 'carol');
    const waiting = await service.createChallenge('alice', COURSE, [UNIT_1]);
    const id = waiting.phase === 'queued' ? waiting.challengeId! : '';
    expect((await service.lobby('carol')).challenges).toEqual([]);
    await expect(service.acceptChallenge('carol', id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('closes the challenge when its owner cancels, or opens another one', async () => {
    const { service } = setup();
    await online(service, 'alice', 'bob');
    const first = await service.createChallenge('alice', COURSE, [UNIT_1]);
    const second = await service.createChallenge('alice', COURSE, [LESSON_3]);
    const lobby = await service.lobby('bob');
    expect(lobby.challenges.map((challenge) => challenge.topicTitles)).toEqual([['الدرس التالت بس']]);
    await expect(service.acceptChallenge('bob', first.phase === 'queued' ? first.challengeId! : '')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await service.cancel('alice');
    expect((await service.lobby('bob')).challenges).toEqual([]);
    await expect(service.acceptChallenge('bob', second.phase === 'queued' ? second.challengeId! : '')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('drops a challenge whose owner went quiet', async () => {
    const { service, clock } = setup();
    await online(service, 'alice', 'bob');
    await service.createChallenge('alice', COURSE, [UNIT_1]);
    clock.now += ARENA_RULES.beatTtlMs + 1_000;
    await service.beat('bob');
    expect((await service.lobby('bob')).challenges).toEqual([]);
  });

  it('refuses a challenge with no topic of the course, or too few questions', async () => {
    const { service } = setup();
    await online(service, 'alice');
    await expect(service.createChallenge('alice', FLAT, [UNIT_1])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createChallenge('alice', COURSE, [SMALL])).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('pickQuestions — no repeats, one wording per idea', () => {
  const item = (id: string, group: string | null = null) => ({ versionId: id, facility: null, variantGroupKey: group });

  it('follows the given order instead of shuffling, and never deals two wordings of one idea', () => {
    const a = [item('v1', 'loops'), item('fresh'), item('v2', 'loops')];
    const b = [item('v1', 'loops'), item('fresh'), item('v2', 'loops')];
    const picked = pickQuestions(a, b, 7, () => 0, (items) => [...items].reverse());
    expect(picked.map((entry) => entry.versionId).sort()).toEqual(['fresh', 'v2']);
  });
});
