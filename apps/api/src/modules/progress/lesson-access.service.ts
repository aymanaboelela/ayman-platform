import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { LessonKind } from '@ayman/contracts';
import { isPrismaDataValidationError } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { EntitlementService, type CourseAccess } from '../entitlement/entitlement.service';
import { LessonGateService } from './lesson-gate.service';

export interface LessonAccessContext {
  lessonId: string;
  kind: LessonKind;
  courseId: string;
  courseSlug: string;
  enrollmentId: string;
  /** 0 when unknown — auto-completion is then impossible by design. */
  durationSeconds: number;
  /** The term this lesson's SECTION belongs to, or `null` when the course has
   *  no terms configured (or this section was never assigned to one). Only
   *  ever consulted by `require()` — see its own term-gating comment. */
  termId: string | null;
}

/**
 * Which of `resolveCourseAccess`'s denial reasons `require()` treats as a NEW
 * cutoff for a student who is already enrolled — as opposed to a reason that
 * only describes today's ENROLLMENT-time policy.
 *
 * `expired` / `revoked` / `not_yet_valid` all mean: this student was given a
 * specific grant, and right now it does not cover them. That is exactly the
 * gap `EntitlementService.enroll()` checks once, at signup, and this class
 * never re-checked — a purchased subscription's `AccessGrant.validUntil`
 * lapsing had no effect on a student already inside the course.
 *
 * `no_grant` / `needs_course_grant` are deliberately EXCLUDED. Those describe
 * `Course.requiresGrant`'s CURRENT value, which `EntitlementService.enroll`
 * already documents as an enrollment-time gate only — see its own "does not
 * shut out a student who enrolled BEFORE it was closed" test. A course closed
 * to new students after this one joined must not evict them; re-applying that
 * scope policy on every lesson open would silently break that promise.
 */
const LAPSED_GRANT_REASONS: ReadonlySet<Extract<CourseAccess, { allowed: false }>['reason']> =
  new Set(['expired', 'revoked', 'not_yet_valid']);

/**
 * The single gate every progress write goes through.
 *
 * Spec §7 P1: ownership is compiled INTO the query. The `where` clause below
 * contains `enrollments: { some: { userId } }`, so an unenrolled caller gets
 * no row at all — there is no fetched object for a later `if` to forget to
 * check. Both "no such lesson" and "not your lesson" resolve to 404: a 403
 * would confirm the existence of unpublished content to anyone iterating ids.
 */
@Injectable()
export class LessonAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: LessonGateService,
    private readonly entitlement: EntitlementService,
  ) {}

  /**
   * Ownership and publication ONLY — the progression gate is deliberately not
   * consulted.
   *
   * For finishing something the student already legitimately started. The
   * codebase already holds this line elsewhere (see `gradeAndFinalise`'s B2
   * note: "a mid-attempt unpublish must not make an in-flight attempt
   * unsubmittable"), and the gate can move underneath a live attempt in one
   * real way — an admin publishes a new lesson while a student is sitting the
   * exam, which flips `everyOtherCleared` to false. Submitting that attempt,
   * or appealing its grade afterwards, must not become impossible because of
   * something the student had no part in.
   *
   * Nothing here can be used to REACH new content: every caller already holds
   * an attempt or an appeal that was created through the gated path below.
   */
  async requireOwnership(userId: string, lessonId: string): Promise<LessonAccessContext> {
    return this.resolve(userId, lessonId);
  }

  /**
   * Ownership, publication, AND the progression gate. The default, and what
   * every path that OPENS something uses.
   *
   * A locked lesson throws the same `NotFoundException` as a nonexistent one:
   * a 403 would confirm to anyone iterating ids that lesson 7 exists and is
   * merely out of reach, which is the enumeration oracle the 404-not-403 rule
   * exists to close.
   */
  async require(userId: string, lessonId: string): Promise<LessonAccessContext> {
    const context = await this.resolve(userId, lessonId);

    /*
     * The live-grant re-check. `resolve()` above only proves the ENROLLMENT
     * row is active — it never looks at `AccessGrant.validUntil`, and neither
     * did anything else on this path (see this class's own docblock:
     * ownership and publication "and nothing else"). `resolveCourseAccess` is
     * the one place that logic already lives; this is a 403 with the same
     * `reason` the enroll-time check already throws (`ForbiddenException`,
     * caught by the frontend's existing "your access lapsed" handling),
     * rather than a 404 that would read as the course having vanished — a
     * student who was already inside deserves the real reason and a path
     * back to renewing.
     */
    const access = await this.entitlement.resolveCourseAccess(userId, context.courseId);
    if (!access.allowed && LAPSED_GRANT_REASONS.has(access.reason)) {
      throw new ForbiddenException(access.reason);
    }

    /*
     * The TERM re-check — orthogonal to the lapsed-grant check above, and
     * deliberately not folded into it. A course-wide grant (`platform`,
     * `course`, `subject_teacher`) covers every term regardless of open/
     * closed state, so this only ever runs any real check when the access
     * this student's course-level standing rests on is ITSELF `scope: term`
     * — `resolveTermAccess` returns its input unchanged for every other case,
     * including the grandfather denial the check above already let through.
     *
     * A student blocked here never held (or no longer holds) a live grant for
     * THIS lesson's term specifically — most commonly because an admin closed
     * it, which bulk-revokes every live term grant for it (see
     * `TermService.setOpen`) and surfaces here as `reason: 'revoked'`, the
     * exact same word a lapsed course subscription already throws above.
     */
    if (context.termId !== null) {
      const termAccess = await this.entitlement.resolveTermAccess(
        userId,
        context.courseId,
        context.termId,
        access,
      );
      if (!termAccess.allowed) {
        throw new ForbiddenException(termAccess.reason);
      }
    }

    const available = await this.gate.isAvailable(
      context.enrollmentId,
      context.courseId,
      context.lessonId,
    );
    if (!available) {
      throw new NotFoundException('lesson not found');
    }

    return context;
  }

  private async resolve(userId: string, lessonId: string): Promise<LessonAccessContext> {
    // `lessonId` is a raw `@Param()` string, never Zod-validated the way a
    // request body is — a caller iterating ids (exactly the case this
    // method's own 404-not-403 comment defends against) can send something
    // that isn't even UUID-shaped. `lessons.id` is `uuid`, so Postgres itself
    // rejects that with `invalid input syntax for type uuid` (Prisma code
    // `P2007`) instead of the query simply matching zero rows the way a
    // `text` column always did. From the caller's point of view "not a real
    // id" and "a real id that doesn't exist" are the same answer, so both
    // fall through to the identical 404 below.
    const lesson = await this.prisma.lesson
      .findFirst({
        where: {
          id: lessonId,
          isPublished: true,
          course: {
            status: 'published',
            enrollments: { some: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } } },
          },
        },
        // An explicit select, never an include — nothing leaves this query that
        // was not asked for by name.
        select: {
          id: true,
          kind: true,
          courseId: true,
          course: {
            select: {
              slug: true,
              enrollments: {
                where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
                select: { id: true },
                take: 1,
              },
            },
          },
          section: { select: { termId: true } },
          video: { select: { durationSeconds: true } },
        },
      })
      .catch((error: unknown) => {
        if (isPrismaDataValidationError(error)) return null;
        throw error;
      });

    const enrollmentId = lesson?.course.enrollments[0]?.id;
    if (!lesson || !enrollmentId) {
      throw new NotFoundException('lesson not found');
    }

    return {
      lessonId: lesson.id,
      kind: lesson.kind as LessonKind,
      courseId: lesson.courseId,
      courseSlug: lesson.course.slug,
      enrollmentId,
      durationSeconds: lesson.video?.durationSeconds ?? 0,
      termId: lesson.section.termId,
    };
  }
}
