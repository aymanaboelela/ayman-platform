import { Injectable } from '@nestjs/common';
import { FLAG_DECLARATIONS, type FlagDeclaration } from '@ayman/contracts/admin/flags';
import {
  BADGE_FAMILIES,
  BADGE_NEW_DAYS,
  BADGE_TIERS,
  badgeKey,
  bestStreak,
  type BadgeFamilyKey,
  type BadgeFamilyState,
  type BadgesPayload,
  type BadgeTier,
} from '@ayman/contracts/engagement';
import { Prisma } from '../../generated/prisma/client';
import { isFeatureEnabled } from '../../common/entitlements';
import { flagStartsEnabled } from '../../common/flag-default';
import { PrismaService } from '../../prisma/prisma.service';
import { DailyService } from './daily.service';

type Metrics = Record<BadgeFamilyKey, number>;

interface MetricRow {
  lessons: number;
  quizzes: number;
  full_marks: number;
  homework: number;
  mistakes: number;
  notes: number;
  arena: number;
  courses: number;
}

/**
 * Which rungs `metrics` reaches, as `student_badges` keys. Exported for the
 * spec: it is the one rule here, and it must agree with the catalog.
 */
export function earnedKeys(metrics: Metrics, families: readonly BadgeFamilyKey[]): string[] {
  return BADGE_FAMILIES.filter((family) => families.includes(family.key)).flatMap((family) =>
    family.targets.flatMap((target, index) =>
      metrics[family.key] >= target ? [badgeKey(family.key, BADGE_TIERS[index]!)] : [],
    ),
  );
}

/**
 * «أوسمتي» — ten ladders of bronze, silver and gold over what a student did.
 *
 * ## Computed live, remembered once
 *
 * Every read recomputes the ten numbers from the rows that already exist
 * (progress, sittings, homework, the daily card, notes, the arena). A rung
 * reached for the first time is INSERTED into `student_badges` with the time it
 * was first seen, and never updated or deleted after — so the date on a medal
 * does not move, and a seven-day streak that ended still counts as having
 * happened. That is the deliberate difference from the dashboard's «إنجازاتك»
 * strip (`apps/web/lib/achievements.ts`), whose six markers are a statement
 * about NOW and may go backwards.
 *
 * ## Only what this stack has
 *
 * A ladder over a feature that is off here (the arena, the mistakes book, the
 * daily card, notes, homework) would be a medal nobody can earn. It is left
 * out of the payload rather than shown locked forever.
 */
@Injectable()
export class BadgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly daily: DailyService,
  ) {}

  async forUser(userId: string, now: Date = new Date()): Promise<BadgesPayload> {
    const [families, metrics] = await Promise.all([this.families(), this.metrics(userId)]);

    const reached = earnedKeys(metrics, families);
    if (reached.length > 0) {
      await this.prisma.studentBadge.createMany({
        data: reached.map((key) => ({ userId, key })),
        skipDuplicates: true,
      });
    }
    const stored = await this.prisma.studentBadge.findMany({
      where: { userId },
      select: { key: true, earnedAt: true },
    });
    const earnedAt = new Map(stored.map((row) => [row.key, row.earnedAt.toISOString()]));
    const freshSince = now.getTime() - BADGE_NEW_DAYS * 86_400_000;
    const fresh = new Set(stored.filter((row) => row.earnedAt.getTime() >= freshSince).map((row) => row.key));

    const states: BadgeFamilyState[] = BADGE_FAMILIES.filter((family) => families.includes(family.key)).map(
      (family) => ({
        key: family.key,
        value: metrics[family.key],
        tiers: family.targets.map((target, index) => {
          const tier = BADGE_TIERS[index]!;
          return { tier, target, earnedAt: earnedAt.get(badgeKey(family.key, tier)) ?? null };
        }),
        fresh: BADGE_TIERS.some((tier) => fresh.has(badgeKey(family.key, tier))),
      }),
    );

    const recent = states
      .flatMap((state) =>
        state.tiers.flatMap((rung) =>
          rung.earnedAt ? [{ key: state.key, tier: rung.tier as BadgeTier, earnedAt: rung.earnedAt }] : [],
        ),
      )
      .sort((a, b) => b.earnedAt.localeCompare(a.earnedAt))
      .slice(0, 3);

    return {
      families: states,
      earned: states.reduce((sum, state) => sum + state.tiers.filter((rung) => rung.earnedAt).length, 0),
      total: states.length * BADGE_TIERS.length,
      recent,
    };
  }

  /** How many rungs were first seen in the window — for «ملخص الشهر». */
  async earnedBetween(userId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.studentBadge.count({ where: { userId, earnedAt: { gte: from, lt: to } } });
  }

  private async families(): Promise<BadgeFamilyKey[]> {
    const [arena, mistakes] = await Promise.all([this.flagOpen('arena.enabled'), this.flagOpen('mistakes.enabled')]);
    const open: Record<BadgeFamilyKey, boolean> = {
      lessons: true,
      quizzes: true,
      fullMarks: true,
      courses: true,
      streak: isFeatureEnabled('dailyQuestion'),
      daily: isFeatureEnabled('dailyQuestion'),
      homework: isFeatureEnabled('homework'),
      notes: isFeatureEnabled('lessonNotes'),
      mistakes,
      arena,
    };
    return BADGE_FAMILIES.map((family) => family.key).filter((key) => open[key]);
  }

  /** A stack flag, read the way `MistakesGateService` reads its own. */
  private async flagOpen(key: string): Promise<boolean> {
    const row = await this.prisma.featureFlag.findUnique({ where: { key }, select: { enabled: true } });
    const declaration = FLAG_DECLARATIONS.find((entry) => entry.key === key) as FlagDeclaration | undefined;
    return row?.enabled ?? (declaration ? flagStartsEnabled(declaration) : false);
  }

  /**
   * The ten numbers, in one round trip plus the daily card's days.
   *
   *   lessons   — lectures finished (a quiz LESSON is a sitting, counted next).
   *   quizzes   — distinct quizzes with a passing final mark.
   *   fullMarks — distinct quizzes with a final mark of 100%.
   *   homework  — lectures whose homework was handed in.
   *   mistakes  — questions «اتصلحت» in the mistakes book.
   *   notes     — notes written.
   *   arena     — arena matches won.
   *   courses   — enrolments finished.
   */
  private async metrics(userId: string): Promise<Metrics> {
    const [rows, days] = await Promise.all([
      this.prisma.$queryRaw<MetricRow[]>(Prisma.sql`
        SELECT
          (SELECT count(*) FROM "app"."lesson_progress" lp
             JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id"
             JOIN "app"."lessons" l ON l."id" = lp."lesson_id"
            WHERE e."user_id" = ${userId} AND l."kind" <> 'quiz' AND lp."completed_at" IS NOT NULL)::int AS lessons,
          (SELECT count(DISTINCT a."quiz_id") FROM "app"."quiz_attempts" a
            WHERE a."user_id" = ${userId} AND a."state" = 'submitted' AND a."passed")::int AS quizzes,
          (SELECT count(DISTINCT a."quiz_id") FROM "app"."quiz_attempts" a
            WHERE a."user_id" = ${userId} AND a."state" = 'submitted'
              AND a."grade_out_of" > 0 AND a."scaled_score" >= a."grade_out_of")::int AS full_marks,
          (SELECT count(DISTINCT h."lesson_id") FROM "app"."homework_submissions" h
            WHERE h."user_id" = ${userId})::int AS homework,
          (SELECT count(*) FROM "app"."mistake_reviews" m
            WHERE m."user_id" = ${userId} AND m."mastered_at" IS NOT NULL)::int AS mistakes,
          (SELECT count(*) FROM "app"."lesson_notes" n WHERE n."user_id" = ${userId})::int AS notes,
          (SELECT count(*) FROM "app"."arena_matches" am WHERE am."winner_id" = ${userId})::int AS arena,
          (SELECT count(*) FROM "app"."enrollments" e
            WHERE e."user_id" = ${userId} AND (e."completed_at" IS NOT NULL OR e."progress_percent" >= 100))::int AS courses
      `),
      this.daily.answeredDays(userId),
    ]);
    const row = rows[0];
    return {
      lessons: row?.lessons ?? 0,
      quizzes: row?.quizzes ?? 0,
      fullMarks: row?.full_marks ?? 0,
      homework: row?.homework ?? 0,
      mistakes: row?.mistakes ?? 0,
      notes: row?.notes ?? 0,
      arena: row?.arena ?? 0,
      courses: row?.courses ?? 0,
      daily: days.length,
      streak: bestStreak(new Set(days.map((day) => day.day))),
    };
  }
}
