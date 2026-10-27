import { Injectable } from '@nestjs/common';
import {
  FOCUS_GRACE_SECONDS,
  shiftDayKey,
  type FocusPayload,
  type FocusSession,
  type FocusStopResult,
} from '@ayman/contracts/engagement';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDate, cairoDayKey } from '../analytics/analytics-shared';

interface OpenRow {
  id: string;
  startedAt: Date;
  minutes: number;
}

/** What a sitting stopped at `at` counts for, and whether it ran its course. */
export function settle(session: OpenRow, at: Date): { endedAt: Date; completed: boolean; minutes: number } {
  const planned = session.minutes * 60_000;
  const elapsed = Math.max(0, at.getTime() - session.startedAt.getTime());
  const completed = elapsed >= planned - FOCUS_GRACE_SECONDS * 1000;
  const counted = completed ? planned : elapsed;
  return {
    endedAt: new Date(session.startedAt.getTime() + counted),
    completed,
    minutes: Math.floor(counted / 60_000),
  };
}

/**
 * «أوضة المذاكرة» — a focus timer, and the count of everyone else on one.
 *
 * ## The clock is the server's
 *
 * The browser shows a countdown, but «finished» is decided here, from
 * `started_at` and the length asked for. A tab put to sleep, a phone locked
 * halfway — the sitting still ends on time, and a reload picks up the same
 * timer because the open row is the timer.
 *
 * ## A sitting nobody stopped
 *
 * A tab closed mid-sitting leaves the row open. When its time is up it is
 * settled as finished, the next time the student comes back (`settleExpired`)
 * — the same benefit of the doubt a closed laptop gets. Until then the league
 * and the badges read an open row past its end as finished too, so the two
 * never disagree about the same sitting.
 */
@Injectable()
export class FocusService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, now: Date = new Date()): Promise<FocusPayload> {
    await this.settleExpired(userId, now);
    const today = cairoDayKey(now);
    const from = shiftDayKey(today, -6);

    const [open, live, days, total] = await Promise.all([
      this.open(userId),
      this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(DISTINCT f."user_id")::int AS n FROM "app"."focus_sessions" f
        WHERE f."ended_at" IS NULL AND f."user_id" <> ${userId}
          AND f."started_at" > ${new Date(now.getTime() - 2 * 3_600_000)}
          AND f."started_at" + make_interval(mins => f."minutes") > ${now}
      `),
      this.prisma.$queryRaw<Array<{ day: Date; minutes: number; sessions: number }>>(Prisma.sql`
        SELECT ${cairoDate('f."started_at"')} AS day,
               sum(floor(extract(epoch FROM f."ended_at" - f."started_at") / 60))::int AS minutes,
               count(*) FILTER (WHERE f."completed")::int AS sessions
        FROM "app"."focus_sessions" f
        WHERE f."user_id" = ${userId} AND f."ended_at" IS NOT NULL
          AND f."started_at" >= ${from}::date - interval '1 day'
          AND ${cairoDate('f."started_at"')} >= ${from}::date
        GROUP BY 1
      `),
      this.prisma.$queryRaw<Array<{ minutes: number; sessions: number }>>(Prisma.sql`
        SELECT coalesce(sum(floor(extract(epoch FROM f."ended_at" - f."started_at") / 60)), 0)::int AS minutes,
               count(*) FILTER (WHERE f."completed")::int AS sessions
        FROM "app"."focus_sessions" f
        WHERE f."user_id" = ${userId} AND f."ended_at" IS NOT NULL
      `),
    ]);

    const byDay = new Map(days.map((row) => [row.day.toISOString().slice(0, 10), row]));
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = shiftDayKey(today, index - 6);
      return { day, minutes: byDay.get(day)?.minutes ?? 0 };
    });
    const todayRow = byDay.get(today);

    return {
      live: live[0]?.n ?? 0,
      open: open ? this.toSession(open) : null,
      today: { sessions: todayRow?.sessions ?? 0, minutes: todayRow?.minutes ?? 0 },
      week,
      total: { sessions: total[0]?.sessions ?? 0, minutes: total[0]?.minutes ?? 0 },
    };
  }

  /** A new sitting. One that was still running is stopped where it stands first. */
  async start(userId: string, minutes: number, now: Date = new Date()): Promise<FocusPayload> {
    await this.stopOpen(userId, now);
    await this.prisma.focusSession.create({ data: { userId, minutes, startedAt: now } });
    return this.forUser(userId, now);
  }

  async stop(userId: string, now: Date = new Date()): Promise<FocusStopResult> {
    const settled = await this.stopOpen(userId, now);
    return {
      completed: settled?.completed ?? false,
      minutes: settled?.minutes ?? 0,
      payload: await this.forUser(userId, now),
    };
  }

  /** Finished sittings — the «أوضة المذاكرة» badge. */
  async completedCount(userId: string, now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(*)::int AS n FROM "app"."focus_sessions" f
      WHERE f."user_id" = ${userId}
        AND (f."completed" OR (f."ended_at" IS NULL AND f."started_at" + make_interval(mins => f."minutes") <= ${now}))
    `);
    return rows[0]?.n ?? 0;
  }

  private open(userId: string): Promise<OpenRow | null> {
    return this.prisma.focusSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true, minutes: true },
    });
  }

  private async stopOpen(userId: string, now: Date) {
    const open = await this.open(userId);
    if (!open) return null;
    const settled = settle(open, now);
    // `endedAt: null` in the WHERE: a double tap on «إنهاء» stops it once.
    await this.prisma.focusSession.updateMany({
      where: { id: open.id, endedAt: null },
      data: { endedAt: settled.endedAt, completed: settled.completed },
    });
    return settled;
  }

  private async settleExpired(userId: string, now: Date): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "app"."focus_sessions"
      SET "ended_at" = "started_at" + make_interval(mins => "minutes"), "completed" = true
      WHERE "user_id" = ${userId} AND "ended_at" IS NULL
        AND "started_at" + make_interval(mins => "minutes") <= ${now}
    `);
  }

  private toSession(row: OpenRow): FocusSession {
    return {
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endsAt: new Date(row.startedAt.getTime() + row.minutes * 60_000).toISOString(),
      minutes: row.minutes,
    };
  }
}
