// Prisma 7 doesn't auto-load .env, and this spec runs outside Nest's bootstrap.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { ARENA_RULES } from '@ayman/contracts/arena';
import { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GameService } from '../quiz/game.service';
import { ArenaAccessService } from './arena-access.service';
import { abort, advance, answer, createMatch, leave, type MatchState } from './arena-engine';
import { ArenaRecordsService } from './arena-records.service';

const R = ARENA_RULES;

/**
 * الساحة على Postgres حقيقي: الماتش بيتكتب مرة واحدة، النقط بتتحسب بعد
 * السقفين، الرصيد والترتيب بيتقروا من نفس الجدول، و«مشترك» = اشتراك مدفوع.
 *
 * ⚠️ بيكتب ويمسح صفوف — على نسخة (`createdb`/`pg_dump`)، مش على قاعدة الديف
 * نفسها (`slim-throwaway-db-for-specs`). CI بيشغّله على قاعدة فاضية.
 */
describe('ArenaRecordsService (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;
  const records = new ArenaRecordsService(prisma);

  const tag = randomUUID().slice(0, 8);
  const users: string[] = [];
  let courseId: string;
  let subjectId: string;
  let systemId: string;
  let year: number;

  async function student(name: string, stream: 'general' | 'languages' = 'general'): Promise<string> {
    const id = `arena-${tag}-${users.length}`;
    await prisma.user.create({ data: { id, name, email: `${id}@example.test`, role: 'student' } });
    await prisma.studentProfile.create({
      data: {
        userId: id,
        fullName: `${name} عبد الرحمن محمد`,
        gender: 'female',
        phone: `011${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        governorateCode: (await prisma.governorate.findFirstOrThrow()).code,
        systemId,
        year,
        schoolStream: stream,
      },
    });
    users.push(id);
    return id;
  }

  /** ماتش خلص زي ما `ArenaService` بيسلّمه: الحالة بعد آخر خطوة. */
  function finished(a: string, b: string, winner: 0 | 1 | null, how: 'completed' | 'forfeit' | 'aborted' = 'completed'): MatchState {
    const [right, wrong] = [randomUUID(), randomUUID()];
    const state = createMatch({
      id: randomUUID(),
      bootId: 'spec',
      courseId,
      courseTitle: 'كورس الساحة',
      cohortLabel: 'تانية · عربي',
      players: [
        { userId: a, name: 'أ', image: null },
        { userId: b, name: 'ب', image: null },
      ],
      questions: [
        { id: randomUUID(), type: 'true_false', stemHtml: 's', options: [{ id: right, bodyHtml: 'صح' }, { id: wrong, bodyHtml: 'غلط' }], correct: [right] },
      ],
      now: Date.now() - 60_000,
    });
    const t = state.startedAt + R.vsMs;
    advance(state, t);
    if (how === 'aborted') abort(state, t + 100);
    else if (how === 'forfeit') leave(state, winner === 0 ? 1 : 0, t + 100);
    else {
      if (winner !== null) answer(state, winner, 0, right, t + 100);
      else advance(state, t + R.questionMs);
      advance(state, t + R.questionMs + R.revealMs + 1);
    }
    return state;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const system = await prisma.educationSystem.findFirstOrThrow({ where: { slug: 'bacalorya' } });
    const academicYear = await prisma.academicYear.findFirstOrThrow({ where: { systemId: system.id } });
    systemId = system.id;
    year = academicYear.year;
    const subject = await prisma.subject.findFirstOrThrow();
    subjectId = subject.id;
    const owner = `arena-${tag}-owner`;
    await prisma.user.create({ data: { id: owner, name: 'owner', email: `${owner}@example.test`, role: 'admin' } });
    users.push(owner);
    const course = await prisma.course.create({
      data: {
        slug: `arena-${tag}`,
        title: 'كورس الساحة',
        status: 'published',
        publishedAt: new Date(),
        systemId,
        year,
        subjectId,
        instructorId: owner,
        requiresGrant: true,
      },
    });
    courseId = course.id;
  });

  afterAll(async () => {
    await prisma.arenaMatch.deleteMany({ where: { OR: [{ playerAId: { in: users } }, { playerBId: { in: users } }] } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('writes a finished match once, with its rounds, and pays the winner', async () => {
    const [a, b] = [await student('مريم'), await student('ملك')];
    const state = finished(a, b, 0);
    const awards = await records.record(state);
    expect(awards[0]).toMatchObject({ points: R.points.win, capped: false, total: R.points.win });
    expect(awards[1]).toMatchObject({ points: 0, total: 0 });

    const row = await prisma.arenaMatch.findUniqueOrThrow({ where: { id: state.id }, include: { rounds: true } });
    expect(row).toMatchObject({ outcome: 'completed', winnerId: a, scoreA: 1, scoreB: 0, pointsA: R.points.win });
    expect(row.rounds).toHaveLength(1);
    expect(row.rounds[0]).toMatchObject({ winnerSide: 'a', reason: 'correct', wasRightA: true });

    // مرة تانية لنفس الماتش (ريستارت في نص الكتابة) = نفس النتيجة، ومفيش نقط زيادة.
    const again = await records.record(state);
    expect(again[0].points).toBe(R.points.win);
    expect((await prisma.arenaStat.findUniqueOrThrow({ where: { userId: a } })).points).toBe(R.points.win);
    expect(await prisma.arenaMatch.count({ where: { id: state.id } })).toBe(1);
  });

  it('pays a draw to both and a forfeit to whoever stayed', async () => {
    const [a, b] = [await student('سلمى'), await student('نور')];
    const draw = await records.record(finished(a, b, null));
    expect(draw.map((award) => award.points)).toEqual([R.points.draw, R.points.draw]);
    const forfeit = await records.record(finished(a, b, 1, 'forfeit'));
    expect(forfeit.map((award) => award.points)).toEqual([0, R.points.win]);
    const stat = await prisma.arenaStat.findUniqueOrThrow({ where: { userId: b } });
    expect(stat).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0 });
  });

  it('pays nothing and counts nothing for a match cut by a restart', async () => {
    const [a, b] = [await student('هنا'), await student('ليلى')];
    const awards = await records.record(finished(a, b, null, 'aborted'));
    expect(awards.map((award) => award.points)).toEqual([0, 0]);
    expect(await prisma.arenaStat.findUnique({ where: { userId: a } })).toBeNull();
    expect((await prisma.arenaMatch.findFirstOrThrow({ where: { playerAId: a } })).outcome).toBe('aborted');
  });

  it('stops paying the same two after the daily pair limit, and says it was capped', async () => {
    const [a, b] = [await student('دينا'), await student('رنا')];
    for (let i = 0; i < R.pairScoredPerDay; i++) {
      expect((await records.record(finished(a, b, 0)))[0].points).toBe(R.points.win);
    }
    const capped = await records.record(finished(a, b, 0));
    expect(capped[0]).toMatchObject({ points: 0, capped: true });
    expect((await prisma.arenaStat.findUniqueOrThrow({ where: { userId: a } })).wins).toBe(R.pairScoredPerDay + 1);
  });

  it('caps a student at the daily ceiling across different opponents', async () => {
    const star = await student('فرح');
    let total = 0;
    let lastCapped = false;
    for (let i = 0; total < R.dailyPointsCap + R.points.win; i++) {
      const rival = await student(`خصم${i}`);
      const [award] = await records.record(finished(star, rival, 0));
      total += R.points.win;
      lastCapped = award.capped;
      if (award.points === 0) break;
    }
    expect(lastCapped).toBe(true);
    expect((await records.me(star, { systemId, year, stream: 'general' })).todayPoints).toBe(R.dailyPointsCap);
  });

  it('ranks the cohort by arena points, and keeps the languages stream out of it', async () => {
    const [top, second, languages] = [await student('آية'), await student('جنى'), await student('لارا', 'languages')];
    await records.record(finished(top, second, 0));
    await records.record(finished(top, second, 0));
    await records.record(finished(languages, second, 0));
    const cohort = { systemId, year, stream: 'general' as const };
    const board = await records.board(second, cohort, 'تانية · عربي');
    const names = board.rows.map((row) => row.name);
    expect(names).toContain('آية عبد الرحمن');
    expect(names).not.toContain('لارا عبد الرحمن');
    const ranks = board.rows.map((row) => row.rank);
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
    const me = board.rows.find((row) => row.isMe) ?? board.me;
    expect(me?.isMe).toBe(true);
    expect((await records.me(top, cohort)).rank).toBeLessThan((await records.me(second, cohort)).rank ?? Infinity);
  });

  /**
   * «شيلني منها» — an instructor testing his own arena, or a student promoted
   * to staff with the old profile left behind, can end up with a real
   * `arena_stats` row: nothing upstream of a recorded match reads `role`.
   * `board()`'s main list already excludes anyone but `role: 'student'`; this
   * is the same guarantee for «مكانك» and for the one-row fallback `board()`
   * uses when that account is not in the top of the table.
   */
  it('never ranks a non-student, even one with leftover cohort data', async () => {
    const promoted = `arena-${tag}-promoted`;
    await prisma.user.create({
      data: { id: promoted, name: 'مدرّس', email: `${promoted}@example.test`, role: 'admin' },
    });
    await prisma.studentProfile.create({
      data: {
        userId: promoted,
        fullName: 'مدرّس سابقًا طالب',
        gender: 'male',
        phone: `011${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        governorateCode: (await prisma.governorate.findFirstOrThrow()).code,
        systemId,
        year,
        schoolStream: 'general',
      },
    });
    users.push(promoted);
    const opponent = await student('صديقه');
    const cohort = { systemId, year, stream: 'general' as const };

    await records.record(finished(promoted, opponent, 0));

    // The row is real — `record()` does not know or care about roles.
    expect((await prisma.arenaStat.findUniqueOrThrow({ where: { userId: promoted } })).played).toBe(1);

    const mine = await records.me(promoted, cohort);
    expect(mine).toMatchObject({ points: 0, wins: 0, played: 0, rank: null, todayPoints: 0 });

    const board = await records.board(promoted, cohort, 'تانية · عربي');
    expect(board.rows.find((row) => row.isMe)).toBeUndefined();
    expect(board.me).toBeNull();
    // Nobody ELSE lost a real row over this — the opponent is unaffected.
    expect((await records.me(opponent, cohort)).played).toBe(1);
  });

  it('shows the admin the latest matches and the top of the table', async () => {
    const overview = await records.admin();
    expect(overview.totals.matchesToday).toBeGreaterThan(0);
    expect(overview.recent[0]?.a.name).toBeTruthy();
    expect(overview.top.length).toBeGreaterThan(0);
  });

  describe('who counts as subscribed', () => {
    const game = { arenaPoolCounts: async () => new Map([[courseId, 30]]) } as unknown as GameService;
    const access = () => new ArenaAccessService(prisma, game);

    async function enrolled(name: string): Promise<string> {
      const id = await student(name);
      await prisma.enrollment.create({ data: { userId: id, courseId, status: 'active' } });
      return id;
    }

    it('lets a paid course grant in', async () => {
      const id = await enrolled('بسمة');
      await prisma.accessGrant.create({ data: { userId: id, scope: 'course', courseId, source: 'admin' } });
      const result = await access().eligibility(id);
      expect(result.blocked).toBeNull();
      expect(result.courses).toEqual([{ id: courseId, title: 'كورس الساحة', questions: 30, playable: true }]);
      expect(result.cohortLabel).toContain('عربي');
    });

    it('lets a single month in', async () => {
      const id = await enrolled('يارا');
      const month = await prisma.courseMonth.create({ data: { courseId, monthIndex: 1, title: 'شهر' } });
      await prisma.accessGrant.create({ data: { userId: id, scope: 'course_month', courseId, monthId: month.id, source: 'admin' } });
      expect((await access().eligibility(id)).courses.map((c) => c.id)).toEqual([courseId]);
    });

    it('keeps out the free platform grant, a revoked grant and an expired one', async () => {
      const free = await enrolled('حلا');
      await prisma.accessGrant.create({ data: { userId: free, scope: 'platform', source: 'auto_free' } });
      expect(await access().eligibility(free)).toMatchObject({ blocked: 'no_subscription', courses: [] });

      const revoked = await enrolled('رؤى');
      await prisma.accessGrant.create({
        data: { userId: revoked, scope: 'course', courseId, source: 'admin', revokedAt: new Date() },
      });
      expect((await access().eligibility(revoked)).blocked).toBe('no_subscription');

      const expired = await enrolled('تسنيم');
      await prisma.accessGrant.create({
        data: {
          userId: expired,
          scope: 'course',
          courseId,
          source: 'admin',
          validFrom: new Date(Date.now() - 2 * 86_400_000),
          validUntil: new Date(Date.now() - 1_000),
        },
      });
      expect((await access().eligibility(expired)).blocked).toBe('no_subscription');
    });

    it('asks for the year before anything else', async () => {
      const id = await student('مي');
      await prisma.studentProfile.update({ where: { userId: id }, data: { year: null } });
      expect(await access().eligibility(id)).toMatchObject({ blocked: 'no_year', cohort: null });
    });
  });
});
