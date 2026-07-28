import { Injectable, NotFoundException } from '@nestjs/common';
import type { LessonKind } from '@ayman/contracts';
import { isPrismaDataValidationError } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async require(userId: string, lessonId: string): Promise<LessonAccessContext> {
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
