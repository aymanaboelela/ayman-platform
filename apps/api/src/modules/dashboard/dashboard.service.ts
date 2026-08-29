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
            // The admin's «لسه هننزل قريبًا» wording — meaningful only once
            // `_count.lessons` below reads `0`, same as the public course
            // page's `comingSoonNote`. See `isComingSoon` in `catalog.ts`.
            comingSoonNote: true,
            // Same pair the catalog reads — gates `EnrolledCourseCard`'s own
            // «اطلب الكتاب» CTA. See `EnrolledCourseSchema`'s own note.
            bookTitle: true,
            bookPriceCents: true,
            subject: { select: { nameAr: true } },
            // Lectures only — a quiz is the lecture's check, not a row a
            // student counts. Same predicate as the catalog and the path.
            //
            // `section: { isPublished: true }` is load-bearing, same reason
            // it is in `CourseProgressService.recalculate`'s own `reachable`
            // set: a lesson published inside an unpublished section is
            // invisible to the student (the outline never shows it, they can
            // never open or complete it) but was still landing in THIS
            // denominator — so a course could read «٠ من ١ درس» here while
            // `progressPercent` (computed against the stricter set) had
            // already reached 100, and the card showed a finished-course
            // badge over what looked like an untouched one. The two counts
            // must walk the same set `recalculate` does, or they drift.
            _count: {
              select: {
                lessons: {
                  where: { isPublished: true, section: { isPublished: true }, kind: { not: 'quiz' } },
                },
              },
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
      return { continueWatching: null, enrolledCourses: [], recentScores: [] };
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

    // Three reads that need the enrolments but not each other: one grouped
    // count spanning every course at once (rather than one query per
    // course), one row for the resume position, and the live subscription
    // expiry per course. Sequentially they were three full round trips to
    // Postgres; together they are one wait.
    const [completedByEnrollment, resumeProgress, purchaseGrants] = await Promise.all([
      this.prisma.lessonProgress.groupBy({
        by: ['enrollmentId'],
        where: {
          enrollmentId: { in: enrollments.map((row) => row.id) },
          state: { in: ['completed', 'passed'] },
          // Same `section: { isPublished: true }` fix as the denominator
          // above — the numerator must walk the identical set, or a
          // completion inside an unpublished section could count here but
          // not there (or vice versa) and the displayed fraction would
          // disagree with `progressPercent` again in the other direction.
          lesson: { isPublished: true, section: { isPublished: true }, kind: { not: 'quiz' } },
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
      // The CURRENT `validUntil` of this student's live `purchase` grant per
      // course — same rule `PaymentsService.listMine` follows for the same
      // reason: a renewal extends one grant, so every screen should read
      // that grant's up-to-date expiry rather than a value frozen at
      // whichever payment happened to be approved first.
      this.prisma.accessGrant.findMany({
        where: {
          userId,
          scope: 'course',
          source: 'purchase',
          revokedAt: null,
          courseId: { in: enrollments.map((row) => row.course.id) },
        },
        select: { courseId: true, validUntil: true },
      }),
    ]);

    const completedCounts = new Map(
      completedByEnrollment.map((row) => [row.enrollmentId, row._count._all]),
    );
    const subscriptionExpiry = new Map(
      purchaseGrants
        .filter((grant): grant is typeof grant & { courseId: string } => grant.courseId !== null)
        .map((grant) => [grant.courseId, grant.validUntil]),
    );

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
        subscriptionValidUntil: subscriptionExpiry.get(row.course.id)?.toISOString() ?? null,
        comingSoonNote: row.course.comingSoonNote,
        bookTitle: row.course.bookTitle,
        bookPriceCents: row.course.bookPriceCents,
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
    };
  }
}
