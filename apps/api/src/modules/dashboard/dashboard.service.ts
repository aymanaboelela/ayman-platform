import { Inject, Injectable } from '@nestjs/common';
import type { Dashboard, EnrolledCourse, LessonKind } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { SCORE_FEED, type ScoreFeed } from './score-feed';

const RECENT_SCORE_LIMIT = 5;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCORE_FEED) private readonly scores: ScoreFeed,
  ) {}

  async forUser(userId: string): Promise<Dashboard> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        userId,
        status: { in: [...ACTIVE_ENROLLMENT_STATUSES] },
        course: { status: 'published' },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        progressPercent: true,
        lastLessonId: true,
        updatedAt: true,
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            _count: { select: { lessons: { where: { isPublished: true } } } },
          },
        },
        // The resume target, resolved in the same round trip. `isPublished`
        // is part of the filter, so a lesson unpublished after the student
        // last opened it simply resolves to nothing rather than to a dead link.
        lastLesson: {
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            kind: true,
            video: { select: { durationSeconds: true } },
          },
        },
      },
    });

    if (enrollments.length === 0) {
      return { continueWatching: null, enrolledCourses: [], recentScores: [] };
    }

    // One grouped query for every course at once, rather than one per course.
    const completedByEnrollment = await this.prisma.lessonProgress.groupBy({
      by: ['enrollmentId'],
      where: {
        enrollmentId: { in: enrollments.map((row) => row.id) },
        state: { in: ['completed', 'passed'] },
        lesson: { isPublished: true },
      },
      _count: { _all: true },
    });
    const completedCounts = new Map(
      completedByEnrollment.map((row) => [row.enrollmentId, row._count._all]),
    );

    const enrolledCourses: EnrolledCourse[] = enrollments.map((row) => ({
      id: row.course.id,
      slug: row.course.slug,
      title: row.course.title,
      progressPercent: Number(row.progressPercent),
      completedLessons: completedCounts.get(row.id) ?? 0,
      totalLessons: row.course._count.lessons,
      lastLessonId: row.lastLesson?.id ?? null,
    }));

    // Most recently touched enrollment that still has a live resume target.
    const resumable = enrollments.find((row) => row.lastLesson != null);

    let continueWatching: Dashboard['continueWatching'] = null;
    if (resumable?.lastLesson) {
      const lesson = resumable.lastLesson;
      const duration = lesson.video?.durationSeconds ?? 0;
      const progress = await this.prisma.lessonProgress.findUnique({
        where: {
          enrollmentId_lessonId: { enrollmentId: resumable.id, lessonId: lesson.id },
        },
        select: { maxPositionSeconds: true },
      });

      continueWatching = {
        courseId: resumable.course.id,
        courseSlug: resumable.course.slug,
        courseTitle: resumable.course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonKind: lesson.kind as LessonKind,
        progressPercent: Number(resumable.progressPercent),
        remainingSeconds:
          duration > 0 ? Math.max(duration - (progress?.maxPositionSeconds ?? 0), 0) : 0,
      };
    }

    return {
      continueWatching,
      enrolledCourses,
      recentScores: await this.scores.recentFor(userId, RECENT_SCORE_LIMIT),
    };
  }
}
