import { Injectable } from '@nestjs/common';
import { GAME_MODES, type GameLevel, type GameMode, type GameOutcome } from '@ayman/contracts/quiz/game';
import {
  GAME_STATS_HARDEST,
  GAME_STATS_MIN_ANSWERS,
  GAME_STATS_RECENT,
  GAME_STATS_TOP,
  type GamePlayerRow,
  type GameSessionRow,
  type GameStats,
  type GameStatsQuery,
  type StudentGameSummary,
} from '@ayman/contracts/quiz/game-stats';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDate, cairoHour, clampFraction, dayKeys, rate, studentJoins } from '../analytics/analytics-shared';
import { periodStart, seriesStart } from '../analytics/video-analytics-math';

interface SessionSqlRow {
  id: string;
  user_id: string;
  name: string;
  mode: GameMode;
  level: GameLevel;
  course_title: string | null;
  scope_title: string | null;
  started_at: Date;
  duration_seconds: number;
  question_count: number;
  answered: number;
  correct: number;
  score: number;
  outcome: GameOutcome | null;
}

interface PlayerSqlRow {
  user_id: string;
  name: string;
  plays: number;
  seconds: number;
  best: number | null;
  last: Date | null;
}

/** طول «نص السؤال» في «أصعب الأسئلة» — سطر أو اتنين، مش السؤال كله. */
const STEM_CHARS = 160;

/**
 * «إحصائيات الألعاب» — كله aggregates في Postgres على `game_sessions`
 * و`game_answers`، ومفيش صف جولة بيدخل Node إلا القوايم المقصوصة (أول ١٠،
 * آخر ٥٠).
 *
 * جولة = صف اتجاوب فيه سؤال واحد على الأقل. الجولة بتتكتب لما السيرفر يوزّع
 * الأسئلة، فطالب فتح لعبة وقفلها قبل أول سؤال مش «لعب» — ومش في أي رقم هنا.
 *
 * الطلبة بس (`studentJoins`)، زي كل شاشات التحليلات. والأيام أيام القاهرة
 * (`cairoDate`) — الأعمدة `timestamp` من غير منطقة، وPrisma بيكتبها UTC.
 */
@Injectable()
export class GameStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(query: GameStatsQuery, now = new Date()): Promise<GameStats> {
    const since = periodStart(query.period, now);
    const where = Prisma.sql`gs."answered" > 0
      ${since ? Prisma.sql`AND gs."started_at" >= ${since}` : Prisma.empty}
      ${query.courseId ? Prisma.sql`AND gs."course_id" = ${query.courseId}::uuid` : Prisma.empty}`;
    const from = Prisma.sql`FROM "app"."game_sessions" gs ${studentJoins('gs."user_id"')}`;

    const [totals, daily, modes, courses, hours, byPlays, byTime, byScore, recent, hardest] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          plays: number;
          players: number;
          seconds: number;
          finished: number;
          answered: number;
          correct: number;
          first: Date | null;
        }>
      >(Prisma.sql`
        SELECT count(*)::int AS plays, count(DISTINCT gs."user_id")::int AS players,
          COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds,
          count(*) FILTER (WHERE gs."outcome" IS NOT NULL)::int AS finished,
          COALESCE(sum(gs."answered"), 0)::int AS answered,
          COALESCE(sum(gs."right_count"), 0)::int AS correct,
          min(gs."started_at") AS first
        ${from} WHERE ${where}
      `),
      this.prisma.$queryRaw<Array<{ day: string; plays: number; players: number; seconds: number }>>(Prisma.sql`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day, d.plays, d.players, d.seconds
        FROM (
          SELECT ${cairoDate('gs."started_at"')} AS day, count(*)::int AS plays,
            count(DISTINCT gs."user_id")::int AS players, COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds
          ${from} WHERE ${where}
          GROUP BY 1
        ) d
      `),
      this.prisma.$queryRaw<
        Array<{
          mode: GameMode;
          level: GameLevel | null;
          plays: number;
          players: number;
          seconds: number;
          answered: number;
          correct: number;
          best: number | null;
        }>
      >(Prisma.sql`
        SELECT gs."mode", gs."level", count(*)::int AS plays, count(DISTINCT gs."user_id")::int AS players,
          COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds,
          COALESCE(sum(gs."answered"), 0)::int AS answered, COALESCE(sum(gs."right_count"), 0)::int AS correct,
          max(gs."score") FILTER (WHERE gs."outcome" IS NOT NULL) AS best
        ${from} WHERE ${where}
        GROUP BY GROUPING SETS ((gs."mode", gs."level"), (gs."mode"))
      `),
      this.prisma.$queryRaw<
        Array<{ course_id: string | null; title: string | null; plays: number; players: number; seconds: number }>
      >(Prisma.sql`
        SELECT gs."course_id", co."title", count(*)::int AS plays, count(DISTINCT gs."user_id")::int AS players,
          COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds
        ${from}
        LEFT JOIN "app"."courses" co ON co."id" = gs."course_id"
        WHERE ${where}
        GROUP BY gs."course_id", co."title"
        ORDER BY plays DESC, gs."course_id"
        LIMIT 20
      `),
      this.prisma.$queryRaw<Array<{ hour: number; n: number }>>(Prisma.sql`
        SELECT ${cairoHour('gs."started_at"')} AS hour, count(*)::int AS n
        ${from} WHERE ${where}
        GROUP BY 1
      `),
      this.players(from, where, Prisma.sql`plays DESC, seconds DESC`),
      this.players(from, where, Prisma.sql`seconds DESC, plays DESC`),
      this.prisma.$queryRaw<Array<PlayerSqlRow & { mode: GameMode }>>(Prisma.sql`
        SELECT t."mode", t.user_id, t.name, t.plays, t.seconds, t.best, t.last
        FROM (
          SELECT gs."mode", gs."user_id" AS user_id, sp."full_name" AS name, count(*)::int AS plays,
            COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds, max(gs."score") AS best,
            max(gs."started_at") AS last,
            row_number() OVER (PARTITION BY gs."mode" ORDER BY max(gs."score") DESC, count(*) DESC, gs."user_id") AS rn
          ${from}
          WHERE ${where} AND gs."outcome" IS NOT NULL
          GROUP BY gs."mode", gs."user_id", sp."full_name"
        ) t
        WHERE t.rn <= ${GAME_STATS_TOP}
        ORDER BY t."mode", t.rn
      `),
      this.sessions(from, where, GAME_STATS_RECENT),
      this.prisma.$queryRaw<
        Array<{ question_id: string; bank_entry_id: string; stem_html: string; answers: number; correct: number }>
      >(Prisma.sql`
        SELECT h.question_id, v."bank_entry_id", v."stem_html", h.answers, h.correct
        FROM (
          SELECT ga."question_version_id" AS question_id, count(*)::int AS answers,
            count(*) FILTER (WHERE ga."was_right")::int AS correct
          FROM "app"."game_answers" ga
          JOIN "app"."game_sessions" gs ON gs."id" = ga."session_id"
          ${studentJoins('gs."user_id"')}
          WHERE ${where}
          GROUP BY ga."question_version_id"
          HAVING count(*) >= ${GAME_STATS_MIN_ANSWERS}
        ) h
        JOIN "app"."question_versions" v ON v."id" = h.question_id
        ORDER BY h.correct::float / h.answers ASC, h.answers DESC, h.question_id
        LIMIT ${GAME_STATS_HARDEST}
      `),
    ]);

    const total = totals[0] ?? { plays: 0, players: 0, seconds: 0, finished: 0, answered: 0, correct: 0, first: null };
    const byDay = new Map(daily.map((row) => [row.day, row]));
    const hourly = new Array<number>(24).fill(0);
    for (const row of hours) if (row.hour >= 0 && row.hour < 24) hourly[row.hour] = row.n;

    return {
      period: query.period,
      totals: {
        plays: total.plays,
        players: total.players,
        seconds: total.seconds,
        avgSeconds: rate(total.seconds, total.plays),
        avgSecondsPerPlayer: rate(total.seconds, total.players),
        finished: total.finished,
        answered: total.answered,
        correct: total.correct,
        correctRate: clampFraction(rate(total.correct, total.answered)),
      },
      daily: dayKeys(seriesStart(query.period, now, total.first), now).map((date) => {
        const row = byDay.get(date);
        return { date, plays: row?.plays ?? 0, players: row?.players ?? 0, minutes: (row?.seconds ?? 0) / 60 };
      }),
      byMode: GAME_MODES.map((mode) => {
        const all = modes.find((row) => row.mode === mode && row.level === null);
        const level = (value: GameLevel) => modes.find((row) => row.mode === mode && row.level === value)?.plays ?? 0;
        return {
          mode,
          plays: all?.plays ?? 0,
          players: all?.players ?? 0,
          seconds: all?.seconds ?? 0,
          correctRate: clampFraction(rate(all?.correct ?? 0, all?.answered ?? 0)),
          bestScore: all?.best ?? null,
          levels: { easy: level('easy'), medium: level('medium'), hard: level('hard') },
        };
      }),
      byCourse: courses.map((row) => ({
        courseId: row.course_id,
        title: row.title,
        plays: row.plays,
        players: row.players,
        seconds: row.seconds,
      })),
      byHour: hourly,
      topByPlays: byPlays.map(toPlayer),
      topByTime: byTime.map(toPlayer),
      topByScore: {
        race: byScore.filter((row) => row.mode === 'race').map(toPlayer),
        millionaire: byScore.filter((row) => row.mode === 'millionaire').map(toPlayer),
        survival: byScore.filter((row) => row.mode === 'survival').map(toPlayer),
      },
      recent,
      hardest: hardest.map((row) => ({
        questionId: row.question_id,
        bankEntryId: row.bank_entry_id,
        stem: plainStem(row.stem_html),
        answers: row.answers,
        correct: row.correct,
        rate: clampFraction(rate(row.correct, row.answers)) ?? 0,
      })),
    };
  }

  /** «الألعاب» على صفحة طالب واحد — كل جولاته، من غير فترة. */
  async student(userId: string): Promise<StudentGameSummary> {
    const where = Prisma.sql`gs."answered" > 0 AND gs."user_id" = ${userId}`;
    const from = Prisma.sql`FROM "app"."game_sessions" gs
      JOIN "app"."users" su ON su."id" = gs."user_id"
      LEFT JOIN "app"."student_profiles" sp ON sp."user_id" = gs."user_id"`;
    const [totals, modes, recent] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ plays: number; seconds: number; answered: number; correct: number; last: Date | null }>
      >(Prisma.sql`
        SELECT count(*)::int AS plays, COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds,
          COALESCE(sum(gs."answered"), 0)::int AS answered, COALESCE(sum(gs."right_count"), 0)::int AS correct,
          max(gs."started_at") AS last
        ${from} WHERE ${where}
      `),
      this.prisma.$queryRaw<Array<{ mode: GameMode; plays: number; seconds: number; best: number | null }>>(Prisma.sql`
        SELECT gs."mode", count(*)::int AS plays, COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds,
          max(gs."score") FILTER (WHERE gs."outcome" IS NOT NULL) AS best
        ${from} WHERE ${where}
        GROUP BY gs."mode"
      `),
      this.sessions(from, where, 10),
    ]);
    const total = totals[0];
    return {
      plays: total?.plays ?? 0,
      seconds: total?.seconds ?? 0,
      answered: total?.answered ?? 0,
      correct: total?.correct ?? 0,
      lastPlayedAt: total?.last?.toISOString() ?? null,
      byMode: GAME_MODES.map((mode) => {
        const row = modes.find((candidate) => candidate.mode === mode);
        return { mode, plays: row?.plays ?? 0, seconds: row?.seconds ?? 0, bestScore: row?.best ?? null };
      }),
      recent,
    };
  }

  private players(from: Prisma.Sql, where: Prisma.Sql, order: Prisma.Sql): Promise<PlayerSqlRow[]> {
    return this.prisma.$queryRaw<PlayerSqlRow[]>(Prisma.sql`
      SELECT gs."user_id" AS user_id, sp."full_name" AS name, count(*)::int AS plays,
        COALESCE(sum(gs."duration_seconds"), 0)::int AS seconds,
        max(gs."score") FILTER (WHERE gs."outcome" IS NOT NULL) AS best,
        max(gs."started_at") AS last
      ${from} WHERE ${where}
      GROUP BY gs."user_id", sp."full_name"
      ORDER BY ${order}, gs."user_id"
      LIMIT ${GAME_STATS_TOP}
    `);
  }

  /** آخر جولات — `from` لازم يعرّف `sp` (بروفايل الطالب). */
  private async sessions(from: Prisma.Sql, where: Prisma.Sql, limit: number): Promise<GameSessionRow[]> {
    const rows = await this.prisma.$queryRaw<SessionSqlRow[]>(Prisma.sql`
      SELECT gs."id", gs."user_id", COALESCE(sp."full_name", '') AS name, gs."mode", gs."level",
        co."title" AS course_title, COALESCE(le."title", se."title") AS scope_title,
        gs."started_at", gs."duration_seconds", gs."question_count", gs."answered", gs."right_count" AS correct, gs."score", gs."outcome"
      ${from}
      LEFT JOIN "app"."courses" co ON co."id" = gs."course_id"
      LEFT JOIN "app"."lessons" le ON le."id" = gs."lesson_id"
      LEFT JOIN "app"."course_sections" se ON se."id" = gs."section_id"
      WHERE ${where}
      ORDER BY gs."started_at" DESC, gs."id" DESC
      LIMIT ${limit}
    `);
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      mode: row.mode,
      level: row.level,
      courseTitle: row.course_title,
      scopeTitle: row.scope_title,
      startedAt: row.started_at.toISOString(),
      durationSeconds: row.duration_seconds,
      questionCount: row.question_count,
      answered: row.answered,
      correct: row.correct,
      score: row.score,
      outcome: row.outcome,
    }));
  }
}

function toPlayer(row: PlayerSqlRow): GamePlayerRow {
  return {
    userId: row.user_id,
    name: row.name,
    plays: row.plays,
    seconds: row.seconds,
    bestScore: row.best,
    lastPlayedAt: row.last?.toISOString() ?? null,
  };
}

/** نص السؤال من غير وسوم — سطر في جدول، مش HTML. */
export function plainStem(html: string): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > STEM_CHARS ? `${text.slice(0, STEM_CHARS - 1)}…` : text;
}
