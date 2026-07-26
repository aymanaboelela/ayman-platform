import { Injectable, NotFoundException } from '@nestjs/common';
import type { LessonKind } from '@ayman/contracts';
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
    const lesson = await this.prisma.lesson.findFirst({
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
