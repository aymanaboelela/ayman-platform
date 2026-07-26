import { Injectable, NotFoundException } from '@nestjs/common';
import type { EnrollmentDto } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Statuses that still grant access. `completed` is included because finishing
 * a course must not revoke it — see the comment on the `Enrollment` model in
 * `schema.prisma`. Every progress write and every lesson-ownership query in
 * this plan filters through this exact list, never through `status: 'active'`
 * alone.
 */
export const ACTIVE_ENROLLMENT_STATUSES = ['active', 'completed'] as const;

const ENROLLMENT_SELECT = {
  id: true,
  courseId: true,
  status: true,
  progressPercent: true,
  lastLessonId: true,
  enrolledAt: true,
  completedAt: true,
  course: { select: { slug: true } },
} as const;

interface EnrollmentRow {
  id: string;
  courseId: string;
  status: string;
  progressPercent: { toNumber(): number } | number;
  lastLessonId: string | null;
  enrolledAt: Date;
  completedAt: Date | null;
  course: { slug: string };
}

function toDto(row: EnrollmentRow): EnrollmentDto {
  return {
    id: row.id,
    courseId: row.courseId,
    courseSlug: row.course.slug,
    status: row.status as EnrollmentDto['status'],
    // Prisma returns Decimal for numeric columns; the contract says number.
    progressPercent: Number(row.progressPercent),
    lastLessonId: row.lastLessonId,
    enrolledAt: row.enrolledAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/**
 * Plan 4's own internal read service. It exposes no route of its own — Plan
 * 3's `EnrollmentController` (in `../entitlement/`) already owns
 * `POST /api/courses/:courseId/enroll` and `GET /api/enrollments`; this
 * service only widens what the second of those two returns, and gives every
 * progress write in this plan one place to resolve "does this user hold an
 * active enrollment in this course" that is NOT a fetch-then-check.
 */
@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Own enrollments only — `userId` is the filter, full stop. This is the
   * enriched read model `GET /api/enrollments` now delegates to: the same
   * rows Plan 3's bare `findMany` returned, plus `progressPercent` and
   * `lastLessonId` (both already columns on `Enrollment`, just not selected
   * before this plan touched the read side).
   */
  async listOwn(userId: string): Promise<EnrollmentDto[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'desc' }],
      select: ENROLLMENT_SELECT,
    });
    return rows.map((row) => toDto(row));
  }

  /**
   * The enrollment row every progress write resolves through. Ownership is
   * compiled INTO the query — `userId` and `courseId` are both in the WHERE
   * clause — so there is no fetched row for a later `if` to forget to check.
   *
   * Always 404, never 403: a course the caller is not enrolled in and a
   * course that does not exist must be indistinguishable from the outside,
   * or the error code itself becomes an existence oracle for enumerating
   * other students' courses.
   */
  async requireActive(userId: string, courseId: string): Promise<{ id: string }> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
      select: { id: true },
    });
    if (!enrollment) {
      throw new NotFoundException('enrollment not found');
    }
    return enrollment;
  }
}
