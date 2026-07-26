import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessGrant, AccessScope } from '../../generated/prisma/client';

/**
 * The return type is an OBJECT in both directions. A `boolean` here is the seed
 * of every "why can't this student see the course?" support ticket, and it is
 * the shape §6.6 exists to prevent — a denial that cannot say why is a denial
 * nobody can debug, and an approval that cannot say which grant produced it is
 * an approval nobody can audit.
 */
export type CourseAccess =
  | { allowed: true; grantId: string; scope: AccessScope; validUntil: Date | null }
  | {
      allowed: false;
      reason: 'no_grant' | 'not_yet_valid' | 'expired' | 'revoked' | 'course_not_published';
    };

/** Human-readable provenance on the auto-created grant, for the audit trail. */
const FREE_PLATFORM_NOTE = 'auto: v1 is free for every registered student';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Free for everyone" as a row. Created lazily on first enrollment rather
   * than at registration, so the grant's `validFrom` records when the student
   * actually started using the platform.
   */
  async ensurePlatformGrant(userId: string): Promise<AccessGrant> {
    const existing = await this.prisma.accessGrant.findFirst({
      where: { userId, scope: 'platform', revokedAt: null },
    });
    if (existing) return existing;

    try {
      return await this.prisma.accessGrant.create({
        data: { userId, scope: 'platform', source: 'auto_free', note: FREE_PLATFORM_NOTE },
      });
    } catch (error) {
      // Two concurrent first-enrollments race here. The partial unique index is
      // what decides; the loser simply re-reads the winner's row. Catching the
      // violation is correct — checking-then-creating is not atomic.
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.accessGrant.findFirstOrThrow({
        where: { userId, scope: 'platform', revokedAt: null },
      });
    }
  }

  /**
   * Ownership is compiled into the query: `userId` is in the WHERE clause, so
   * there is no fetch-then-check step to forget. The validity window is
   * evaluated in code (not in SQL) purely so the denial can name a reason —
   * the actor scoping is still done by the database.
   */
  async resolveCourseAccess(userId: string, courseId: string): Promise<CourseAccess> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, subjectId: true },
    });
    if (!course) throw new NotFoundException();
    if (course.status !== 'published') {
      return { allowed: false, reason: 'course_not_published' };
    }

    const grants = await this.prisma.accessGrant.findMany({
      where: {
        userId,
        OR: [
          { scope: 'platform' },
          { scope: 'course', courseId },
          { scope: 'subject_teacher', subjectId: course.subjectId },
        ],
      },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: { id: true, scope: true, validFrom: true, validUntil: true, revokedAt: true },
    });

    if (grants.length === 0) return { allowed: false, reason: 'no_grant' };

    const now = new Date();
    // Report the most specific failure we saw, in severity order, so the admin
    // UI can say "انتهت صلاحية الاشتراك" rather than "لا يوجد اشتراك".
    let fallback: CourseAccess = { allowed: false, reason: 'no_grant' };

    for (const grant of grants) {
      if (grant.revokedAt !== null) {
        fallback = { allowed: false, reason: 'revoked' };
        continue;
      }
      if (grant.validFrom > now) {
        fallback = { allowed: false, reason: 'not_yet_valid' };
        continue;
      }
      if (grant.validUntil !== null && grant.validUntil <= now) {
        fallback = { allowed: false, reason: 'expired' };
        continue;
      }
      return {
        allowed: true,
        grantId: grant.id,
        scope: grant.scope,
        validUntil: grant.validUntil,
      };
    }

    return fallback;
  }

  /** Enroll, creating the platform grant if this is the student's first course. */
  async enroll(userId: string, courseId: string): Promise<{ enrollmentId: string; access: CourseAccess }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();

    await this.ensurePlatformGrant(userId);

    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: { status: 'active' },
      select: { id: true },
    });

    return { enrollmentId: enrollment.id, access: await this.resolveCourseAccess(userId, courseId) };
  }

  /** The caller's own enrollments. `userId` comes from the session, never the URL. */
  listOwnEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId, status: { in: ['active', 'completed'] } },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        course: { select: { id: true, slug: true, title: true, coverKey: true } },
      },
    });
  }
}
