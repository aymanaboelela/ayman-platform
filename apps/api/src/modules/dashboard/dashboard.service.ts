import { Inject, Injectable } from '@nestjs/common';
import type {
  Dashboard,
  DashboardMonthOffer,
  EnrolledCourse,
  LessonKind,
  PendingExam,
} from '@ayman/contracts';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { courseAccessScopes } from '../entitlement/grant-liveness';
import { lessonFilterWithCodes, resolveContentAccess } from '../entitlement/content-access-query';
import { monthSliceOf, type MonthSlice } from '../entitlement/month-access';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import { LessonGateService } from '../progress/lesson-gate.service';
import { SCORE_FEED, type ScoreFeed } from './score-feed';
import { COURSE_BOOK_SELECT, courseBook } from '../books/course-book';
import { chipFromProfile, courseChip, honorDayKey } from '../catalog/honor-board';

const RECENT_SCORE_LIMIT = 5;

/** قد إيه «مبروك» تفضل على الشاشة — أسبوعين. اقرا `honorStandingFor`. */
const HONOR_CARD_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

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

    /*
      «إنت على لوحة الشرف» — آخر تكريم بالإيد، وعددهم.

      متبدي هنا لنفس سبب `scores` فوق: مالوش علاقة بأي حاجة تحت، ومستنيه في
      نص الاستعلامات التانية يخسّر لفة. ومتحسوب **قبل** فرع «مفيش اشتراكات»
      كمان — الطالب ممكن يكون متكرّم على حاجة مالهاش كورس أصلاً («الأول على
      الدفعة»)، والكارت هو الحاجة الوحيدة اللي بتقول له.
    */
    const honorBoard = this.honorStandingFor(userId);

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
        // «فتح بكود» — whether a code minted this enrollment; see
        // `lessonFilterWithCodes` for what it changes in the counts.
        source: true,
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
            // «جروب الدفعة» — per course, and the reason it is per course is
            // the same one `scheduleNote` below gives: عربي and لغات are two
            // cohorts, and a student belongs to one of them.
            whatsappGroupUrl: true,
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
            // ⚠️ والشهور — الباب التالت لنفس الانجراف اللي الكومنت فوق بيشرحه.
            //
            // على كورس بيتباع بالشهور، اللي دافع «شهر ١» مايقدرش يفتح محاضرات
            // شهر ٢، ومع ذلك كانت بتتعد هنا. فالكارت كان هيقول «٦ من ١١» جنب
            // شريط على ١٠٠٪، والاتنين صح كل واحد على مجموعته — وده بالظبط
            // الانجراف اللي `recalculate` بيتصلح عشانه.
            //
            // `subjectId`/`requiresGrant` بيوصلوا لـ`courseAccessScopes`،
            // و`months` بتقول الكورس ده بيتباع بالشهور ولا لأ.
            subjectId: true,
            requiresGrant: true,
            // سعر الشهر — بيوصل لـ`monthOffersFor` تحت كـfallback لشهر مالوش
            // سعر بذاته، ونفس الوقت هو الإشارة إن الكورس ده بيتباع بالشهر
            // أصلًا. `PlayerService.monthOffer` بيقرا نفس العمودين بالحرف.
            monthlyPriceCents: true,
            _count: {
              select: {
                lessons: {
                  where: { isPublished: true, section: { isPublished: true }, kind: { not: 'quiz' } },
                },
                months: true,
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
        monthOffers: [],
        honorBoard: await honorBoard,
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
    /*
     * الشهور اللي الطالب ماسكها، لكل كورس بيتباع بالشهور.
     *
     * استعلام واحد لكل الكورسات: الداشبورد بتاعة طالب واحد، فالـgrants بتتقرا
     * مرة وبتتقسّم في الذاكرة. `Map` فاضية = مفيش كورس محتاج تقييد، وده
     * الغالب.
     *
     * نفس `monthSliceOf` اللي البوابة و`recalculate` بيستعملوه — تالت قارئ
     * لنفس الدالة، وده المقصود منها أصلًا.
     */
    const monthSlices = await this.monthSlicesByCourse(userId, enrollments);
    /*
     * القطعة بتتحوّل لفلتر عدّ هنا، مش جوّه الدالة، عشان الشريحة نفسها تفضل
     * متاحة لـ`monthOffersFor` تحت — الاتنين محتاجين نفس الجواب، والقراية
     * تانية للـgrants كانت هتبقى نفس الاستعلام مرتين على نفس الصفحة.
     *
     * والترم والسنة مابيدخلوش الـ`Map` (`slice.everything`)، فـ`lessonsOf`
     * بترجّع نفس الفلتر القديم بالحرف زي ما كانت.
     */
    const monthFilters = new Map<string, Prisma.LessonWhereInput>();
    for (const [courseId, slice] of monthSlices) {
      if (slice.everything) continue;
      monthFilters.set(courseId, { months: { some: { monthId: { in: [...slice.monthIds] } } } });
    }
    /*
     * «شهر جديد اتفتح» — ابتدى من غير انتظار، لنفس سبب `scores` و`honorBoard`
     * فوق: بيقرا الشهور المفتوحة والطلبات المعلّقة، ومالوش علاقة بأي حاجة في
     * الـ`Promise.all` اللي تحت، فمستنيه في نصهم كان بيخسّر لفة كاملة.
     *
     * ومش محتاجة `catch` زي `scores`: الفرع الوحيد اللي بيرجّع من غير انتظار
     * («مفيش اشتراكات») فوق السطر ده، فالـpromise دي دايمًا بيتم انتظارها في
     * الـ`return` — مفيش رفض بيروح في الفراغ.
     */
    const monthOffers = this.monthOffersFor(userId, enrollments, monthSlices);

    /*
     * «فتح بكود» — the lectures a code opened are counted too, and for a
     * student who holds nothing BUT codes on a course they are the whole
     * count. Before this a code-only student on a month-selling course had
     * zero lectures in the denominator and the card said «قريبًا» over the
     * lecture they had just paid for. Same function the gate uses, so the
     * count and the padlocks cannot disagree.
     */
    const reachFilters = new Map<string, Prisma.LessonWhereInput | undefined>();
    await Promise.all(
      enrollments.map(async (row) => {
        const content = await resolveContentAccess(this.prisma, userId, row.course, row.source);
        reachFilters.set(row.course.id, lessonFilterWithCodes(monthFilters.get(row.course.id), content));
      }),
    );
    const lessonsOf = (courseId: string): Prisma.LessonWhereInput => ({
      isPublished: true,
      section: { isPublished: true },
      kind: { not: 'quiz' },
      ...(reachFilters.get(courseId) ?? {}),
    });

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
          // ⚠️ `OR` لكل اشتراك على حدة، مش فلتر واحد: الطالب ممكن يكون ماسك
          // «شهر ١» في كورس وترم كامل في كورس تاني، وفلتر واحد كان هيطبّق
          // تقييد كورس على كورس تاني.
          OR: enrollments.map((row) => ({
            enrollmentId: row.id,
            lesson: lessonsOf(row.course.id),
          })),
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
          const gate = await this.lessonGate.resolveCourse(row.id, row.course.id, userId);
          return { enrollmentId: row.id, state: gate.get(row.course.examLessonId as string) };
        }),
      ),
    ]);

    const completedCounts = new Map(
      completedByEnrollment.map((row) => [row.enrollmentId, row._count._all]),
    );

    /*
     * المقام، بنفس `lessonsOf` بتاع البسط بالحرف.
     *
     * بقى استعلام لوحده بدل `course._count.lessons` المدمج، لأن العدّ المدمج
     * فلتره ثابت في الاستعلام ومايعرفش يتغيّر حسب شهور الطالب. والاتنين
     * بيتبنوا من نفس الدالة دلوقتي، فمايقدروش ينجرفوا.
     *
     * الكورسات اللي مالهاش شهور بتاخد نفس الفلتر القديم بالظبط، فالرقم عندها
     * ما اتغيرش.
     */
    const lessonTotals = new Map(
      (
        await this.prisma.lesson.groupBy({
          by: ['courseId'],
          // `courseId` في كل فرع — `lessonsOf` مابتحطّهوش لأن البسط بيقيّد
          // بالـ`enrollmentId` بدله، وهنا مفيش حاجة تقيّد غيره.
          where: {
            OR: enrollments.map((row) => ({
              courseId: row.course.id,
              ...lessonsOf(row.course.id),
            })),
          },
          _count: { _all: true },
        })
      ).map((row) => [row.courseId, row._count._all]),
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
        whatsappGroupUrl: row.course.whatsappGroupUrl,
        subjectNameAr: row.course.subject.nameAr,
        published,
        progressPercent: Number(row.progressPercent),
        completedLessons: completedCounts.get(row.id) ?? 0,
        totalLessons: lessonTotals.get(row.course.id) ?? 0,
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
      monthOffers: await monthOffers,
      honorBoard: await honorBoard,
    };
  }

  /**
   * آخر تكريم على لوحة الشرف للطالب ده، أو `null`.
   *
   * ## ليه أسبوعين
   *
   * الكارت ده «مبروك»، والمبروك ليها تاريخ صلاحية: كارت تهنئة على حاجة حصلت
   * من شهرين بيبقى أثاث، والأثاث مابيتشافش — ولما ييجي تكريم جديد بعده الكارت
   * اللي ثابت من زمان مابيلفتش. نفس القاعدة اللي `instructorMessage` ماشي
   * عليها: بيظهر وهو لسه خبر.
   *
   * ⚠️ `total` بيتعدّ على التكريمات **كلها** مش اللي جوّه الشباك، لأنه إجابة
   * سؤال تاني: «اتكرّم كام مرة»، وده مش بيقل بمرور الوقت.
   */
  private async honorStandingFor(userId: string): Promise<Dashboard['honorBoard']> {
    const since = new Date(Date.now() - HONOR_CARD_WINDOW_MS);
    const [latest, total] = await Promise.all([
      this.prisma.honorBoardPin.findFirst({
        where: { userId, honoredAt: { gte: since } },
        // ورا التاريخ: `id` uuid7، يعني ترتيبه زمني، فاتنين في نفس اليوم
        // (وكلهم بيتخزّنوا الساعة ١٢ ظهرًا بالظبط — اقرا `instantFor`) ليهم
        // ترتيب ثابت بدل ما الصف يتبدّل بين ريكويست والتاني.
        orderBy: [{ honoredAt: 'desc' }, { id: 'desc' }],
        select: {
          honoredAt: true,
          rank: true,
          reason: true,
          course: { select: { year: true, forGeneral: true, forLanguages: true } },
          user: { select: { studentProfile: { select: { year: true, schoolStream: true } } } },
        },
      }),
      this.prisma.honorBoardPin.count({ where: { userId } }),
    ]);

    if (!latest) return null;

    return {
      day: honorDayKey(latest.honoredAt),
      honoredAt: latest.honoredAt.toISOString(),
      rank: latest.rank,
      courseLabel: latest.course
        ? courseChip(latest.course)
        : chipFromProfile(latest.user.studentProfile),
      reason: latest.reason,
      total,
    };
  }

  /**
   * لكل كورس بيتباع بالشهور: القطعة اللي الطالب ماسكها فيه.
   *
   * استعلام واحد لكل الـgrants — الداشبورد بتاعة طالب واحد، فالتقسيم بيحصل
   * في الذاكرة. والكورسات اللي مالهاش شهور مابتدخلش الـ`Map` أصلًا، فـ
   * `lessonsOf` بترجّع نفس الفلتر القديم بالحرف.
   *
   * ⚠️ دي كانت بترجّع فلتر Prisma جاهز وبتاكل صفوف `slice.everything` في
   * السكّة. بقت بترجّع القطعة نفسها **لكل** كورس بالشهور، بـ`everything` وكل
   * حاجة، لأن فيه قارئ تاني دلوقتي: `monthOffersFor` محتاج يفرّق بين «ماسك
   * الترم كله» (مايتعرضش عليه حاجة) و«مش ماسك حاجة لايف» (ده محتاج يجدّد، مش
   * يعرف إن فيه شهر جديد) — والفلتر كان بيخلط التلاتة في «مش في الـMap».
   * التحويل لفلتر بقى عند المستدعي، وسلوك العدّ ما اتغيّرش.
   */
  private async monthSlicesByCourse(
    userId: string,
    enrollments: readonly {
      course: { id: string; subjectId: string; requiresGrant: boolean; _count: { months: number } };
    }[],
  ): Promise<Map<string, MonthSlice>> {
    const byMonth = enrollments.filter((row) => row.course._count.months > 0);
    if (byMonth.length === 0) return new Map();

    const grants = await this.prisma.accessGrant.findMany({
      where: {
        userId,
        OR: byMonth.flatMap((row) => courseAccessScopes(row.course)),
      },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        scope: true,
        courseId: true,
        monthId: true,
        validFrom: true,
        validUntil: true,
        revokedAt: true,
      },
    });

    const now = new Date();
    const slices = new Map<string, MonthSlice>();
    for (const { course } of byMonth) {
      /*
       * ⚠️ `courseId === null` بتعدّي: دي الـgrants الأوسع (`platform`،
       * `subject_teacher`) اللي مش مربوطة بكورس بعينه، و`courseAccessScopes`
       * طلبها عن قصد. تصفيتها هنا كانت هتشيل بالظبط الـgrants اللي معناها
       * «كل حاجة مفتوحة».
       */
      const mine = grants.filter(
        (grant) => grant.courseId === null || grant.courseId === course.id,
      );
      slices.set(course.id, monthSliceOf(mine, now));
    }
    return slices;
  }

  /**
   * «شهر جديد اتفتح» — صف لكل كورس عليه حاجة تتعرض على الطالب ده فعلًا.
   *
   * أربع شروط، وكل واحد فيهم بيشيل حالة الشريط فيها غلط:
   *
   * 1. **`status: 'published'`** — كورس المدرّس نزّله عشان يعدّل لسه بيبان في
   *    «كورساتي» (شوف الـ`where` بتاع `enrollment` فوق)، بس الشيك أوت بيرفضه.
   *    عرض شهر فيه = زرار بيودّي على باب مقفول.
   * 2. **`monthlyPriceCents !== null` و`requiresGrant`** — الكورس بيتباع
   *    بالشهر أصلًا. نفس العمودين بالحرف اللي `PlayerService.monthOffer`
   *    بيقراهم، عشان الكارت اللي جوّه الكورس والشريط اللي فوق الداشبورد
   *    مايختلفوش على إن فيه حاجة للبيع.
   * 3. **`!slice.everything`** — اللي اشترك ترم أو سنة أو «٣ شهور» بيفتح كل
   *    الشهور، فمفيش حاجة تتعرض عليه. ده كان مطلوب بالنص.
   * 4. **ماسك شهر لايف، أو اشتراكه خلص** — وده الشرط اللي بيفرّق الشريط ده عن
   *    كارت الكورس. الكارت بيعرض على أي حد مش ماسك الشهر، بيشمل اللي عمره ما
   *    دفع؛ الشريط ده بيتكلّم مع اللي **دفع** بس.
   *
   *    و«خلص» جوّه الشرط عن قصد: الترم لما ينتهي الطالب بيرجع يشتري، والشريط
   *    هو المكان اللي بيقول له إن فيه شهور مفتوحة.
   *
   *    ⚠️ و«خلص» هنا `revoked` **و**`expired`، مش `expired` لوحده. على المنصة
   *    دي `TermService.setOpen(false)` بيختم `revoked_at` على كل grant
   *    بـ`scope: term`، ومنح الشهور `validUntil` بتاعها مقفول على `null`
   *    بـ`access_grants_month_open_ended` — فشرط على `expired` لوحده كان
   *    هيعدّي التستات وما يشتغلش ولا مرة على الحقيقي. `not_yet_valid` بس هو
   *    اللي برّه. الجدول الكامل في `DashboardMonthOfferSchema`.
   *
   * استعلامين مجمّعين لكل الكورسات مع بعض، ومفيش أي واحد فيهم لو مفيش مرشّح —
   * وده الغالب على كل طالب في كورس بالترم.
   */
  private async monthOffersFor(
    userId: string,
    enrollments: readonly {
      course: {
        id: string;
        slug: string;
        title: string;
        status: string;
        requiresGrant: boolean;
        monthlyPriceCents: number | null;
      };
    }[],
    slices: ReadonlyMap<string, MonthSlice>,
  ): Promise<DashboardMonthOffer[]> {
    const candidates = enrollments.filter(({ course }) => {
      if (course.status !== 'published') return false;
      if (course.monthlyPriceCents === null || !course.requiresGrant) return false;
      const slice = slices.get(course.id);
      if (slice === undefined || slice.everything) return false;
      return slice.monthIds.size > 0 || slice.lapsed === 'revoked' || slice.lapsed === 'expired';
    });
    if (candidates.length === 0) return [];

    const courseIds = candidates.map(({ course }) => course.id);
    const [openMonths, pendingRows] = await Promise.all([
      /* نفس الـ`select` و`orderBy` بتاع `PlayerService.outline` بالحرف — بالشهور
         المفتوحة بس، والعدّ على المحاضرات المنشورة (الكويز فحص المحاضرة اللي
         فوقه، مش صف الطالب بيعدّه). */
      this.prisma.courseMonth.findMany({
        where: { courseId: { in: courseIds }, isOpen: true },
        orderBy: [{ monthIndex: 'asc' }],
        select: {
          id: true,
          courseId: true,
          title: true,
          priceCents: true,
          _count: {
            select: { lessons: { where: { lesson: { isPublished: true, kind: { not: 'quiz' } } } } },
          },
        },
      }),
      /* الطلبات المعلّقة، مجمّعة — الشيك أوت بيرفض طلب تاني على نفس الكورس،
         فالصف بيقول «بيتراجع» بدل ما يعرض زرار الرفض في آخره. */
      this.prisma.paymentSubmission.groupBy({
        by: ['courseId'],
        where: { userId, courseId: { in: courseIds }, status: 'pending' },
        _count: { _all: true },
      }),
    ]);

    const pending = new Set(pendingRows.map((row) => row.courseId));

    const offers: DashboardMonthOffer[] = [];
    for (const { course } of candidates) {
      // موجودة بالتأكيد: الفلتر فوق رفض أي كورس مالوش قطعة.
      const slice = slices.get(course.id) as Extract<MonthSlice, { everything: false }>;
      const months = openMonths
        .filter((month) => month.courseId === course.id && !slice.monthIds.has(month.id))
        .map((month) => ({
          id: month.id,
          title: month.title,
          lessonCount: month._count.lessons,
          // سعر الشهر بذاته لو المدرّس حطّه، وإلا سعر الكورس الشهري — نفس
          // الترتيب اللي `PlayerService.monthOffer` بيتبعه.
          priceCents: month.priceCents ?? (course.monthlyPriceCents as number),
        }));
      if (months.length === 0) continue;
      offers.push({
        courseId: course.id,
        courseSlug: course.slug,
        courseTitle: course.title,
        months,
        pending: pending.has(course.id),
        /* مش ماسك ولا شهر لايف = اشتراكه خلص (الفلتر فوق رفض أي سبب تاني).
           الكوبي بتتغيّر على ده: «شهر ٢ اتفتح» كذب لحد كل الكورس مقفول عليه،
           و`months` عنده فوق دي **كل** الشهور المفتوحة مش الجديد فيهم. */
        lapsed: slice.monthIds.size === 0,
      });
    }
    return offers;
  }
}
