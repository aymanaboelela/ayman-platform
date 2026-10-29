import { BadRequestException, Injectable } from '@nestjs/common';
import {
  PLAN_HORIZON_DAYS,
  daysBetween,
  type PlanPicks,
  type StudyPlanPayload,
  type StudyPlanSave,
} from '@ayman/contracts/engagement';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { cairoDate, cairoDayKey } from '../analytics/analytics-shared';
import { BacklogService } from '../dashboard/backlog.service';
import { buildPlan } from './plan-schedule';

function dateOf(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * «خطة المذاكرة» — the exam date a student plans toward, and the backlog
 * («المتراكم») spread over the days left, minus what the student took out of
 * it (`PlanPicksSchema`). See `buildPlan` for the shape.
 *
 * The items are `BacklogService.forUser`'s — the same lectures, quizzes and
 * homework the backlog screen lists, decided by the same gate the lesson
 * routes enforce — so a row in the plan is never a door that 404s.
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backlog: BacklogService,
  ) {}

  async forUser(userId: string, now: Date = new Date()): Promise<StudyPlanPayload> {
    const today = cairoDayKey(now);
    const [row, backlog, doneToday] = await Promise.all([
      this.prisma.studyPlan.findUnique({
        where: { userId },
        select: { examDate: true, daysOff: true, skipped: true, first: true },
      }),
      this.backlog.forUser(userId),
      this.doneOn(userId, today),
    ]);
    const settings = row
      ? { examDate: row.examDate.toISOString().slice(0, 10), daysOff: [...row.daysOff].sort((a, b) => a - b) }
      : null;
    const items = backlog.courses.flatMap((course) => course.items);
    const picks = row ? { skipped: row.skipped, first: row.first } : undefined;
    return { ...buildPlan({ today, settings, items, picks, doneToday }), pool: backlog.courses };
  }

  async save(userId: string, input: StudyPlanSave, now: Date = new Date()): Promise<StudyPlanPayload> {
    const ahead = daysBetween(cairoDayKey(now), input.examDate);
    // Today is allowed (the exam IS today); yesterday and next decade are not.
    if (ahead < 0 || ahead > PLAN_HORIZON_DAYS) throw new BadRequestException({ code: 'plan_date_out_of_range' });
    const daysOff = [...new Set(input.daysOff)];
    const picks = input.picks ? await this.cleanPicks(userId, input.picks) : undefined;
    await this.prisma.studyPlan.upsert({
      where: { userId },
      create: { userId, examDate: dateOf(input.examDate), daysOff, ...picks },
      update: { examDate: dateOf(input.examDate), daysOff, ...picks },
    });
    return this.forUser(userId, now);
  }

  /**
   * Only ids that are rows of THIS student's backlog right now, each once, and
   * never both out of the plan and first in it. The client is trusted with
   * nothing here: an id it invented would sit in the row for ever, matching
   * nothing — harmless, but the column is the student's, not a scratchpad.
   */
  private async cleanPicks(userId: string, picks: PlanPicks): Promise<PlanPicks> {
    const backlog = await this.backlog.forUser(userId);
    const ids = new Set(backlog.courses.flatMap((course) => course.items.map((item) => item.id)));
    const skipped = [...new Set(picks.skipped)].filter((id) => ids.has(id));
    const out = new Set(skipped);
    const first = [...new Set(picks.first)].filter((id) => ids.has(id) && !out.has(id));
    return { skipped, first };
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.studyPlan.deleteMany({ where: { userId } });
  }

  /**
   * What the student finished on this Cairo day: lectures completed, quiz
   * sittings handed in, homework handed in. A quiz LESSON's own progress row is
   * left out — its sitting is already counted, and once is what it was.
   */
  private async doneOn(userId: string, day: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT (
        (SELECT count(*) FROM "app"."lesson_progress" lp
           JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id"
           JOIN "app"."lessons" l ON l."id" = lp."lesson_id"
          WHERE e."user_id" = ${userId} AND l."kind" <> 'quiz'
            AND lp."completed_at" >= ${dateOf(day)}::timestamp - interval '1 day'
            AND ${cairoDate('lp."completed_at"')} = ${day}::date)
        + (SELECT count(*) FROM "app"."quiz_attempts" a
          WHERE a."user_id" = ${userId} AND a."state" IN ('submitted', 'pending_review')
            AND a."submitted_at" >= ${dateOf(day)}::timestamp - interval '1 day'
            AND ${cairoDate('a."submitted_at"')} = ${day}::date)
        + (SELECT count(*) FROM "app"."homework_submissions" h
          WHERE h."user_id" = ${userId}
            AND h."submitted_at" >= ${dateOf(day)}::timestamp - interval '1 day'
            AND ${cairoDate('h."submitted_at"')} = ${day}::date)
      )::int AS n
    `);
    return rows[0]?.n ?? 0;
  }
}
