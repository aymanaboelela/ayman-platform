import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminCourseMonth, CourseMonthWriteInput, LessonMonths, LessonMonthsWriteInput } from '@ayman/contracts/months';
import {
  MONTH_DELETE_BLOCKED_CODE,
  MONTH_OPEN_BLOCKED_CODE,
  type CourseMonthPatchInput,
  type LegacyMonthBackfillResult,
} from '@ayman/contracts/admin/content-months';
import { copy } from '@ayman/contracts/copy/admin';
import { MONTHLY_EXAM_LESSON } from '@ayman/contracts/quiz/monthly-exam';
import { formatCopy } from '@ayman/contracts/format';
import { AuditService } from '../../audit/audit.service';
import { AUDIT_RESOURCES } from '../admin/admin.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { isForeignKeyViolation, isUniqueViolation } from '../../common/prisma/prisma-errors';
import type { CourseMonth } from '../../generated/prisma/client';

/** Published LECTURES — quizzes excluded. The same `isLecture` definition
 *  `CatalogService` counts months with and `CourseMonthSchema.lessonCount`
 *  promises; two different answers to «الشهر ده فيه كام محاضرة؟» on the admin
 *  and the student screen is the shape of bug this repeats it to avoid. */
const PUBLISHED_LECTURE = { isPublished: true, kind: { not: 'quiz' } } as const;

/**
 * Every published lesson, QUIZZES INCLUDED — what the untagged guard counts,
 * and what «حط الكل في الشهر ده» adopts.
 *
 * ⚠️ Not the same set as `PUBLISHED_LECTURE` one line up, and the difference is
 * an access bug rather than a cosmetic one. The gate does not care what kind a
 * lesson is: `resolveMonthAccess` refuses any lesson with no month to a month
 * subscriber, quiz or not. So a lecture tagged «شهر ١» whose QUIZ was left
 * untagged is a lecture a month-1 student can watch and then cannot sit — and
 * the guard, if it counted lectures only, would have reported the course
 * perfectly tagged while that was true.
 *
 * `PUBLISHED_LECTURE` stays lectures-only for the number the STUDENT reads
 * («شهر ٢ — ٥ محاضرات»), which is the same `isLecture` definition every other
 * count on the platform uses. Two questions, two sets, on purpose.
 */
const PUBLISHED_ANY = { isPublished: true } as const;

/** «شهر ٣», not «شهر 3» — the title every other month on the course was
 *  given (`copy.admin.month.firstMonthTitle`). Mapped by hand rather than
 *  through `Intl`: a runtime built with small-icu formats `ar-EG` in Latin
 *  digits, and a title is stored, so it must not depend on the server. */
function toArabicDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)] ?? digit);
}

/** What `countsFor` gathers once, for however many months the caller holds. */
interface MonthCounts {
  lessonCountByMonth: ReadonlyMap<string | null, number>;
  subscriberCountByMonth: ReadonlyMap<string | null, number>;
  /** Course-wide, so it is the SAME number on every row — deliberately, see
   *  `AdminCourseMonthSchema`: the admin needs it where the refusal happens. */
  untaggedLessonCount: number;
}

/** The row the admin panel draws. Pure, and outside the class, because it does
 *  nothing but arrange numbers `countsFor` already fetched. */
function toAdminMonth(
  course: { monthlyPriceCents: number | null },
  month: CourseMonth,
  counts: MonthCounts,
): AdminCourseMonth {
  return {
    id: month.id,
    monthIndex: month.monthIndex,
    title: month.title,
    isOpen: month.isOpen,
    // `@db.Date` comes back as UTC midnight, so the first ten characters ARE
    // the date the instructor typed. `toLocaleDateString` would shift it a day
    // west of Cairo, and a whole `toISOString()` would hand the panel a
    // timestamp for a field that has no time.
    startsOn: month.startsOn === null ? null : month.startsOn.toISOString().slice(0, 10),
    lessonCount: counts.lessonCountByMonth.get(month.id) ?? 0,
    subscriberCount: counts.subscriberCountByMonth.get(month.id) ?? 0,
    untaggedLessonCount: counts.untaggedLessonCount,
    // One price for any month — the instructor's own decision — and
    // `CourseMonth.priceCents` is the reserved per-month override nothing
    // writes yet. `0` on a course with no monthly price at all is not «مجاني»:
    // that course sells no monthly plan, the student never sees these cards
    // (`CatalogService` collapses the list to empty), and the field that fixes
    // it is `copy.admin.course.priceMonthly` on the same screen.
    priceCents: month.priceCents ?? course.monthlyPriceCents ?? 0,
  };
}

/**
 * «شهور المنهج» — CRUD on `CourseMonth`, plus the one write that belongs to a
 * LESSON rather than to a month: which months open it.
 *
 * Shaped on `TermService` next door, deliberately, because a month and a term
 * are siblings the instructor manages from two panels of the same screen. Two
 * differences, and both are the point:
 *
 * 1. Closing a month revokes NOTHING. `TermService.setOpen` bulk-revokes every
 *    live `scope: term` grant in the same transaction as the flag flip, and
 *    that stamp is permanent. He will close and reopen a month nine times a
 *    year; the same button would erase a whole cohort. So `isOpen` here is a
 *    plain field on the PATCH, not a route of its own — see `CourseMonth.isOpen`
 *    in schema.prisma.
 * 2. OPENING one is refused while the course has an untagged published
 *    lecture. `assertNothingUntagged` below is the only place in this feature
 *    that says no to the instructor, and it is worth reading its own comment.
 */
@Injectable()
export class CourseMonthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(courseId: string): Promise<AdminCourseMonth[]> {
    const course = await this.requireCourse(courseId);
    const months = await this.prisma.courseMonth.findMany({
      where: { courseId },
      orderBy: [{ monthIndex: 'asc' }, { id: 'asc' }],
    });
    const counts = await this.countsFor(course.id, months.map((month) => month.id));
    return months.map((month) => toAdminMonth(course, month, counts));
  }

  async create(courseId: string, input: CourseMonthWriteInput): Promise<AdminCourseMonth> {
    const course = await this.requireCourse(courseId);
    if (input.isOpen) await this.assertNothingUntagged(courseId);

    let month: CourseMonth;
    try {
      month = await this.prisma.courseMonth.create({
        data: {
          courseId,
          monthIndex: input.monthIndex,
          title: input.title,
          isOpen: input.isOpen,
          // `startsOn` is `@db.Date`; Postgres keeps the date part and drops
          // the rest, so parsing the `YYYY-MM-DD` as UTC midnight round-trips.
          startsOn: input.startsOn === null ? null : new Date(`${input.startsOn}T00:00:00.000Z`),
        },
      });
    } catch (error) {
      // `@@unique([courseId, monthIndex])` — «شهر ٣» twice on one course. A
      // 409 and not a silent overwrite: the second one is almost always the
      // instructor forgetting he already made it, and renaming his existing
      // month out from under a paying student is not a recoverable mistake.
      if (isUniqueViolation(error)) throw new ConflictException('الشهر ده موجود بالفعل في الكورس');
      throw error;
    }

    await this.audit.record({
      action: 'month:create',
      resourceType: AUDIT_RESOURCES.courseMonth,
      resourceId: month.id,
      outcome: 'success',
      metadata: { courseId, monthIndex: month.monthIndex, title: month.title },
    });

    return toAdminMonth(course, month, await this.countsFor(courseId, [month.id]));
  }

  /**
   * «خليها عشر أشهر موجودين قدامي وأقدر أفتح اللي أنا عايزه» — every month
   * from 1 to `upTo` that the course does not have yet, in one call.
   *
   * CLOSED, every one of them, and that is what makes this safe to press: a
   * closed month is invisible to students (the catalog, the checkout picker
   * and the padlocks all read open months only), so filling the year in
   * changes nothing anybody can buy or see until he opens one.
   *
   * ⚠️ Refused on a course with NO months. Selling by month keys on «the course
   * has any month row», open or not — checkout, the gate and the lesson form
   * all flip on the first one — so this must never be the press that turns a
   * course over. `StartByMonth` does that explicitly (month 1, adopt, then
   * this), and only after it has made month 1.
   *
   * One transaction and `skipDuplicates`, so a double press or a month made in
   * another tab between the read and the write is a no-op rather than a 409 on
   * the unique index. Named «شهر ٣» and not asked for: he renames in place.
   */
  async fill(courseId: string, upTo: number): Promise<AdminCourseMonth[]> {
    const course = await this.requireCourse(courseId);
    const taken = await this.prisma.courseMonth.findMany({
      where: { courseId },
      select: { monthIndex: true },
    });
    if (taken.length === 0) {
      throw new ConflictException(copy.admin.month.fillNeedsFirst);
    }

    const takenIndexes = new Set(taken.map((row) => row.monthIndex));
    const missing = Array.from({ length: upTo }, (_, offset) => offset + 1).filter(
      (monthIndex) => !takenIndexes.has(monthIndex),
    );

    if (missing.length > 0) {
      const created = await this.prisma.courseMonth.createManyAndReturn({
        data: missing.map((monthIndex) => ({
          courseId,
          monthIndex,
          title: formatCopy(copy.admin.month.defaultTitle, { n: toArabicDigits(monthIndex) }),
          isOpen: false,
        })),
        skipDuplicates: true,
      });
      for (const month of created) {
        await this.audit.record({
          action: 'month:create',
          resourceType: AUDIT_RESOURCES.courseMonth,
          resourceId: month.id,
          outcome: 'success',
          metadata: { courseId, monthIndex: month.monthIndex, title: month.title, via: 'fill' },
        });
      }
    }

    return this.list(course.id);
  }

  /**
   * Rename, renumber, move the date, open or close. `monthId` is matched
   * TOGETHER with `courseId` rather than on its own: the route is nested under
   * a course, and a month id from another course must read as 404 and not as a
   * successful edit of somebody else's syllabus.
   */
  async update(courseId: string, monthId: string, input: CourseMonthPatchInput): Promise<AdminCourseMonth> {
    const course = await this.requireCourse(courseId);
    const current = await this.prisma.courseMonth.findFirst({ where: { id: monthId, courseId } });
    if (!current) throw new NotFoundException();

    // The TRANSITION, not the value. A patch that renames an already-open
    // month carries no `isOpen` at all (`partialWithoutDefaults`), and an
    // idempotent `isOpen: true` on a month that is already open takes nothing
    // off the shelf that is not already on it — refusing either would only
    // make an already-leaking course impossible to edit out of the state.
    if (input.isOpen === true && !current.isOpen) await this.assertNothingUntagged(courseId);

    let month: CourseMonth;
    try {
      month = await this.prisma.courseMonth.update({
        where: { id: monthId },
        data: {
          ...(input.monthIndex !== undefined && { monthIndex: input.monthIndex }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.isOpen !== undefined && { isOpen: input.isOpen }),
          ...(input.startsOn !== undefined && {
            startsOn: input.startsOn === null ? null : new Date(`${input.startsOn}T00:00:00.000Z`),
          }),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('الشهر ده موجود بالفعل في الكورس');
      throw error;
    }

    /*
     * `month:close` is its own verb and `month:update` covers everything else,
     * REOPENING included — the same asymmetry `AUDIT_ACTIONS` draws between
     * `term:update` and `term:close`, inverted. Closing a term revokes every
     * live grant for it; closing a month revokes nothing at all and only takes
     * it off the shelf. Both still deserve a verb, because closing a month is
     * the press that stops the money, and an auditor answering «مين قفل شهر ٣»
     * should not have to unpack metadata to find it.
     */
    await this.audit.record({
      action: input.isOpen === false ? 'month:close' : 'month:update',
      resourceType: AUDIT_RESOURCES.courseMonth,
      resourceId: monthId,
      outcome: 'success',
      metadata: { courseId, changed: Object.keys(input) },
    });

    return toAdminMonth(course, month, await this.countsFor(courseId, [month.id]));
  }

  /**
   * Delete a month — unless a transfer already bought it.
   *
   * `payment_submission_months`' month side is `ON DELETE RESTRICT`, so the
   * database refuses this on its own. It is pre-checked anyway because the raw
   * `P2003` is a 500 with no sentence in it, and the instructor pressing
   * «حذف الشهر» needs to be told that the money is what is holding it and that
   * CLOSING the month is the thing he actually wants — which is exactly what
   * `copy.admin.month.deleteBlockedPaid` says. The `catch` below is the same
   * refusal for the race where a payment lands between the count and the
   * delete.
   *
   * `lesson_months` is NOT a reason to refuse: it cascades, and a lecture
   * losing its month is a recoverable edit the admin screen already warns
   * about (`copy.admin.month.untaggedWarning`).
   */
  async remove(courseId: string, monthId: string): Promise<void> {
    const month = await this.prisma.courseMonth.findFirst({
      where: { id: monthId, courseId },
      select: { id: true, monthIndex: true },
    });
    if (!month) throw new NotFoundException();

    const paidSubmissionCount = await this.prisma.paymentSubmissionMonth.count({ where: { monthId } });
    if (paidSubmissionCount > 0) throw this.deleteBlocked(paidSubmissionCount);

    try {
      await this.prisma.courseMonth.delete({ where: { id: monthId } });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw this.deleteBlocked(paidSubmissionCount + 1);
      throw error;
    }

    await this.audit.record({
      action: 'month:delete',
      resourceType: AUDIT_RESOURCES.courseMonth,
      resourceId: monthId,
      outcome: 'success',
      metadata: { courseId, monthIndex: month.monthIndex },
    });
  }

  /**
   * «الشهر: ٢ — وكمان لشهر ٣ و٤», written as ONE set.
   *
   * Delete-then-insert inside a single transaction rather than a diff: the
   * admin edits this as one control and the whole point of the PUT (see
   * `LessonMonthsWriteSchema`'s own note) is that closing a tab halfway cannot
   * leave a lecture in a state nobody chose. A diff would also have to reason
   * about `lesson_months_one_primary`, the PARTIAL unique index — moving the
   * primary from month 2 to month 3 would collide with itself unless the
   * delete happens first.
   */
  async setLessonMonths(lessonId: string, input: LessonMonthsWriteInput): Promise<LessonMonths> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { id: true, courseId: true },
    });
    if (!lesson) throw new NotFoundException();

    const monthIds = input.primaryMonthId === null ? [] : [input.primaryMonthId, ...input.extraMonthIds];

    // The composite FK `lesson_months_month_in_course` refuses a foreign
    // course's month on its own, and that refusal arrives as a `P2003` with no
    // sentence in it. Checking first is what turns «الشهر ده مش بتاع الكورس ده»
    // into something the admin screen can show; the `catch` below still covers
    // the month deleted between this count and the insert.
    if (monthIds.length > 0) {
      const owned = await this.prisma.courseMonth.count({
        where: { id: { in: monthIds }, courseId: lesson.courseId },
      });
      if (owned !== monthIds.length) {
        throw new BadRequestException('فيه شهر مش تابع الكورس بتاع المحاضرة دي');
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.lessonMonth.deleteMany({ where: { lessonId } });
        if (monthIds.length === 0) return;
        await tx.lessonMonth.createMany({
          data: monthIds.map((monthId, index) => ({
            lessonId,
            monthId,
            // Denormalised on purpose and load-bearing — it is the column both
            // composite FKs hang off. See `LessonMonth.courseId` in
            // schema.prisma.
            courseId: lesson.courseId,
            isPrimary: index === 0,
          })),
        });
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new BadRequestException('فيه شهر مش تابع الكورس بتاع المحاضرة دي');
      }
      throw error;
    }

    await this.audit.record({
      action: 'lesson:update',
      resourceType: AUDIT_RESOURCES.lesson,
      resourceId: lessonId,
      outcome: 'success',
      metadata: {
        operation: 'months',
        courseId: lesson.courseId,
        primaryMonthId: input.primaryMonthId,
        extraMonthIds: input.extraMonthIds,
      },
    });

    return { primaryMonthId: input.primaryMonthId, extraMonthIds: input.extraMonthIds };
  }

  /** The course the route names, and the monthly price every month is sold
   *  at — one lookup, because `serialize` needs the price and every method
   *  needs the 404. */
  private async requireCourse(courseId: string): Promise<{ id: string; monthlyPriceCents: number | null }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, monthlyPriceCents: true },
    });
    if (!course) throw new NotFoundException();
    return course;
  }

  /**
   * THE REFUSAL THAT KEEPS THE FEATURE HONEST.
   *
   * A lecture with no `lesson_months` row is in no month, so no month grant
   * names it — which is correct and deliberate (`sliceCoversLesson` treats the
   * empty set as closed). The danger is the OTHER direction: a course the
   * instructor has started tagging still has its whole back-catalogue untagged,
   * and the moment he opens «شهر ١» for sale the cheapest single month on the
   * platform is sitting next to every lecture that month does NOT contain —
   * so the student who buys it sees five lectures and the instructor believes
   * he sold five.
   *
   * The reason it has to be a refusal and not a warning: every screen looks
   * correct while it happens. The month card says «٥ محاضرات», the outline
   * locks nothing, the payment is approved, and nothing in the audit log or
   * the finance report is wrong. There is no later moment at which anyone
   * finds out.
   *
   * The count travels in the body because the admin panel renders
   * `copy.admin.month.blockedByUntagged` with `{n}` and links to those
   * lectures — a bare 409 would make him go and count them himself.
   */
  private async assertNothingUntagged(courseId: string): Promise<void> {
    const untaggedLessonCount = await this.countUntagged(courseId);
    if (untaggedLessonCount === 0) return;
    throw new ConflictException({
      code: MONTH_OPEN_BLOCKED_CODE,
      untaggedLessonCount,
      message: copy.admin.month.blockedByUntagged.replace('{n}', String(untaggedLessonCount)),
    });
  }

  private deleteBlocked(paidSubmissionCount: number): ConflictException {
    return new ConflictException({
      code: MONTH_DELETE_BLOCKED_CODE,
      paidSubmissionCount,
      message: copy.admin.month.deleteBlockedPaid,
    });
  }

  private countUntagged(courseId: string): Promise<number> {
    // `months: { none: {} }` — «منشورة ومالهاش ولا شهر». Not a `NOT IN` over
    // fetched ids: that is the same question asked in a way that grows with
    // the course.
    //
    // ⚠️ Monthly exams are NOT untagged, they are untaggable: an exam belongs
    // to the course, and any live subscription opens it (`isMonthlyExamLesson`).
    // Counted here, every published one blocked every month from going on
    // sale — «فيه ١ درس من غير شهر» — with no month it could ever be put in.
    return this.prisma.lesson.count({
      where: { courseId, ...PUBLISHED_ANY, months: { none: {} }, NOT: MONTHLY_EXAM_LESSON },
    });
  }

  /**
   * The three numbers the admin panel is built around, for a whole list of
   * months in THREE queries — never one per row.
   *
   * `list()` is read on every load of the course builder, and the naive shape
   * (a `_count` per month, then a grant count per month) is 2N round trips on
   * a screen that already has nine of them. Two `groupBy`s and one `count`
   * answer it for any number of months.
   */
  private async countsFor(courseId: string, monthIds: string[]): Promise<MonthCounts> {
    const [lessonCounts, subscriberCounts, untaggedLessonCount] = await Promise.all([
      monthIds.length === 0
        ? []
        : this.prisma.lessonMonth.groupBy({
            by: ['monthId'],
            where: { monthId: { in: monthIds }, lesson: PUBLISHED_LECTURE },
            _count: { _all: true },
          }),
      monthIds.length === 0
        ? []
        : this.prisma.accessGrant.groupBy({
            by: ['monthId'],
            where: {
              monthId: { in: monthIds },
              scope: 'course_month',
              // LIVE, not «كام واحد دفع» — see `AdminCourseMonthSchema`. A
              // refunded or cancelled subscription is money that happened and
              // access that did not, and this is the second number.
              //
              // `validUntil` is deliberately not filtered: a month grant is
              // open-ended by `access_grants_month_open_ended`, so the only two
              // things that can end one are `revokedAt` and a `validFrom` the
              // instructor dated forward.
              revokedAt: null,
              validFrom: { lte: new Date() },
            },
            _count: { _all: true },
          }),
      this.countUntagged(courseId),
    ]);

    return {
      lessonCountByMonth: new Map(lessonCounts.map((row) => [row.monthId, row._count._all])),
      subscriberCountByMonth: new Map(subscriberCounts.map((row) => [row.monthId, row._count._all])),
      untaggedLessonCount,
    };
  }
  /**
   * «حط كل المحاضرات اللي من غير شهر في الشهر ده» — the setup press.
   *
   * Every course on the platform predates curriculum months, so every lecture
   * on it is untagged and NO month can be opened for sale until that is fixed
   * (see `assertNothingUntagged`). Doing it lecture by lecture on a course with
   * forty of them is not a migration path, it is a reason not to migrate.
   *
   * QUIZZES TOO. `PUBLISHED_ANY` and not `PUBLISHED_LECTURE`: the gate refuses
   * any lesson with no month to a month subscriber, so a lecture adopted into
   * «شهر ١» whose quiz was left behind is a lecture the student can watch and
   * then cannot sit.
   *
   * Drafts are adopted as well. A draft that publishes later would otherwise
   * re-block every month on the course the moment it goes live, and the
   * instructor would meet that refusal with no idea what changed.
   *
   * `isPrimary: true` — these lectures belong to this month, they are not
   * «كمان لشهر». A lesson that already has ANY month is left alone: this is a
   * setup action for the untagged, never a reassignment.
   */
  async adoptUntaggedLessons(courseId: string, monthId: string): Promise<{ adopted: number }> {
    const month = await this.prisma.courseMonth.findFirst({
      where: { id: monthId, courseId },
      select: { id: true, monthIndex: true },
    });
    if (!month) throw new NotFoundException();

    // Monthly exams stay out: tagged into one month, an exam for the whole
    // course was opened to that month's buyers only.
    const lessons = await this.prisma.lesson.findMany({
      where: { courseId, months: { none: {} }, NOT: MONTHLY_EXAM_LESSON },
      select: { id: true },
    });
    if (lessons.length === 0) return { adopted: 0 };

    await this.prisma.lessonMonth.createMany({
      data: lessons.map((lesson) => ({
        lessonId: lesson.id,
        monthId,
        // Denormalised, and the composite FKs make it structural — see
        // `LessonMonth.courseId`.
        courseId,
        isPrimary: true,
      })),
    });

    await this.audit.record({
      action: 'month:update',
      resourceType: AUDIT_RESOURCES.courseMonth,
      resourceId: monthId,
      outcome: 'success',
      metadata: {
        operation: 'adopt-untagged',
        courseId,
        monthIndex: month.monthIndex,
        adopted: lessons.length,
      },
    });

    return { adopted: lessons.length };
  }

  /**
   * «الي حد اشترك دلوقتي أو قبل كده حطه في الشهر ده» — the other half of the
   * setup.
   *
   * ## It only ever INSERTs
   *
   * No `UPDATE`, no `revokedAt`, no `validUntil` touched, and that is the whole
   * design rather than caution. Their existing course-wide grant is money they
   * paid for a window that has not closed yet; narrowing it the day the
   * instructor configures months would take back access nobody asked to take
   * back, and do it silently, to people who are current on their payments. So
   * they keep the whole course until their own date runs out, and they keep
   * this month permanently after it. Strictly more than they had.
   *
   * ## Who
   *
   * Every student holding a LIVE `scope: course` grant from a purchase —
   * monthly, «٣ شهور» and yearly alike. Those three bought the whole course by
   * DATE, and the date is what is being replaced; this is what makes them whole.
   *
   * `scope: term` buyers are deliberately NOT included. Their access is already
   * a slice with its own rules and its own cutoff, nothing about it changes
   * here, and handing a term buyer a permanent month they never asked for
   * crosses the two axes on somebody who did not choose to be crossed.
   *
   * `admin` and `auto_free` grants are out for the same reason in reverse: a
   * hand-issued grant is whatever the instructor decided it was, and a free
   * platform grant is not a subscription to anything.
   */
  async openMonthForSubscribers(
    courseId: string,
    monthId: string,
    dryRun: boolean,
  ): Promise<LegacyMonthBackfillResult> {
    const month = await this.prisma.courseMonth.findFirst({
      where: { id: monthId, courseId },
      select: { id: true, monthIndex: true },
    });
    if (!month) throw new NotFoundException();

    const now = new Date();
    const subscribers = await this.prisma.accessGrant.findMany({
      where: {
        courseId,
        scope: 'course',
        source: 'purchase',
        revokedAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      distinct: ['userId'],
      select: { userId: true },
    });

    if (dryRun || subscribers.length === 0) {
      return { students: subscribers.length, monthIds: [monthId], grantsWritten: 0, dryRun };
    }

    // Read first rather than relying on `skipDuplicates`: `access_grants` has
    // no unique on (userId, scope, monthId) — deliberately, because a revoked
    // grant and a live one for the same month are both legitimate history — so
    // a second press would otherwise stack duplicates.
    const held = await this.prisma.accessGrant.findMany({
      where: {
        scope: 'course_month',
        courseId,
        monthId,
        revokedAt: null,
        userId: { in: subscribers.map((row) => row.userId) },
      },
      select: { userId: true },
    });
    const heldBy = new Set(held.map((row) => row.userId));

    const rows = subscribers
      .filter((row) => !heldBy.has(row.userId))
      .map((row) => ({
        userId: row.userId,
        scope: 'course_month' as const,
        courseId,
        monthId,
        source: 'purchase' as const,
        // NEVER a date. `access_grants_month_open_ended` is a CHECK, and one
        // written here would roll the whole thing back with a 23514.
        validUntil: null,
        note: `setup: المشتركين الحاليين → شهر ${month.monthIndex}`,
      }));

    if (rows.length > 0) {
      await this.prisma.accessGrant.createMany({ data: rows });
    }

    await this.audit.record({
      action: 'month:update',
      resourceType: AUDIT_RESOURCES.courseMonth,
      resourceId: monthId,
      outcome: 'success',
      metadata: {
        operation: 'open-month-for-subscribers',
        courseId,
        monthIndex: month.monthIndex,
        students: subscribers.length,
        grantsWritten: rows.length,
      },
    });

    return {
      students: subscribers.length,
      monthIds: [monthId],
      grantsWritten: rows.length,
      dryRun: false,
    };
  }

}
