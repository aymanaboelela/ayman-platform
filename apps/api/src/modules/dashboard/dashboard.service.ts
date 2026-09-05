import { Inject, Injectable } from '@nestjs/common';
import type { Dashboard, EnrolledCourse, LessonKind, PendingExam } from '@ayman/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { SCORE_FEED, type ScoreFeed } from './score-feed';
import { COURSE_BOOK_SELECT, courseBook } from '../books/course-book';

const RECENT_SCORE_LIMIT = 5;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCORE_FEED) private readonly scores: ScoreFeed,
    private readonly lessonGate: LessonGateService,
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
            // «ميعاد المحاضرة» — the instructor's own line for THIS course,
            // printed verbatim in the hero band. Per-course and not a site
            // setting for the reason the column's own doc gives: عربي and لغات
            // are two courses on two different nights, and a student is in one
            // of them.
            scheduleNote: true,
            contentComplete: true,
            // Gates `EnrolledCourseCard`'s own «اطلب الكتاب» CTA. The legacy
            // pair plus the catalogue row, because `courseBook()` needs both:
            // the row wins when it is live, and these two are the ramp for
            // courses whose row is still unpublished. Reading only the pair —
            // which is what this did — is how the card quoted a price the
            // catalogue had already changed.
            bookTitle: true,
            bookPriceCents: true,
            book: { select: COURSE_BOOK_SELECT },
            subject: { select: { nameAr: true } },
            // The exam lesson, if this course has one — read here rather than
            // with a second query per course. `examLesson` is only selected
            // (id + title) for the pending-exams computation below; it is
            // never sent to the client under this shape.
            examLessonId: true,
            examLesson: { select: { id: true, title: true } },
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
      return {
        continueWatching: null,
        enrolledCourses: [],
        recentScores: [],
        totalWatchedSeconds: 0,
        pendingExams: [],
      };
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
      Candidates for «امتحانات في انتظارك»: published courses this student
      actually has an exam lesson to sit. Filtered here, in memory, off the
      enrolments already fetched — resolving the gate below for a course with
      no exam, or one taken down, would be a wasted round trip to answer a
      question that is already "no".
    */
    const candidateExams = enrollments.filter(
      (row) => row.course.status === 'published' && row.course.examLessonId !== null,
    );

    // Five reads that need the enrolments but not each other: one grouped
    // count spanning every course at once (rather than one query per
    // course), one row for the resume position, the live subscription
    // expiry per course, the summed watch time behind «ساعات التعلم», and the
    // exam gate + progress state behind «امتحانات في انتظارك». Sequentially
    // these were five full round trips to Postgres; together they are one wait.
    const [completedByEnrollment, resumeProgress, purchaseGrants, watchedAgg, examProgressRows, examGates] =
      await Promise.all([
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
      // Real watch time, summed across every enrolment — «ساعات التعلم» is
      // derived from this on the web side (`summarise()`), not faked from a
      // lesson count. `_sum` is `null` only when there is not one
      // `lessonProgress` row yet, which `?? 0` below covers.
      this.prisma.lessonProgress.aggregate({
        where: { enrollmentId: { in: enrollments.map((row) => row.id) } },
        _sum: { watchedSeconds: true },
      }),
      // The exam's own `LessonProgress` row, if one exists — the ONLY source
      // for `state`. The gate below can only say "open" or "locked"; it
      // cannot tell a untouched exam apart from a `failed` one (an
      // improvement sitting still owed), and a `failed` exam belongs to
      // `ExamsSection`, not this card.
      candidateExams.length > 0
        ? this.prisma.lessonProgress.findMany({
            where: {
              enrollmentId: { in: candidateExams.map((row) => row.id) },
              lessonId: { in: candidateExams.map((row) => row.course.examLessonId as string) },
            },
            select: { enrollmentId: true, state: true },
          })
        : Promise.resolve([]),
      // One gate resolution per candidate course. `LessonGateService` is the
      // same authority the player routes enforce, so this card can never
      // claim a course is ready when a lecture is still outstanding — see
      // `resolveGate`'s own rule for why the exam only opens once every other
      // lecture clears.
      Promise.all(
        candidateExams.map(async (row) => {
          const gate = await this.lessonGate.resolveCourse(row.id, row.course.id);
          return { enrollmentId: row.id, state: gate.get(row.course.examLessonId as string) };
        }),
      ),
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
        // Carried even while the course is CLOSED, unlike `lastLessonId` above.
        // The two are opposite kinds of field: that one is a link into a lesson
        // the routes would refuse, this one is a sentence — a student whose
        // course is down for an edit still needs to know they are expected on
        // Saturday at eight.
        scheduleNote: row.course.scheduleNote,
        contentComplete: row.course.contentComplete,
        bookTitle: courseBook(row.course).bookTitle,
        bookPriceCents: courseBook(row.course).bookPriceCents,
      };
    });

    /*
      «امتحانات في انتظارك» — every candidate whose exam gate is `available`
      AND whose own progress row is absent or `not_started`.

      Absent-from-the-query-results means not-started too (a student who has
      never opened the exam has no `LessonProgress` row for it at all), which
      is why the map below defaults a miss to `'not_started'` rather than
      treating it as "unknown". `'failed'` is excluded on purpose: that is an
      improvement sitting still owed, and it is `ExamsSection`'s row to show,
      not this card's — showing it in both places would tell the same student
      to do the same exam from two different cards with two different verbs.
    */
    const examStateByEnrollment = new Map(
      examProgressRows.map((row) => [row.enrollmentId, row.state as string]),
    );
    const examGateByEnrollment = new Map(examGates.map((row) => [row.enrollmentId, row.state]));

    const pendingExams: PendingExam[] = candidateExams
      .filter((row) => {
        if (examGateByEnrollment.get(row.id) !== 'available') return false;
        const state = examStateByEnrollment.get(row.id) ?? 'not_started';
        return state === 'not_started';
      })
      .map((row) => ({
        courseId: row.course.id,
        courseSlug: row.course.slug,
        courseTitle: row.course.title,
        // Guaranteed non-null: this row came out of `candidateExams`, which
        // already filtered on `examLessonId !== null`.
        lessonId: row.course.examLessonId as string,
        lessonTitle: row.course.examLesson?.title ?? '',
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
      totalWatchedSeconds: watchedAgg._sum.watchedSeconds ?? 0,
      pendingExams,
    };
  }
}
