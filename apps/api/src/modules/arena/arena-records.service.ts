import { Injectable } from '@nestjs/common';
import {
  arenaAwardedPoints,
  arenaBasePoints,
  competitionRanks,
  type AdminArena,
  type ArenaBoard,
  type ArenaBoardRow,
  type ArenaMe,
} from '@ayman/contracts/arena';
import { arenaCopy } from '@ayman/contracts/copy/arena';
import { formatCopy } from '@ayman/contracts/format';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { shortName } from '../progress/cohort-rank.service';
import { outcomeFor, type EngineAward, type MatchState } from './arena-engine';
import { cairoDayStart, type ArenaCohort } from './arena-matchmaking';
import type { ArenaRecordsPort } from './arena.ports';

/** أوائل الساحة في الشاشة. */
const BOARD_SIZE = 20;

interface BoardRow {
  user_id: string;
  full_name: string | null;
  name: string | null;
  image: string | null;
  points: number;
  wins: number;
  played: number;
}

/**
 * الساحة في Postgres: الماتش بعد ما يخلص، ورصيد كل طالب، والترتيب.
 *
 * ## النقط منفصلة عن الترتيب الأكاديمي، عن قصد
 *
 * نقط الساحة في `arena_stats` لوحدها، ومابتدخلش `RANK_POINTS` ولا
 * `CohortRankService` خالص. «ترتيبي» بيقيس الشغل الحقيقي (كويز، امتحان،
 * واجب)، والساحة لعبة سرعة بين اتنين — لو دخلت الترتيب، اتنين صحاب يقدروا
 * يلعبوا مع بعض ويطلعوا الأوائل من غير ما يذاكروا حاجة. وحتى هنا فيه سقفين:
 * `dailyPointsCap` في اليوم، ونفس المنافس بيجيب نقط `pairScoredPerDay` ماتشات
 * بس في اليوم.
 */
@Injectable()
export class ArenaRecordsService implements ArenaRecordsPort {
  constructor(private readonly prisma: PrismaService) {}

  async record(state: MatchState): Promise<[EngineAward, EngineAward]> {
    const end = state.end;
    if (!end) throw new Error(`match ${state.id} has not ended`);
    const [a, b] = [state.players[0].userId, state.players[1].userId];
    const scored = end.reason === 'completed' || end.reason === 'forfeit';
    const outcomes = [outcomeFor(state, 0), outcomeFor(state, 1)] as const;
    const endedAt = new Date(end.at);

    return this.prisma.$transaction(async (tx) => {
      // نفس الماتش اتكتب قبل كده (ريستارت في نص الكتابة، أو نهايتين) — نفس النتيجة.
      const existing = await tx.arenaMatch.findUnique({
        where: { id: state.id },
        select: { pointsA: true, pointsB: true },
      });
      if (existing) {
        const totals = await this.totals(tx, [a, b]);
        return [
          { points: existing.pointsA, capped: false, total: totals.get(a) ?? 0 },
          { points: existing.pointsB, capped: false, total: totals.get(b) ?? 0 },
        ];
      }

      const dayStart = cairoDayStart(endedAt);
      const today = await this.todayPoints(tx, [a, b], dayStart);
      const pairToday = await tx.arenaMatch.count({
        where: {
          endedAt: { gte: dayStart },
          outcome: { in: ['completed', 'forfeit'] },
          OR: [
            { playerAId: a, playerBId: b },
            { playerAId: b, playerBId: a },
          ],
        },
      });
      const awards = ([0, 1] as const).map((side) =>
        scored
          ? arenaAwardedPoints({
              base: arenaBasePoints(outcomes[side]),
              todayPoints: today.get(state.players[side].userId) ?? 0,
              pairScoredToday: pairToday,
            })
          : { points: 0, capped: false },
      );

      // سؤال اتمسح من البنك في نص الماتش — النتيجة تتكتب، من غير الربط بيه.
      const ids = state.questions.map((question) => question.id);
      const stillThere = new Set(
        (await tx.questionVersion.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((v) => v.id),
      );

      await tx.arenaMatch.create({
        data: {
          id: state.id,
          courseId: state.courseId,
          playerAId: a,
          playerBId: b,
          scoreA: state.players[0].score,
          scoreB: state.players[1].score,
          winnerId: end.winner === null ? null : state.players[end.winner].userId,
          outcome: end.reason,
          pointsA: awards[0]!.points,
          pointsB: awards[1]!.points,
          questionCount: state.questions.length,
          cohortLabel: state.cohortLabel,
          startedAt: new Date(state.startedAt),
          endedAt,
          rounds: {
            create: state.rounds.flatMap((round, position) =>
              round.reason === null
                ? []
                : [
                    {
                      position,
                      questionVersionId: stillThere.has(ids[position]!) ? ids[position]! : null,
                      winnerSide: round.winner === null ? null : round.winner === 0 ? 'a' : 'b',
                      reason: round.reason,
                      optionA: round.answers[0]?.optionId ?? null,
                      msA: round.answers[0]?.ms ?? null,
                      wasRightA: round.answers[0]?.right ?? null,
                      optionB: round.answers[1]?.optionId ?? null,
                      msB: round.answers[1]?.ms ?? null,
                      wasRightB: round.answers[1]?.right ?? null,
                    },
                  ],
            ),
          },
        },
      });

      if (scored) {
        for (const side of [0, 1] as const) {
          const outcome = outcomes[side];
          const counts = {
            wins: outcome === 'win' ? 1 : 0,
            draws: outcome === 'draw' ? 1 : 0,
            losses: outcome === 'loss' ? 1 : 0,
          };
          await tx.arenaStat.upsert({
            where: { userId: state.players[side].userId },
            create: {
              userId: state.players[side].userId,
              points: awards[side]!.points,
              played: 1,
              lastPlayedAt: endedAt,
              ...counts,
            },
            update: {
              points: { increment: awards[side]!.points },
              played: { increment: 1 },
              wins: { increment: counts.wins },
              draws: { increment: counts.draws },
              losses: { increment: counts.losses },
              lastPlayedAt: endedAt,
            },
          });
        }
      }

      const totals = await this.totals(tx, [a, b]);
      return [
        { ...awards[0]!, total: totals.get(a) ?? 0 },
        { ...awards[1]!, total: totals.get(b) ?? 0 },
      ];
    });
  }

  async me(userId: string, cohort: ArenaCohort | null): Promise<Omit<ArenaMe, 'name' | 'image'>> {
    const [stat, today] = await Promise.all([
      this.prisma.arenaStat.findUnique({ where: { userId } }),
      this.todayPoints(this.prisma, [userId], cairoDayStart(new Date())),
    ]);
    const rank = stat && stat.played > 0 && cohort ? await this.rankOf(stat.points, cohort) : null;
    return {
      points: stat?.points ?? 0,
      wins: stat?.wins ?? 0,
      draws: stat?.draws ?? 0,
      losses: stat?.losses ?? 0,
      played: stat?.played ?? 0,
      rank,
      todayPoints: today.get(userId) ?? 0,
    };
  }

  async board(userId: string, cohort: ArenaCohort | null, cohortLabel: string): Promise<ArenaBoard> {
    if (!cohort) return { cohortLabel, rows: [], me: null };
    const rows = await this.prisma.$queryRaw<BoardRow[]>(Prisma.sql`
      SELECT s."user_id", sp."full_name", u."name", u."image", s."points", s."wins", s."played"
      FROM "app"."arena_stats" s
      JOIN "app"."users" u ON u."id" = s."user_id" AND u."role" = 'student' AND u."banned_at" IS NULL
      JOIN "app"."student_profiles" sp ON sp."user_id" = s."user_id"
      WHERE s."played" > 0 AND ${inCohort(cohort)}
      ORDER BY s."points" DESC, s."wins" DESC, s."last_played_at" ASC NULLS LAST, s."user_id" ASC
      LIMIT ${BOARD_SIZE}
    `);
    const ranks = competitionRanks(rows.map((row) => row.points));
    const out: ArenaBoardRow[] = rows.map((row, index) => ({
      rank: ranks[index]!,
      name: shortName(row.full_name || row.name || ''),
      image: row.image,
      points: row.points,
      wins: row.wins,
      played: row.played,
      isMe: row.user_id === userId,
    }));

    let me = out.find((row) => row.isMe) ?? null;
    if (!me) {
      const [mine] = await this.prisma.$queryRaw<BoardRow[]>(Prisma.sql`
        SELECT s."user_id", sp."full_name", u."name", u."image", s."points", s."wins", s."played"
        FROM "app"."arena_stats" s
        JOIN "app"."users" u ON u."id" = s."user_id"
        LEFT JOIN "app"."student_profiles" sp ON sp."user_id" = s."user_id"
        WHERE s."user_id" = ${userId} AND s."played" > 0
      `);
      if (mine) {
        me = {
          rank: await this.rankOf(mine.points, cohort),
          name: shortName(mine.full_name || mine.name || ''),
          image: mine.image,
          points: mine.points,
          wins: mine.wins,
          played: mine.played,
          isMe: true,
        };
      }
    }
    return { cohortLabel, rows: out, me };
  }

  /** «الساحة» في لوحة الألعاب — قراية بس. */
  async admin(): Promise<AdminArena> {
    const now = new Date();
    const dayStart = cairoDayStart(now);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [matchesToday, matchesWeek, playersWeek, recent, top, years] = await Promise.all([
      this.prisma.arenaMatch.count({ where: { endedAt: { gte: dayStart } } }),
      this.prisma.arenaMatch.count({ where: { endedAt: { gte: weekStart } } }),
      this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(DISTINCT u)::int AS n FROM (
          SELECT "player_a_id" AS u FROM "app"."arena_matches" WHERE "ended_at" >= ${weekStart}
          UNION ALL
          SELECT "player_b_id" FROM "app"."arena_matches" WHERE "ended_at" >= ${weekStart}
        ) x
      `),
      this.prisma.arenaMatch.findMany({
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        take: 30,
        select: {
          id: true,
          startedAt: true,
          cohortLabel: true,
          scoreA: true,
          scoreB: true,
          pointsA: true,
          pointsB: true,
          playerAId: true,
          playerBId: true,
          winnerId: true,
          outcome: true,
          questionCount: true,
          course: { select: { title: true } },
          playerA: { select: { name: true, studentProfile: { select: { fullName: true } } } },
          playerB: { select: { name: true, studentProfile: { select: { fullName: true } } } },
        },
      }),
      this.prisma.arenaStat.findMany({
        where: { played: { gt: 0 } },
        orderBy: [{ points: 'desc' }, { wins: 'desc' }],
        take: 10,
        select: {
          points: true,
          wins: true,
          played: true,
          user: {
            select: {
              name: true,
              image: true,
              studentProfile: { select: { fullName: true, year: true, systemId: true, schoolStream: true } },
            },
          },
        },
      }),
      this.prisma.academicYear.findMany({ select: { systemId: true, year: true, labelAr: true } }),
    ]);

    const yearLabel = new Map(years.map((y) => [`${y.systemId}|${y.year}`, y.labelAr]));
    const labelOf = (profile: { year: number | null; systemId: string | null; schoolStream: 'general' | 'languages' | null } | null) => {
      if (!profile || profile.year == null) return '';
      const year =
        yearLabel.get(`${profile.systemId}|${profile.year}`) ??
        years.find((y) => y.year === profile.year)?.labelAr ??
        '';
      return profile.schoolStream
        ? formatCopy(arenaCopy.cohort.label, { year, stream: arenaCopy.cohort[profile.schoolStream] })
        : year;
    };
    const nameOf = (user: { name: string; studentProfile: { fullName: string } | null }) =>
      user.studentProfile?.fullName || user.name;

    return {
      totals: { matchesToday, matchesWeek, playersWeek: playersWeek[0]?.n ?? 0 },
      recent: recent.map((match) => ({
        id: match.id,
        startedAt: match.startedAt.toISOString(),
        courseTitle: match.course?.title ?? null,
        cohortLabel: match.cohortLabel,
        a: { name: nameOf(match.playerA), score: match.scoreA, points: match.pointsA },
        b: { name: nameOf(match.playerB), score: match.scoreB, points: match.pointsB },
        winner: match.winnerId === null ? null : match.winnerId === match.playerAId ? 'a' : 'b',
        outcome: match.outcome,
        questions: match.questionCount,
      })),
      top: top.map((row) => ({
        name: row.user.studentProfile?.fullName || row.user.name,
        image: row.user.image,
        cohortLabel: labelOf(row.user.studentProfile),
        points: row.points,
        wins: row.wins,
        played: row.played,
      })),
    };
  }

  // ── جوّه ───────────────────────────────────────────────────────────────

  /** ترتيب تنافسي: واحد + كام واحد في الدفعة نقطه أكتر. */
  private async rankOf(points: number, cohort: ArenaCohort): Promise<number> {
    const [row] = await this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(*)::int AS n
      FROM "app"."arena_stats" s
      JOIN "app"."users" u ON u."id" = s."user_id" AND u."role" = 'student' AND u."banned_at" IS NULL
      JOIN "app"."student_profiles" sp ON sp."user_id" = s."user_id"
      WHERE s."played" > 0 AND s."points" > ${points} AND ${inCohort(cohort)}
    `);
    return (row?.n ?? 0) + 1;
  }

  private async todayPoints(
    client: Pick<PrismaService, '$queryRaw'>,
    userIds: string[],
    dayStart: Date,
  ): Promise<Map<string, number>> {
    const rows = await client.$queryRaw<Array<{ user_id: string; points: number }>>(Prisma.sql`
      SELECT x.u AS user_id, COALESCE(sum(x.p), 0)::int AS points FROM (
        SELECT "player_a_id" AS u, "points_a" AS p FROM "app"."arena_matches"
        WHERE "ended_at" >= ${dayStart} AND "player_a_id" IN (${Prisma.join(userIds)})
        UNION ALL
        SELECT "player_b_id", "points_b" FROM "app"."arena_matches"
        WHERE "ended_at" >= ${dayStart} AND "player_b_id" IN (${Prisma.join(userIds)})
      ) x
      GROUP BY x.u
    `);
    return new Map(rows.map((row) => [row.user_id, row.points]));
  }

  private async totals(client: Pick<PrismaService, 'arenaStat'>, userIds: string[]): Promise<Map<string, number>> {
    const rows = await client.arenaStat.findMany({ where: { userId: { in: userIds } }, select: { userId: true, points: true } });
    return new Map(rows.map((row) => [row.userId, row.points]));
  }
}

/**
 * نفس دفعة الطابور بالظبط (`queueKeyOf`): نفس السنة، ونفس النظام ونوع
 * المدرسة — والمجهول مع المجهول (`IS NOT DISTINCT FROM`).
 */
function inCohort(cohort: ArenaCohort): Prisma.Sql {
  return Prisma.sql`sp."year" = ${cohort.year}
    AND sp."system_id" IS NOT DISTINCT FROM ${cohort.systemId}::uuid
    AND sp."school_stream"::text IS NOT DISTINCT FROM ${cohort.stream}::text`;
}
