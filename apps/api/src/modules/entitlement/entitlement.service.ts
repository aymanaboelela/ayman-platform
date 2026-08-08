import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
      reason:
        | 'no_grant'
        | 'not_yet_valid'
        | 'expired'
        | 'revoked'
        | 'course_not_published'
        /**
         * The course requires a grant of its own and this student has only the
         * platform-wide one. A DISTINCT reason from `no_grant`, because it is a
         * different sentence to a student — "this course is closed" rather than
         * "something is wrong with your account" — and a different action for
         * the admin, who has to issue a course grant rather than investigate.
         */
        | 'needs_course_grant';
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
      select: { id: true, status: true, subjectId: true, requiresGrant: true },
    });
    if (!course) throw new NotFoundException();
    if (course.status !== 'published') {
      return { allowed: false, reason: 'course_not_published' };
    }

    /*
     * WHICH SCOPES COUNT — the whole of what `requiresGrant` changes.
     *
     * A free course is satisfied by any of the three, including the
     * platform-wide "v1 is free for everyone" grant. A closed one drops
     * `platform` from the list, so it takes a grant naming this course (or its
     * subject) specifically.
     *
     * Note what does NOT change: access is still decided by reading grants,
     * with their scopes and validity windows, and never by a column on the
     * course. The schema's warning against a boolean `isFree` is about exactly
     * that shortcut, and this is not it.
     */
    const scopes = course.requiresGrant
      ? [{ scope: 'course' as const, courseId }, { scope: 'subject_teacher' as const, subjectId: course.subjectId }]
      : [
          { scope: 'platform' as const },
          { scope: 'course' as const, courseId },
          { scope: 'subject_teacher' as const, subjectId: course.subjectId },
        ];

    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, OR: scopes },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: { id: true, scope: true, validFrom: true, validUntil: true, revokedAt: true },
    });

    if (grants.length === 0) {
      // Told apart, because they are different situations — see the reason's
      // own note. A closed course with no grant is the NORMAL state for a
      // student who has not been given it, not a fault.
      return {
        allowed: false,
        reason: course.requiresGrant ? 'needs_course_grant' : 'no_grant',
      };
    }

    const now = new Date();
    // Report the most specific failure we saw, in severity order, so the admin
    // UI can say "انتهت صلاحية الاشتراك" rather than "لا يوجد اشتراك".
    let fallback: CourseAccess = {
      allowed: false,
      reason: course.requiresGrant ? 'needs_course_grant' : 'no_grant',
    };

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

  /**
   * The course's opening lesson: first published lesson of the first published
   * section, in the same order the outline and the player use. `null` for a
   * published course with no published lessons — a real state (a course
   * published before its content lands), and the caller renders it as a
   * disabled button rather than navigating to `/lessons/null`.
   */
  private async firstLessonId(courseId: string): Promise<string | null> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { courseId, isPublished: true, section: { isPublished: true } },
      orderBy: [
        { section: { position: 'asc' } },
        { section: { id: 'asc' } },
        { position: 'asc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });
    return lesson?.id ?? null;
  }

  /**
   * Enroll, creating the platform grant if this is the student's first course.
   *
   * `resumeLessonId` is what makes the course page's single "ابدأ الكورس"
   * button cost ONE round trip
   * (`2026-08-03-login-gated-content-design.md` §5.1). Without it the client
   * has to enroll and then fetch the outline just to learn where to navigate,
   * putting a second sequential request on the critical path of the product's
   * primary action.
   *
   * The upsert is what makes the button idempotent: a student who is already
   * enrolled and clicks again re-enters the same enrollment and resumes where
   * they stopped, rather than creating a second one or being told "already
   * enrolled".
   */
  async enroll(
    userId: string,
    courseId: string,
  ): Promise<{ enrollmentId: string; access: CourseAccess; resumeLessonId: string | null }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, requiresGrant: true },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();

    /*
     * The platform grant is created for EVERY student, closed course or not.
     *
     * It is not what opens this course — `resolveCourseAccess` drops `platform`
     * from the satisfying scopes when `requiresGrant` is set — it is the row
     * that records when this student started using the platform at all, and
     * every free course they take depends on it. Skipping it here for a student
     * whose first click happened to be a closed course would leave them with no
     * grant at all and every FREE course shut too.
     */
    await this.ensurePlatformGrant(userId);

    /*
     * REFUSED BEFORE THE ENROLLMENT ROW EXISTS, and the order is the point.
     *
     * `LessonAccessService` gates every lesson, video, resource and quiz on an
     * active enrollment and nothing else. So the enrollment IS the key, and the
     * only safe place to check entitlement is before one is minted — a row
     * created first and judged after is a door already open.
     *
     * This runs for every enrollment, not just closed ones: a course flipped to
     * `requiresGrant` after a student enrolled keeps that student in (their row
     * already exists and `upsert` only revives it), which is the deliberate
     * answer to "what happens to the forty students already inside" — they
     * finish. New students meet this.
     */
    const access = await this.resolveCourseAccess(userId, courseId);
    if (!access.allowed) {
      // The reason travels: `needs_course_grant` is «الكورس ده مقفول» to a
      // student, and `expired` is «انتهت صلاحيتك» — a 403 with no reason is
      // the support ticket this service's return type exists to prevent.
      throw new ForbiddenException(access.reason);
    }

    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: { status: 'active' },
      select: { id: true, lastLessonId: true },
    });

    return {
      enrollmentId: enrollment.id,
      access,
      // Where they stopped wins; the opening lesson is the fallback for a
      // first enrollment.
      resumeLessonId: enrollment.lastLessonId ?? (await this.firstLessonId(courseId)),
    };
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
