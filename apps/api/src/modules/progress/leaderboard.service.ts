import { Injectable } from '@nestjs/common';
import { cityNameAr } from '@ayman/contracts/cities';
import type {
  AdminLeaderboard,
  LeaderboardQuery,
  LeaderboardStudent,
} from '@ayman/contracts/admin/leaderboard';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CohortRankService } from './cohort-rank.service';
import {
  cohortTabs,
  filterMembers,
  pickCohort,
  rankMembers,
  summarize,
  type RankedMember,
} from './leaderboard';

interface ExtraRow {
  user_id: string;
  image: string | null;
  governorate: string | null;
  city_id: number | null;
  last_active: Date | null;
}

/**
 * «الأوائل» — ترتيب الدفعة كلها للمدرّس.
 *
 * ## مفيش معادلة هنا
 *
 * النقط والدفعة والترتيب كلهم من `CohortRankService.snapshot` — نفس الكاش
 * اللي `/api/me/rank` بيرتّب الطالب وسطه. الملف ده بيعمل تلات حاجات بس:
 * يختار الدفعة، يقطّعها صفحات، ويكمّل صفوف الصفحة بالحاجات اللي الطالب
 * مابيشوفهاش عن زمايله (الصورة، المحافظة، آخر نشاط).
 *
 * ## التفاصيل للصفحة بس
 *
 * آخر نشاط بيتحسب من `lesson_progress` و`quiz_attempts` — لو اتحسب للدفعة
 * كلها كان هيبقى مسح لكل تقدم كل طالب في السنة مع كل فتحة للشاشة. فبيتحسب
 * للخمسين اللي في الصفحة والتلاتة اللي على المنصة، بالـid.
 */
@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rank: CohortRankService,
  ) {}

  async board(query: LeaderboardQuery): Promise<AdminLeaderboard> {
    const [years, counts] = await Promise.all([
      this.prisma.academicYear.findMany({
        select: { systemId: true, year: true, labelAr: true, system: { select: { sortOrder: true } } },
      }),
      this.rank.populationCounts(),
    ]);
    const tabs = cohortTabs(
      years.map((row) => ({
        systemId: row.systemId,
        year: row.year,
        labelAr: row.labelAr,
        systemOrder: row.system.sortOrder,
      })),
      counts,
    );
    const unplaced = counts.filter((row) => row.year === null).reduce((sum, row) => sum + row.n, 0);

    const key = pickCohort(tabs, query);
    if (key === null) {
      return { cohorts: tabs, cohort: null, podium: [], rows: [], rowCount: 0, unplaced };
    }

    const tab = tabs.find((row) => row.year === key.year && row.systemId === key.systemId);
    const [snapshot, label] = await Promise.all([
      this.rank.snapshot(key),
      tab ? Promise.resolve(tab.label) : this.rank.label(key),
    ]);

    const ranked = rankMembers(snapshot.rows);
    const matching = filterMembers(ranked, { q: query.q, stream: query.stream });
    const offset = (query.page - 1) * query.perPage;
    const page = matching.slice(offset, offset + query.perPage);
    const podium = ranked.filter((row) => row.points > 0).slice(0, 3);

    const extras = await this.extras([...new Set([...page, ...podium].map((row) => row.userId))]);
    const toRow = (row: RankedMember) => student(row, extras.get(row.userId));
    const summary = summarize(snapshot.rows);

    return {
      // عدد التاب المفتوح من اللقطة نفسها، مش من العدّ اللايف: اللقطة عمرها
      // لحد خمس دقايق، والتاب اللي فوق القايمة لازم يقول نفس عددها.
      cohorts: tabs.map((row) =>
        row.year === key.year && row.systemId === key.systemId ? { ...row, size: summary.size } : row,
      ),
      cohort: {
        year: key.year,
        systemId: key.systemId,
        label,
        size: summary.size,
        active: summary.active,
        averagePoints: summary.averagePoints,
        pendingReview: summary.pendingReview,
        levels: summary.levels,
        computedAt: new Date(snapshot.at).toISOString(),
      },
      podium: podium.map(toRow),
      rows: page.map(toRow),
      rowCount: matching.length,
      unplaced,
    };
  }

  /**
   * الصورة والمكان وآخر نشاط، للصفوف اللي هتترسم بس.
   *
   * آخر نشاط = نفس تعريف `StudentAnalyticsService.rosterCte`: آخر heartbeat
   * على درس اتفتح، أو آخر حركة في محاولة اتسلّمت. لو اتعرّف هنا بشكل تاني،
   * «آخر نشاط» في الصف ده وفي سجل الطالب (لينك واحد بعيد) هيختلفوا.
   *
   * ⚠️ مفيش backtick جوّه الـSQL — بيقفل التمبلت (`new-admin-screen-traps`).
   */
  private async extras(userIds: string[]): Promise<Map<string, ExtraRow>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<ExtraRow[]>(Prisma.sql`
      SELECT sp."user_id", u."image", g."name_ar" AS governorate, sp."city_id",
        GREATEST(
          (SELECT max(lp."last_heartbeat_at")
             FROM "app"."lesson_progress" lp
             JOIN "app"."enrollments" e ON e."id" = lp."enrollment_id"
            WHERE e."user_id" = sp."user_id" AND lp."open_count" > 0),
          (SELECT max(a."last_activity_at")
             FROM "app"."quiz_attempts" a
            WHERE a."user_id" = sp."user_id" AND a."state" IN ('submitted', 'pending_review'))
        ) AS last_active
      FROM "app"."student_profiles" sp
      JOIN "app"."users" u ON u."id" = sp."user_id"
      LEFT JOIN "app"."governorates" g ON g."code" = sp."governorate_code"
      WHERE sp."user_id" = ANY(${userIds}::text[])
    `);
    return new Map(rows.map((row) => [row.user_id, row]));
  }
}

function student(row: RankedMember, extra: ExtraRow | undefined): LeaderboardStudent {
  return {
    userId: row.userId,
    rank: row.rank,
    fullName: row.fullName,
    avatar: extra?.image ?? null,
    phone: row.phone,
    governorate: extra?.governorate ?? null,
    city: cityNameAr(extra?.city_id ?? null),
    stream: row.stream,
    systemKnown: row.systemKnown,
    points: row.points,
    average: row.stats.average,
    quizzes: row.stats.quizzes,
    exams: row.stats.exams,
    homework: row.stats.homework,
    pendingReview: row.stats.pendingReview,
    lastActiveAt: extra?.last_active ? new Date(extra.last_active).toISOString() : null,
  };
}
