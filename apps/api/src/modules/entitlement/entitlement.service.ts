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
        | 'needs_course_grant'
        /**
         * ONLY ever produced by `resolveTermAccess`, never by
         * `resolveCourseAccess` itself — a course has no notion of "which
         * term", so this reason cannot occur at that granularity. It means:
         * this student's course-level access is a `scope: term` grant, but not
         * one that covers THIS lesson's term — either they never held one for
         * it, or it was revoked when an admin closed the term. Distinct from
         * `needs_course_grant` for the same reason that one is distinct from
         * `no_grant`: a different sentence («لازم تشترك في الترم ده») and a
         * different admin action.
         */
        | 'needs_term_grant';
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
     * A free course is satisfied by any of the four, including the
     * platform-wide "v1 is free for everyone" grant. A closed one drops
     * `platform` from the list, so it takes a grant naming this course (or its
     * subject, or one of its terms) specifically.
     *
     * `term` is included in BOTH branches, matched on `courseId` alone (never
     * `termId` here) — this method answers "does this student have SOME
     * access to this course at all" (the enroll-time question), not "which
     * term". A term-only buyer must still be able to enrol; the per-lesson
     * "is it THIS term" question is `resolveTermAccess`'s alone, and
     * `LessonAccessService.require` is the only caller that asks it.
     *
     * Note what does NOT change: access is still decided by reading grants,
     * with their scopes and validity windows, and never by a column on the
     * course. The schema's warning against a boolean `isFree` is about exactly
     * that shortcut, and this is not it.
     */
    const scopes = course.requiresGrant
      ? [
          { scope: 'course' as const, courseId },
          { scope: 'subject_teacher' as const, subjectId: course.subjectId },
          { scope: 'term' as const, courseId },
        ]
      : [
          { scope: 'platform' as const },
          { scope: 'course' as const, courseId },
          { scope: 'subject_teacher' as const, subjectId: course.subjectId },
          { scope: 'term' as const, courseId },
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
   * The per-TERM refinement of `resolveCourseAccess`, called only by
   * `LessonAccessService.require` and only when a lesson's section belongs to
   * a term.
   *
   * `resolveCourseAccess` alone cannot answer "is it open for THIS lesson":
   * its scopes match a `term` grant on `courseId` alone (any term), and it
   * returns the single most-recent LIVE one across every matching scope — so
   * a student holding a live grant for «الترم الأول» reads as course-access
   * `allowed: true, scope: 'term'` even when the lesson being opened belongs
   * to «الترم الثاني». This method is the exact-term check that closes that
   * gap.
   *
   * Deliberately takes the ALREADY-RESOLVED `courseAccess` rather than
   * recomputing it — `require()` already has it (it needed it for the
   * lapsed-grant re-check first), and recomputing here would risk the two
   * disagreeing about which grant "won" under a concurrent write.
   */
  async resolveTermAccess(
    userId: string,
    courseId: string,
    termId: string,
    courseAccess: CourseAccess,
  ): Promise<CourseAccess> {
    /*
     * A course-wide scope (platform/course/subject_teacher) covers EVERY term
     * regardless of open/closed state — requirement 5 of the feature, stated
     * once here rather than re-derived at every call site. Only `scope:
     * 'term'` is ever term-specific.
     *
     * `!courseAccess.allowed` also returns as-is: `resolveCourseAccess` only
     * matches a `term`-scope grant when at least one exists for the course,
     * so "no live grant of ANY matching scope" already proves there is no
     * live term grant either — nothing here can find one it missed. This also
     * preserves the grandfather case `LessonAccessService.require` documents
     * (a student enrolled before a policy tightened): that method only ever
     * reaches this call when `courseAccess.allowed` is true, so the
     * `!allowed` branch is dead in practice today and kept only so this
     * method's contract does not silently depend on that.
     */
    if (!courseAccess.allowed || courseAccess.scope !== 'term') {
      return courseAccess;
    }

    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, scope: 'term', courseId, termId },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: { id: true, validFrom: true, validUntil: true, revokedAt: true },
    });

    const now = new Date();
    let fallback: CourseAccess = { allowed: false, reason: 'needs_term_grant' };

    for (const grant of grants) {
      if (grant.revokedAt !== null) {
        // The bulk-revoke-on-close outcome, seen from the lesson side: the
        // same `revoked` reason `LessonAccessService.require`'s existing
        // lapsed-grant check already throws on for a cancelled course
        // subscription.
        fallback = { allowed: false, reason: 'revoked' };
        continue;
      }
      if (grant.validFrom > now) {
        fallback = { allowed: false, reason: 'not_yet_valid' };
        continue;
      }
      // A term grant's `validUntil` is always `null` (see the model doc), so
      // this branch is unreachable for one in practice — kept for symmetry
      // with `resolveCourseAccess` and so a future change to that invariant
      // does not silently stop being checked here.
      if (grant.validUntil !== null && grant.validUntil <= now) {
        fallback = { allowed: false, reason: 'expired' };
        continue;
      }
      return { allowed: true, grantId: grant.id, scope: 'term', validUntil: grant.validUntil };
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
