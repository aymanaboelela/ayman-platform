import { Injectable, NotFoundException } from '@nestjs/common';
import type { LessonKind } from '@ayman/contracts';
import { isPrismaDataValidationError } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonGateService } from './lesson-gate.service';

export interface LessonAccessContext {
  lessonId: string;
  kind: LessonKind;
  courseId: string;
  courseSlug: string;
  enrollmentId: string;
  /** 0 when unknown — auto-completion is then impossible by design. */
  durationSeconds: number;
}

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
    };
  }
}
