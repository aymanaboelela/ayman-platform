import { Injectable } from '@nestjs/common';
import type { CourseHeadcountRow } from '@ayman/contracts/admin/analytics';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { studentJoins } from './analytics-shared';

interface HeadcountRow {
  course_id: string;
  title: string;
  requires_grant: boolean;
  enrolled: number;
  subscribed: number;
}

/**
 * «كام واحد مشترك في كل كورس» — the per-course headcount the admin overview
 * opens with.
 *
 * ## Why it is one query and not a count per course
 *
 * The obvious shape is `_count` on the admin course list, and it is wrong
 * twice over. `/api/admin/courses` is the picker every editor screen reads
 * (the book editor, the manual book order, the home-page block picker) and it
 * is already the heaviest list on the surface; hanging an aggregate over
 * `enrollments` off it makes every one of those pay for a number none of them
 * render. And a Prisma `_count` cannot express the population anyway — see
 * below.
 *
 * ## The population is `studentJoins`, exactly as everywhere else
 *
 * Not "rows in `enrollments`". `OverviewService`'s own header documents what
 * happens when «الطلبة» quietly means a different set on each screen: three
 * numbers, all called the same thing, all different, on one page. So the
 * denominator here is the same one `/admin/students` lists — `role =
 * 'student'` carrying a `student_profiles` row — and a course's number on this
 * strip is the same integer the analytics overview shows when it is filtered
 * to that course. That is a property worth keeping: the strip LINKS there.
 *
 * ## `subscribed` deliberately ignores `source`
 *
 * `FinanceService.list` filters `source: 'purchase'`, which is right for a
 * money screen and wrong for this one — a grant an admin opened by hand is
 * real access held by a real student, and counting it is the difference
 * between this strip and «الاشتراكات والإيرادات». `scope in ('course','term')`
 * matches the finance screen's own base filter: a `subject_teacher` or
 * `platform` grant is not a subscription to any particular course, and
 * counting the platform one would report every registered student as a
 * subscriber to every free course.
 */
@Injectable()
export class CourseHeadcountService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every PUBLISHED course, plus any unpublished one that still has people in
   * it. The second half is not a nicety: unpublishing a course does not empty
   * it, and a course with 40 students that vanishes from this strip the moment
   * it goes back to draft is exactly the number an admin would go looking for.
   *
   * Ordered by headcount, biggest first, then by title so two courses on the
   * same number keep a stable order between refreshes.
   */
  async list(): Promise<CourseHeadcountRow[]> {
    const now = new Date();

    const rows = await this.prisma.$queryRaw<HeadcountRow[]>(Prisma.sql`
      WITH enrolled AS (
        SELECT e."course_id", count(DISTINCT e."user_id")::int AS n
        FROM "app"."enrollments" e
        ${studentJoins('e."user_id"')}
        WHERE e."status" = 'active'
        GROUP BY e."course_id"
      ),
      subscribed AS (
        SELECT g."course_id", count(DISTINCT g."user_id")::int AS n
        FROM "app"."access_grants" g
        ${studentJoins('g."user_id"')}
        WHERE g."scope" IN ('course', 'term')
          AND g."course_id" IS NOT NULL
          AND g."revoked_at" IS NULL
          AND g."valid_from" <= ${now}
          -- NULL is open-ended, not missing: every scope=term grant writes
          -- NULL here and is cut off by revoked_at when the term closes.
          AND (g."valid_until" IS NULL OR g."valid_until" > ${now})
        GROUP BY g."course_id"
      )
      SELECT
        c."id" AS course_id,
        c."title",
        c."requires_grant",
        coalesce(e.n, 0) AS enrolled,
        coalesce(s.n, 0) AS subscribed
      FROM "app"."courses" c
      LEFT JOIN enrolled e ON e."course_id" = c."id"
      LEFT JOIN subscribed s ON s."course_id" = c."id"
      WHERE c."status" = 'published' OR coalesce(e.n, 0) > 0 OR coalesce(s.n, 0) > 0
      ORDER BY greatest(coalesce(e.n, 0), coalesce(s.n, 0)) DESC, c."title" ASC
    `);

    return rows.map((row) => ({
      courseId: row.course_id,
      title: row.title,
      requiresGrant: row.requires_grant,
      enrolled: row.enrolled,
      subscribed: row.subscribed,
    }));
  }
}
