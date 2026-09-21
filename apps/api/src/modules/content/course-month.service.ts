import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminCourseMonth, CourseMonthWriteInput, LessonMonths, LessonMonthsWriteInput } from '@ayman/contracts/months';
import {
  MONTH_DELETE_BLOCKED_CODE,
  MONTH_OPEN_BLOCKED_CODE,
  type CourseMonthPatchInput,
  type LegacyMonthBackfillResult,
} from '@ayman/contracts/admin/content-months';
import { copy } from '@ayman/contracts/copy/admin';
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
    return this.prisma.lesson.count({
      where: { courseId, ...PUBLISHED_LECTURE, months: { none: {} } },
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
   * «الناس اللي اشتركت ٣ شهور» — give them months 1, 2 and 3.
   *
   * ## It only ever INSERTs
   *
   * No `UPDATE`, no `revokedAt`, no `validUntil` touched, and that is the whole
   * design rather than caution. Their existing course-wide grant is money they
   * paid for a window that has not closed yet; narrowing it the day the
   * instructor configures months would take back access nobody asked to take
   * back, and it would do it silently, to people who are current on their
   * payments. So they keep the whole course until their own date runs out, and
   * they keep months 1–3 permanently after it. Strictly more than they had.
   *
   * The instructor's two sentences are both satisfied this way: «الناس اللي
   * اشتركت قبل كده هتسمع زي ما هي عادي» and «هيشوفوا محاضرات الشهر الأول
   * والتاني والتالت».
   *
   * ## Who counts as a quarterly buyer
   *
   * An APPROVED `quarterly` submission on this course, plus a live course-wide
   * grant. The grant row itself carries no plan — `PaymentsService.approve`
   * EXTENDS one grant across renewals rather than stacking one per payment (see
   * the model doc on `PaymentSubmission`), so the plan only exists on the
   * submission. A student who bought quarterly once and monthly since still
   * qualifies, which is the correct reading of «اللي اشترك ٣ شهور».
   *
   * ## Why months 1, 2 and 3 and not "the three from the purchase date"
   *
   * Because the instructor back-tags an existing catalogue: a lecture recorded
   * last year and tagged «شهر ٣» today has a `created_at` that says nothing
   * about which months a past payment was for. Any derivation from dates is a
   * guess, and the thing it would be guessing about is paid access. He named
   * the three months himself, so they are the three.
   */
  async backfillLegacyQuarterly(
    courseId: string,
    dryRun: boolean,
  ): Promise<LegacyMonthBackfillResult> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) throw new NotFoundException();

    const months = await this.prisma.courseMonth.findMany({
      where: { courseId, monthIndex: { in: [1, 2, 3] } },
      orderBy: { monthIndex: 'asc' },
      select: { id: true, monthIndex: true },
    });
    if (months.length < 3) {
      // Refused rather than partially applied: giving a quarterly buyer two of
      // the three months is a state nobody chose and nothing would ever
      // correct, because a second press would find them already served.
      throw new ConflictException(
        'لازم شهر ١ و٢ و٣ يكونوا موجودين على الكورس قبل ما تفتحهم لمشتركين الـ٣ شهور',
      );
    }
    const monthIds = months.map((month) => month.id);

    const now = new Date();
    const buyers = await this.prisma.paymentSubmission.findMany({
      where: {
        courseId,
        plan: 'quarterly',
        status: 'approved',
        user: {
          accessGrants: {
            some: {
              scope: 'course',
              courseId,
              revokedAt: null,
              OR: [{ validUntil: null }, { validUntil: { gt: now } }],
            },
          },
        },
      },
      distinct: ['userId'],
      select: { userId: true },
    });

    if (dryRun || buyers.length === 0) {
      return { students: buyers.length, monthIds, grantsWritten: 0, dryRun };
    }

    // `skipDuplicates` is not enough on its own — `access_grants` has no unique
    // on (userId, scope, monthId), deliberately, because a revoked grant and a
    // live one for the same month are both legitimate history. So the rows
    // already held are read first and subtracted.
    const held = await this.prisma.accessGrant.findMany({
      where: {
        scope: 'course_month',
        courseId,
        monthId: { in: monthIds },
        revokedAt: null,
        userId: { in: buyers.map((buyer) => buyer.userId) },
      },
      select: { userId: true, monthId: true },
    });
    const heldKeys = new Set(held.map((row) => `${row.userId}:${row.monthId}`));

    const rows = buyers.flatMap((buyer) =>
      monthIds
        .filter((monthId) => !heldKeys.has(`${buyer.userId}:${monthId}`))
        .map((monthId) => ({
          userId: buyer.userId,
          scope: 'course_month' as const,
          courseId,
          monthId,
          source: 'purchase' as const,
          // NEVER a date. `access_grants_month_open_ended` is a CHECK, and one
          // written here would roll the whole backfill back with a 23514.
          validUntil: null,
          note: 'legacy: ٣ شهور → شهر ١ ٢ ٣',
        })),
    );

    if (rows.length > 0) {
      await this.prisma.accessGrant.createMany({ data: rows });
    }

    await this.audit.record({
      action: 'month:update',
      resourceType: AUDIT_RESOURCES.courseMonth,
      resourceId: courseId,
      outcome: 'success',
      metadata: {
        operation: 'legacy-quarterly-backfill',
        courseId,
        students: buyers.length,
        grantsWritten: rows.length,
      },
    });

    return { students: buyers.length, monthIds, grantsWritten: rows.length, dryRun: false };
  }

}
