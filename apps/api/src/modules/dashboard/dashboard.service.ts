import { Inject, Injectable } from '@nestjs/common';
import type { Dashboard, EnrolledCourse, LessonKind, PendingExam } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { SCORE_FEED, type ScoreFeed } from './score-feed';

const RECENT_SCORE_LIMIT = 5;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: LessonGateService,
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
        /*
         * ⚠️ NO `course: { status: 'published' }` here any more, and that is
         * the change.
         *
         * It read `course: { status: 'published' }`, so a course the
         * instructor took down to edit vanished off «كورساتي» and out of the
         * rail with no word to the student who is enrolled in it — while
         * `/path`, which had no filter at all, went on drawing it as a run of
         * links that every one 404'd. Two screens, two different wrong answers
         * about one course.
         *
         * Both report it now, and both say «مقفول مؤقتاً». The filtering that
         * still matters is done per-field below: `lastLessonId` and
         * `continueWatching` are nulled for a closed course, so nothing offers
         * a resume target the routes will refuse.
         */
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
            // Selected, not filtered on — see the `where` above.
            status: true,
            coverKey: true,
            examLessonId: true,
            // Only ever read for a course whose exam is open and untouched —
            // see `pendingExams` below. Most courses have none.
            examLesson: { select: { id: true, title: true } },
            subject: { select: { nameAr: true } },
            // Lectures only — a quiz is the lecture's check, not a row a
            // student counts. Same predicate as the catalog and the path.
            _count: {
              select: { lessons: { where: { isPublished: true, kind: { not: 'quiz' } } } },
            },
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
      return { continueWatching: null, enrolledCourses: [], recentScores: [], pendingExams: [] };
    }

    /*
      Most recently touched enrollment that still has a live resume target.

      Resolved from `enrollments` in memory — it costs no query — which is the
      whole reason it sits up here rather than below the counts: knowing the
      resume target this early is what lets its watched position be asked for
      alongside the grouped counts instead of after them.
    */
    /*
      …and it must be a course that can actually be OPENED.

      `row.lastLesson` only proves the lesson is published; the course around it
      can have been taken down since. Without the second half of this condition
      the biggest card on the dashboard — «نكمّل من مكانك», the one thing the
      page is organised around — would be a link into a 404 the moment an
      instructor started editing.
    */
    const resumable = enrollments.find(
      (row) => row.lastLesson != null && row.course.status === 'published',
    );

    /*
     * A candidate for `pendingExams`: published (an archived/unpublished
     * course opens nothing) and carrying an exam lesson at all. Most of
     * `LessonGateService.resolveCourse`'s work — two more queries per course
     * — is skipped for every course that fails either half.
     */
    const examCandidates = enrollments.filter(
      (row) => row.course.status === 'published' && row.course.examLessonId !== null,
    );

    // Four reads that need the enrolments but not each other: one grouped
    // count spanning every course at once (rather than one query per
    // course), one row for the resume position, one gate resolution per
    // exam candidate, and that candidate set's own progress rows. Issued
    // together rather than as four round trips to Postgres.
    const [completedByEnrollment, resumeProgress, examGates, examProgressRows] =
      await Promise.all([
        this.prisma.lessonProgress.groupBy({
          by: ['enrollmentId'],
          where: {
            enrollmentId: { in: enrollments.map((row) => row.id) },
            state: { in: ['completed', 'passed'] },
            lesson: { isPublished: true, kind: { not: 'quiz' } },
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
        // The SAME resolver `/path` and the lesson routes themselves consult
        // — never re-derived here. A gate computed independently would
        // eventually disagree with the one the routes enforce, and this
        // list would open a door that 404s.
        Promise.all(examCandidates.map((row) => this.gate.resolveCourse(row.id, row.course.id))),
        // Whether the exam itself has been touched. The gate alone cannot
        // answer this: a FAILED exam with its improvement sitting still
        // unspent resolves to the exact same `available` gate state as one
        // never opened at all — see `PendingExamSchema`.
        examCandidates.length > 0
          ? this.prisma.lessonProgress.findMany({
              where: {
                enrollmentId: { in: examCandidates.map((row) => row.id) },
                lessonId: { in: examCandidates.map((row) => row.course.examLessonId!) },
              },
              select: { enrollmentId: true, state: true },
            })
          : Promise.resolve([]),
      ]);

    const completedCounts = new Map(
      completedByEnrollment.map((row) => [row.enrollmentId, row._count._all]),
    );

    const examStateByEnrollment = new Map(
      examProgressRows.map((row) => [row.enrollmentId, row.state as string]),
    );

    const pendingExams: PendingExam[] = [];
    examCandidates.forEach((row, index) => {
      const examLessonId = row.course.examLessonId;
      const examLesson = row.course.examLesson;
      if (examLessonId === null || examLesson === null) return;

      const gateState = examGates[index]!.get(examLessonId);
      // Absent from `examProgressRows` means no `LessonProgress` row exists
      // at all — the same "not_started" default `LessonGateService` and
      // `PathService` both use.
      const progressState = examStateByEnrollment.get(row.id) ?? 'not_started';

      if (gateState === 'available' && progressState === 'not_started') {
        pendingExams.push({
          courseId: row.course.id,
          courseSlug: row.course.slug,
          courseTitle: row.course.title,
          lessonId: examLesson.id,
          lessonTitle: examLesson.title,
        });
      }
    });

    const enrolledCourses: EnrolledCourse[] = enrollments.map((row) => {
      // `archived` is closed too: only a genuinely published course is
      // openable, and every screen here has to agree with the routes.
      const published = row.course.status === 'published';

      return {
        id: row.course.id,
        slug: row.course.slug,
        title: row.course.title,
        coverKey: row.course.coverKey,
        subjectNameAr: row.course.subject.nameAr,
        published,
        progressPercent: Number(row.progressPercent),
        completedLessons: completedCounts.get(row.id) ?? 0,
        totalLessons: row.course._count.lessons,
        // Null while closed. `enrolledCourseHref` builds «نكمّل» out of this,
        // and the rail builds its row link out of the same helper, so a value
        // here is two more presses into a refusal.
        lastLessonId: published ? (row.lastLesson?.id ?? null) : null,
      };
    });

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
      pendingExams,
    };
  }
}
