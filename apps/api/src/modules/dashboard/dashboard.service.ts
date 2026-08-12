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
    /*
      Started, not awaited.

      `ScoreFeed.recentFor` is keyed on `userId` alone (see `score-feed.ts` —
      the signature is frozen), so it shares nothing with the enrolment reads
      below and has no reason to queue behind them. Awaited last, in the return
      object, where its result is actually needed; in between it overlaps the
      widest query on this path.

      Nothing here is inside a `$transaction`, and it never was — each Prisma
      call already took its own snapshot. Overlapping them therefore changes no
      isolation guarantee: two reads issued back to back saw two snapshots
      taken further apart than these do.
    */
    const scores = this.scores.recentFor(userId, RECENT_SCORE_LIMIT);

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
            coverKey: true,
            subject: { select: { nameAr: true } },
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
      /*
        This branch still answers `recentScores: []` without consulting the
        feed, which is deliberate and pre-existing: a student whose only
        enrolment was cancelled, or whose course was unpublished, may well
        still have submitted attempts, and the dashboard has always treated
        "nothing to show" as covering the whole payload.

        The cost of starting the promise above is therefore one wasted query on
        this path. What is NOT optional is the catch: the promise is in flight
        and nothing awaits it, so a database that is down would reject into
        nowhere — and an unhandled rejection is a process exit under Node's
        default, turning a failed read for one student into a dead API pod.
      */
      void scores.catch(() => {});
      return { continueWatching: null, enrolledCourses: [], recentScores: [] };
    }

    /*
      Most recently touched enrollment that still has a live resume target.

      Resolved from `enrollments` in memory — it costs no query — which is the
      whole reason it sits up here rather than below the counts: knowing the
      resume target this early is what lets its watched position be asked for
      alongside the grouped counts instead of after them.
    */
    const resumable = enrollments.find((row) => row.lastLesson != null);

    // Two reads that need the enrolments but not each other: one grouped count
    // spanning every course at once (rather than one query per course), and
    // one row for the resume position. Sequentially they were two full
    // round trips to Postgres; together they are one wait.
    const [completedByEnrollment, resumeProgress] = await Promise.all([
      this.prisma.lessonProgress.groupBy({
        by: ['enrollmentId'],
        where: {
          enrollmentId: { in: enrollments.map((row) => row.id) },
          state: { in: ['completed', 'passed'] },
          lesson: { isPublished: true },
        },
        _count: { _all: true },
      }),
      resumable?.lastLesson
        ? this.prisma.lessonProgress.findUnique({
            where: {
              enrollmentId_lessonId: {
                enrollmentId: resumable.id,
                lessonId: resumable.lastLesson.id,
              },
            },
            select: { maxPositionSeconds: true },
          })
        : null,
    ]);

    const completedCounts = new Map(
      completedByEnrollment.map((row) => [row.enrollmentId, row._count._all]),
    );

    const enrolledCourses: EnrolledCourse[] = enrollments.map((row) => ({
      id: row.course.id,
      slug: row.course.slug,
      title: row.course.title,
      coverKey: row.course.coverKey,
      subjectNameAr: row.course.subject.nameAr,
      progressPercent: Number(row.progressPercent),
      completedLessons: completedCounts.get(row.id) ?? 0,
      totalLessons: row.course._count.lessons,
      lastLessonId: row.lastLesson?.id ?? null,
    }));

    let continueWatching: Dashboard['continueWatching'] = null;
    if (resumable?.lastLesson) {
      const lesson = resumable.lastLesson;
      const duration = lesson.video?.durationSeconds ?? 0;

      continueWatching = {
        courseId: resumable.course.id,
        courseSlug: resumable.course.slug,
        courseTitle: resumable.course.title,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonKind: lesson.kind as LessonKind,
        progressPercent: Number(resumable.progressPercent),
        remainingSeconds:
          duration > 0 ? Math.max(duration - (resumeProgress?.maxPositionSeconds ?? 0), 0) : 0,
      };
    }

    return {
      continueWatching,
      enrolledCourses,
      recentScores: await scores,
    };
  }
}
