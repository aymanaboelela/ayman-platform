import { Injectable } from '@nestjs/common';
import {
  LEAGUE_TABLE_SIZE,
  daysBetween,
  leaguePoints,
  leagueWeekStart,
  shiftDayKey,
  type LeagueCounts,
  type LeaguePayload,
  type LeagueRow,
  type LeagueSummary,
} from '@ayman/contracts/engagement';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDate, cairoDayKey, studentJoins } from '../analytics/analytics-shared';

/** How long one school year's table is reused before it is summed again. */
const TABLE_TTL_MS = 60_000;

interface Standing {
  userId: string;
  counts: LeagueCounts;
  points: number;
}

interface CountRow {
  user_id: string;
  lesson: number;
  quiz: number;
  homework: number;
  daily: number;
  daily_right: number;
  focus: number;
}

const ZERO: LeagueCounts = { lesson: 0, quiz: 0, homework: 0, daily: 0, dailyRight: 0, focus: 0 };

/**
 * Most points first; a tie shares a rank («1, 2, 2, 4»), and inside a tie the
 * order is the user id — arbitrary, but the same on every read.
 *
 * Exported for the spec.
 */
export function rankStandings(standings: readonly Standing[]): Array<Standing & { rank: number }> {
  const sorted = standings
    .filter((standing) => standing.points > 0)
    .sort((a, b) => b.points - a.points || a.userId.localeCompare(b.userId));
  let rank = 0;
  return sorted.map((standing, index) => {
    if (index === 0 || sorted[index - 1]!.points !== standing.points) rank = index + 1;
    return { ...standing, rank };
  });
}

/**
 * «دوري الأسبوع» — the week's work in points, ranked against the same school
 * year, Saturday to Friday on the Cairo calendar.
 *
 * ## Summed, never stored
 *
 * The points are counted from rows that already exist: lectures finished,
 * quizzes passed, homework handed in, the daily card, finished focus
 * sittings. Nothing is awarded, so nothing can be awarded twice or lost, and
 * a reversed grade is reversed on the table too.
 *
 * ## One table per year, a minute old at most
 *
 * The whole year's table is summed in one query and reused for a minute — a
 * busy evening is many students reading the same table. The reader's OWN
 * counts are always fresh and spliced in before ranking, so a lecture
 * finished a second ago shows on their row at once.
 *
 * ## Names
 *
 * First name only, and none at all for a student who opted out
 * (`league_settings.hidden`) — they still play, shown as «طالب من المنصة».
 */
@Injectable()
export class LeagueService {
  private readonly tables = new Map<string, { at: number; standings: Standing[] }>();

  constructor(private readonly prisma: PrismaService) {}

  /** The dashboard's row: the same ranking, without the names or last week. */
  async summary(userId: string, now: Date = new Date()): Promise<LeagueSummary> {
    const { today, to, ranked, myRow, myCounts } = await this.standing(userId, now);
    return {
      rank: myRow?.rank ?? null,
      points: leaguePoints(myCounts),
      players: ranked.length,
      daysLeft: daysBetween(today, to),
    };
  }

  async forUser(userId: string, now: Date = new Date()): Promise<LeaguePayload> {
    const [{ today, from, to, year, ranked, myRow, myCounts }, setting] = await Promise.all([
      this.standing(userId, now),
      this.prisma.leagueSetting.findUnique({ where: { userId }, select: { hidden: true } }),
    ]);
    const previous = await this.table(year, shiftDayKey(from, -7), from, now);

    const shown = ranked.slice(0, LEAGUE_TABLE_SIZE);
    if (myRow && !shown.includes(myRow)) shown.push(myRow);
    const champions = rankStandings(previous).slice(0, 3);

    const people = await this.people([...shown, ...champions].map((standing) => standing.userId));
    const row = (standing: Standing & { rank: number }): LeagueRow => {
      const person = people.get(standing.userId);
      const named = person && !person.hidden;
      return {
        rank: standing.rank,
        name: named && person.name ? person.name : null,
        image: named ? person.image : null,
        points: standing.points,
        me: standing.userId === userId,
      };
    };

    return {
      week: { from, to: shiftDayKey(to, -1) },
      daysLeft: daysBetween(today, to),
      year,
      players: ranked.length,
      rows: shown.map(row),
      me: {
        rank: myRow?.rank ?? null,
        points: leaguePoints(myCounts),
        counts: myCounts,
        hidden: setting?.hidden ?? false,
      },
      lastWeek: champions.map(row),
    };
  }

  /** This week's ranked table with the reader's own row counted fresh. */
  private async standing(userId: string, now: Date) {
    const today = cairoDayKey(now);
    const from = leagueWeekStart(today);
    const to = shiftDayKey(from, 7);
    const profile = await this.prisma.studentProfile.findUnique({ where: { userId }, select: { year: true } });
    const year = profile?.year ?? null;

    const [table, mine] = await Promise.all([
      this.table(year, from, to, now),
      this.counts(year, from, to, now, userId),
    ]);
    const myCounts = mine[0]?.counts ?? ZERO;
    const standings = [
      ...table.filter((standing) => standing.userId !== userId),
      ...(profile ? [{ userId, counts: myCounts, points: leaguePoints(myCounts) }] : []),
    ];
    const ranked = rankStandings(standings);
    const myRow = ranked.find((standing) => standing.userId === userId);
    return { today, from, to, year, ranked, myRow, myCounts };
  }

  async setHidden(userId: string, hidden: boolean): Promise<void> {
    await this.prisma.leagueSetting.upsert({
      where: { userId },
      create: { userId, hidden },
      update: { hidden },
    });
  }

  private async table(year: number | null, from: string, to: string, now: Date): Promise<Standing[]> {
    const key = `${year ?? '-'}:${from}`;
    const cached = this.tables.get(key);
    if (cached && now.getTime() - cached.at < TABLE_TTL_MS) return cached.standings;
    const standings = await this.counts(year, from, to, now, null);
    this.tables.set(key, { at: now.getTime(), standings });
    // A week ago's table is final; anything older than that is dead weight.
    for (const [old, entry] of this.tables) {
      if (now.getTime() - entry.at > 15 * 86_400_000) this.tables.delete(old);
    }
    return standings;
  }

  /**
   * Every source, one row per student, for the week `[from, to)`. With
   * `only`, the same sums for one student — the fresh half of the read.
   *
   * Each window carries a coarse UTC bound beside the Cairo one so the
   * timestamp indexes can still be used; the Cairo date decides.
   */
  private async counts(
    year: number | null,
    from: string,
    to: string,
    now: Date,
    only: string | null,
  ): Promise<Standing[]> {
    const loose = (column: string) => Prisma.sql`
      ${Prisma.raw(column)} >= ${from}::date - interval '1 day' AND ${Prisma.raw(column)} < ${to}::date + interval '1 day'
      AND ${cairoDate(column)} >= ${from}::date AND ${cairoDate(column)} < ${to}::date`;
    const who = (column: string) => (only ? Prisma.sql`AND ${Prisma.raw(column)} = ${only}` : Prisma.empty);

    const rows = await this.prisma.$queryRaw<CountRow[]>(Prisma.sql`
      WITH events AS (
        SELECT e."user_id", 'lesson' AS source, count(*)::int AS n
        FROM "app"."lesson_progress" lp
        JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id"
        JOIN "app"."lessons" l ON l."id" = lp."lesson_id"
        WHERE l."kind" <> 'quiz' AND ${loose('lp."completed_at"')} ${who('e."user_id"')}
        GROUP BY 1
        UNION ALL
        SELECT a."user_id", 'quiz', count(DISTINCT a."quiz_id")::int
        FROM "app"."quiz_attempts" a
        WHERE a."state" = 'submitted' AND a."passed" AND ${loose('a."submitted_at"')} ${who('a."user_id"')}
        GROUP BY 1
        UNION ALL
        SELECT h."user_id", 'homework', count(DISTINCT h."lesson_id")::int
        FROM "app"."homework_submissions" h
        WHERE ${loose('h."submitted_at"')} ${who('h."user_id"')}
        GROUP BY 1
        UNION ALL
        SELECT d."user_id", 'daily', count(*)::int
        FROM "app"."daily_answers" d
        WHERE d."answered_at" IS NOT NULL AND d."day" >= ${from}::date AND d."day" < ${to}::date ${who('d."user_id"')}
        GROUP BY 1
        UNION ALL
        SELECT d."user_id", 'daily_right', count(*)::int
        FROM "app"."daily_answers" d
        WHERE d."was_right" AND d."day" >= ${from}::date AND d."day" < ${to}::date ${who('d."user_id"')}
        GROUP BY 1
        UNION ALL
        SELECT f."user_id", 'focus', count(*)::int
        FROM "app"."focus_sessions" f
        WHERE ${loose('f."started_at"')} ${who('f."user_id"')}
          AND (f."completed" OR (f."ended_at" IS NULL AND f."started_at" + make_interval(mins => f."minutes") <= ${now}))
        GROUP BY 1
      )
      SELECT ev."user_id",
        coalesce(sum(ev.n) FILTER (WHERE ev.source = 'lesson'), 0)::int AS lesson,
        coalesce(sum(ev.n) FILTER (WHERE ev.source = 'quiz'), 0)::int AS quiz,
        coalesce(sum(ev.n) FILTER (WHERE ev.source = 'homework'), 0)::int AS homework,
        coalesce(sum(ev.n) FILTER (WHERE ev.source = 'daily'), 0)::int AS daily,
        coalesce(sum(ev.n) FILTER (WHERE ev.source = 'daily_right'), 0)::int AS daily_right,
        coalesce(sum(ev.n) FILTER (WHERE ev.source = 'focus'), 0)::int AS focus
      FROM events ev
      ${studentJoins('ev."user_id"')}
      WHERE sp."year" IS NOT DISTINCT FROM ${year}::int
      GROUP BY ev."user_id"
    `);
    return rows.map((row) => {
      const counts: LeagueCounts = {
        lesson: row.lesson,
        quiz: row.quiz,
        homework: row.homework,
        daily: row.daily,
        dailyRight: row.daily_right,
        focus: row.focus,
      };
      return { userId: row.user_id, counts, points: leaguePoints(counts) };
    });
  }

  private async people(ids: readonly string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, { name: string; image: string | null; hidden: boolean }>();
    const [users, settings] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, name: true, image: true, studentProfile: { select: { fullName: true } } },
      }),
      this.prisma.leagueSetting.findMany({ where: { userId: { in: unique }, hidden: true }, select: { userId: true } }),
    ]);
    const hidden = new Set(settings.map((row) => row.userId));
    return new Map(
      users.map((user) => {
        const full = user.studentProfile?.fullName?.trim() || user.name?.trim() || '';
        return [user.id, { name: full.split(/\s+/u)[0] ?? '', image: user.image, hidden: hidden.has(user.id) }];
      }),
    );
  }
}
