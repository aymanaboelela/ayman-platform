import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessGrant, AccessScope } from '../../generated/prisma/client';
import { courseAccessScopes, grantLiveness, type CourseAccessSubject } from './grant-liveness';
import {
  grantOpeningLesson,
  grantOpeningMonthlyExam,
  monthSliceOf,
  type MonthSlice,
} from './month-access';

/**
 * The return type is an OBJECT in both directions. A `boolean` here is the seed
 * of every "why can't this student see the course?" support ticket, and it is
 * the shape §6.6 exists to prevent — a denial that cannot say why is a denial
 * nobody can debug, and an approval that cannot say which grant produced it is
 * an approval nobody can audit.
 */
export type CourseAccess =
  | { allowed: true; grantId: string; scope: AccessScope; validUntil: Date | null }
  | {
      allowed: false;
      reason:
        | 'no_grant'
        | 'not_yet_valid'
        | 'expired'
        | 'revoked'
        | 'course_not_published'
        /**
         * The course requires a grant of its own and this student has only the
         * platform-wide one. A DISTINCT reason from `no_grant`, because it is a
         * different sentence to a student — "this course is closed" rather than
         * "something is wrong with your account" — and a different action for
         * the admin, who has to issue a course grant rather than investigate.
         */
        | 'needs_course_grant'
        /**
         * ONLY ever produced by `resolveTermAccess`, never by
         * `resolveCourseAccess` itself — a course has no notion of "which
         * term", so this reason cannot occur at that granularity. It means:
         * this student's course-level access is a `scope: term` grant, but not
         * one that covers THIS lesson's term — either they never held one for
         * it, or it was revoked when an admin closed the term. Distinct from
         * `needs_course_grant` for the same reason that one is distinct from
         * `no_grant`: a different sentence («لازم تشترك في الترم ده») and a
         * different admin action.
         */
        | 'needs_term_grant'
        /**
         * The month twin of `needs_term_grant`: this student holds a live
         * grant for the course, but every one of them is `scope: course_month`
         * for a month that does NOT include this lecture — «المحاضرة دي تابعة
         * لشهر تاني».
         *
         * Also what a lecture with no month at all answers to a month-only
         * buyer. That is the closed default the instructor chose: an untagged
         * lecture reaches term and yearly subscribers and no monthly one, so a
         * lecture he forgot to tag stays out of a month he never sold it in
         * rather than leaking into every month at once.
         */
        | 'needs_month_grant';
    };

/** Human-readable provenance on the auto-created grant, for the audit trail. */
const FREE_PLATFORM_NOTE = 'auto: v1 is free for every registered student';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class EntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * "Free for everyone" as a row. Created lazily on first enrollment rather
   * than at registration, so the grant's `validFrom` records when the student
   * actually started using the platform.
   */
  async ensurePlatformGrant(userId: string): Promise<AccessGrant> {
    const existing = await this.prisma.accessGrant.findFirst({
      where: { userId, scope: 'platform', revokedAt: null },
    });
    if (existing) return existing;

    try {
      return await this.prisma.accessGrant.create({
        data: { userId, scope: 'platform', source: 'auto_free', note: FREE_PLATFORM_NOTE },
      });
    } catch (error) {
      // Two concurrent first-enrollments race here. The partial unique index is
      // what decides; the loser simply re-reads the winner's row. Catching the
      // violation is correct — checking-then-creating is not atomic.
      if (!isUniqueViolation(error)) throw error;
      return this.prisma.accessGrant.findFirstOrThrow({
        where: { userId, scope: 'platform', revokedAt: null },
      });
    }
  }

  /**
   * Ownership is compiled into the query: `userId` is in the WHERE clause, so
   * there is no fetch-then-check step to forget. The validity window is
   * evaluated in code (not in SQL) purely so the denial can name a reason —
   * the actor scoping is still done by the database.
   */
  async resolveCourseAccess(userId: string, courseId: string): Promise<CourseAccess> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, subjectId: true, requiresGrant: true },
    });
    if (!course) throw new NotFoundException();
    if (course.status !== 'published') {
      return { allowed: false, reason: 'course_not_published' };
    }

    /*
     * WHICH SCOPES COUNT — the whole of what `requiresGrant` changes — is
     * `courseAccessScopes`, in `./grant-liveness`, and it is shared with
     * `EnrollmentService.listOwn`. That sharing is the point: the list and
     * this method must never disagree about which grants open a course, or a
     * student reads as «enrolled» in a list after the grant behind it lapsed.
     *
     * Note what does NOT change: access is still decided by reading grants,
     * with their scopes and validity windows, and never by a column on the
     * course. The schema's warning against a boolean `isFree` is about exactly
     * that shortcut, and this is not it.
     */
    const scopes = courseAccessScopes(course);

    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, OR: scopes },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: { id: true, scope: true, validFrom: true, validUntil: true, revokedAt: true },
    });

    if (grants.length === 0) {
      // Told apart, because they are different situations — see the reason's
      // own note. A closed course with no grant is the NORMAL state for a
      // student who has not been given it, not a fault.
      return {
        allowed: false,
        reason: course.requiresGrant ? 'needs_course_grant' : 'no_grant',
      };
    }

    const now = new Date();
    // Report the most specific failure we saw, in severity order, so the admin
    // UI can say "انتهت صلاحية الاشتراك" rather than "لا يوجد اشتراك".
    let fallback: CourseAccess = {
      allowed: false,
      reason: course.requiresGrant ? 'needs_course_grant' : 'no_grant',
    };

    for (const grant of grants) {
      const liveness = grantLiveness(grant, now);
      if (liveness !== 'live') {
        fallback = { allowed: false, reason: liveness };
        continue;
      }
      return {
        allowed: true,
        grantId: grant.id,
        scope: grant.scope,
        validUntil: grant.validUntil,
      };
    }

    return fallback;
  }

  /**
   * The per-TERM refinement of `resolveCourseAccess`, called only by
   * `LessonAccessService.require` and only when a lesson's section belongs to
   * a term.
   *
   * `resolveCourseAccess` alone cannot answer "is it open for THIS lesson":
   * its scopes match a `term` grant on `courseId` alone (any term), and it
   * returns the single most-recent LIVE one across every matching scope — so
   * a student holding a live grant for «الترم الأول» reads as course-access
   * `allowed: true, scope: 'term'` even when the lesson being opened belongs
   * to «الترم الثاني». This method is the exact-term check that closes that
   * gap.
   *
   * Deliberately takes the ALREADY-RESOLVED `courseAccess` rather than
   * recomputing it — `require()` already has it (it needed it for the
   * lapsed-grant re-check first), and recomputing here would risk the two
   * disagreeing about which grant "won" under a concurrent write.
   */
  async resolveTermAccess(
    userId: string,
    courseId: string,
    termId: string,
    courseAccess: CourseAccess,
  ): Promise<CourseAccess> {
    /*
     * A course-wide scope (platform/course/subject_teacher) covers EVERY term
     * regardless of open/closed state — requirement 5 of the feature, stated
     * once here rather than re-derived at every call site. Only `scope:
     * 'term'` is ever term-specific.
     *
     * `!courseAccess.allowed` also returns as-is: `resolveCourseAccess` only
     * matches a `term`-scope grant when at least one exists for the course,
     * so "no live grant of ANY matching scope" already proves there is no
     * live term grant either — nothing here can find one it missed. This also
     * preserves the grandfather case `LessonAccessService.require` documents
     * (a student enrolled before a policy tightened): that method only ever
     * reaches this call when `courseAccess.allowed` is true, so the
     * `!allowed` branch is dead in practice today and kept only so this
     * method's contract does not silently depend on that.
     */
    if (!courseAccess.allowed || courseAccess.scope !== 'term') {
      return courseAccess;
    }

    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, scope: 'term', courseId, termId },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: { id: true, validFrom: true, validUntil: true, revokedAt: true },
    });

    const now = new Date();
    let fallback: CourseAccess = { allowed: false, reason: 'needs_term_grant' };

    for (const grant of grants) {
      // `revoked` here is the bulk-revoke-on-close outcome seen from the
      // lesson side — the same reason `LessonAccessService.require`'s
      // lapsed-grant check already throws on for a cancelled subscription.
      // `expired` is unreachable for a term grant (its `validUntil` is always
      // `null`; see the model doc) and is covered anyway, so a future change
      // to that invariant does not silently stop being checked.
      const liveness = grantLiveness(grant, now);
      if (liveness !== 'live') {
        fallback = { allowed: false, reason: liveness };
        continue;
      }
      return { allowed: true, grantId: grant.id, scope: 'term', validUntil: grant.validUntil };
    }

    return fallback;
  }

  /**
   * The per-MONTH refinement of `resolveCourseAccess`, called only by
   * `LessonAccessService.require` and only for a course that has months
   * configured.
   *
   * ## Why this does NOT take the already-resolved `courseAccess`
   *
   * `resolveTermAccess` next door does, and says why: `require()` already has
   * it, and recomputing risks the two disagreeing under a concurrent write.
   * That reasoning is sound for terms and WRONG for months, because of one
   * difference in how the two are sold.
   *
   * A student holds at most one term at a time in practice. A student can
   * easily hold «شهر ٢» AND a live yearly subscription — he renews the year in
   * March and tops up a month he missed, or an admin hands him a course grant
   * while he already owns two months. `resolveCourseAccess` returns exactly
   * ONE grant, `ORDER BY validFrom DESC, id DESC` — the NEWEST live one, which
   * is not the WIDEST. Refining that single winner would mean the month he
   * bought last Tuesday silently narrows the year he paid for in September:
   * the student loses access he holds a live, unrevoked, fully-paid grant for,
   * and no screen anywhere says why.
   *
   * So this re-queries and UNIONS. The verdict is "does ANY live grant open
   * this lecture", never "does the winning grant open it". It can only ever
   * allow more than the single-winner form, never less, which is the direction
   * a mistake here has to fail in.
   *
   * (The same shadowing exists on the term path today and is not fixed here:
   * fixing it changes what a live term buyer can reach, which is its own
   * change with its own evidence.)
   */
  async resolveMonthAccess(
    userId: string,
    course: CourseAccessSubject,
    lessonMonthIds: readonly string[],
    /**
     * A monthly exam (`isMonthlyExamLesson`): opened by ANY live grant on the
     * course, whatever months it carries — «أي حد مشترك في الكورس». Its month
     * tags, if an old adopt press wrote some, are ignored.
     */
    options: { monthlyExam?: boolean } = {},
  ): Promise<CourseAccess> {
    const slice = await this.resolveMonthSlice(userId, course);

    if (options.monthlyExam) {
      const examGrantId = grantOpeningMonthlyExam(slice);
      if (examGrantId !== null) {
        return { allowed: true, grantId: examGrantId, scope: 'course_month', validUntil: null };
      }
      // Not «تابعة لشهر تاني» — there is no other month to buy for an exam.
      // What is missing is a live subscription to the course at all.
      if (!slice.everything && slice.lapsed !== null) return { allowed: false, reason: slice.lapsed };
      return { allowed: false, reason: course.requiresGrant ? 'needs_course_grant' : 'no_grant' };
    }

    const grantId = grantOpeningLesson(slice, lessonMonthIds);
    if (grantId !== null) {
      // `validUntil: null` unconditionally, and that is correct for every
      // grant that can reach here: a month grant has no expiry by CHECK, and a
      // wider grant that is still LIVE has, by definition, not reached its own.
      // The lapsed case never gets an `allowed: true` to carry a date on.
      return { allowed: true, grantId, scope: 'course_month', validUntil: null };
    }

    // A live subscription to a DIFFERENT month outranks a stale one as the
    // explanation. «انتهى اشتراكك» would be a lie to a student whose
    // subscription is live and simply is not for this lecture, and it would
    // send them to renew something they already hold.
    if (slice.everything || slice.monthIds.size > 0 || slice.lapsed === null) {
      return { allowed: false, reason: 'needs_month_grant' };
    }
    return { allowed: false, reason: slice.lapsed };
  }

  /**
   * The same verdict as `resolveMonthAccess`, for a WHOLE outline at once.
   *
   * `LessonGateService` draws every lesson of a course in one pass and would
   * otherwise ask per lesson. Both callers reduce the same grants with the same
   * pure function (`monthSliceOf`), which is the point — an outline that drew a
   * row open and then 403'd on click, or drew a padlock on something already
   * paid for, is what two hand-rolled loops produce.
   */
  async resolveMonthSlice(userId: string, course: CourseAccessSubject): Promise<MonthSlice> {
    const grants = await this.prisma.accessGrant.findMany({
      where: { userId, OR: courseAccessScopes(course) },
      orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        scope: true,
        monthId: true,
        validFrom: true,
        validUntil: true,
        revokedAt: true,
      },
    });

    return monthSliceOf(grants, new Date());
  }

  /**
   * The course's opening lesson: first published lesson of the first published
   * section, in the same order the outline and the player use. `null` for a
   * published course with no published lessons — a real state (a course
   * published before its content lands), and the caller renders it as a
   * disabled button rather than navigating to `/lessons/null`.
   */
  /**
   * Where «نبدأ الكورس» actually lands — the last lesson they were on, or the
   * course's opening one, but never a lesson their subscription does not open.
   *
   * ## Why the filter is here and not only in the gate
   *
   * `LessonAccessService.require` would refuse it a moment later, correctly,
   * with a 403 — and the student would have pressed a button that took them to
   * a padlock. Worse for the returning one: `lastLessonId` is where they
   * stopped watching, so a student whose yearly subscription lapsed and who
   * then bought «شهر ٢» would be sent straight back to the «شهر ٥» lecture
   * they were on, every single time they pressed the button.
   *
   * On a course with no months this is exactly the old two-line behaviour —
   * `monthSliceOf` on a student with any course-wide grant returns
   * `everything`, and a course with no `lesson_months` rows has nothing to
   * filter against either way.
   */
  private async resumableLessonId(
    courseId: string,
    userId: string,
    course: CourseAccessSubject,
    lastLessonId: string | null,
  ): Promise<string | null> {
    const slice = await this.resolveMonthSlice(userId, course);
    if (slice.everything) return lastLessonId ?? (await this.firstLessonId(courseId));

    const owned = [...slice.monthIds];
    if (lastLessonId !== null) {
      const stillOwned = await this.prisma.lesson.findFirst({
        where: { id: lastLessonId, courseId, months: { some: { monthId: { in: owned } } } },
        select: { id: true },
      });
      if (stillOwned) return stillOwned.id;
    }

    return this.firstLessonId(courseId, owned);
  }

  /**
   * The course's opening lesson, optionally narrowed to a set of months.
   *
   * `ownedMonthIds` is `null` for "no narrowing" — a course-wide subscriber,
   * or a course that has no months at all. An EMPTY array is not the same
   * thing and must not be treated as one: it means the student owns no month
   * here, so no lesson qualifies and the honest answer is `null`.
   */
  private async firstLessonId(courseId: string, ownedMonthIds: string[] | null = null): Promise<string | null> {
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        courseId,
        isPublished: true,
        section: { isPublished: true },
        ...(ownedMonthIds === null
          ? {}
          : { months: { some: { monthId: { in: ownedMonthIds } } } }),
      },
      orderBy: [
        { section: { position: 'asc' } },
        { section: { id: 'asc' } },
        { position: 'asc' },
        { id: 'asc' },
      ],
      select: { id: true },
    });
    return lesson?.id ?? null;
  }

  /**
   * Enroll, creating the platform grant if this is the student's first course.
   *
   * `resumeLessonId` is what makes the course page's single "ابدأ الكورس"
   * button cost ONE round trip
   * (`2026-08-03-login-gated-content-design.md` §5.1). Without it the client
   * has to enroll and then fetch the outline just to learn where to navigate,
   * putting a second sequential request on the critical path of the product's
   * primary action.
   *
   * The upsert is what makes the button idempotent: a student who is already
   * enrolled and clicks again re-enters the same enrollment and resumes where
   * they stopped, rather than creating a second one or being told "already
   * enrolled".
   */
  async enroll(
    userId: string,
    courseId: string,
  ): Promise<{ enrollmentId: string; access: CourseAccess; resumeLessonId: string | null }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      // `subjectId` is for the month slice below — `courseAccessScopes` needs
      // it, and this row is already being read.
      select: { id: true, status: true, subjectId: true, requiresGrant: true },
    });
    if (!course || course.status !== 'published') throw new NotFoundException();

    /*
     * The platform grant is created for EVERY student, closed course or not.
     *
     * It is not what opens this course — `resolveCourseAccess` drops `platform`
     * from the satisfying scopes when `requiresGrant` is set — it is the row
     * that records when this student started using the platform at all, and
     * every free course they take depends on it. Skipping it here for a student
     * whose first click happened to be a closed course would leave them with no
     * grant at all and every FREE course shut too.
     */
    await this.ensurePlatformGrant(userId);

    /*
     * REFUSED BEFORE THE ENROLLMENT ROW EXISTS, and the order is the point.
     *
     * `LessonAccessService` gates every lesson, video, resource and quiz on an
     * active enrollment and nothing else. So the enrollment IS the key, and the
     * only safe place to check entitlement is before one is minted — a row
     * created first and judged after is a door already open.
     *
     * This runs for every enrollment, not just closed ones: a course flipped to
     * `requiresGrant` after a student enrolled keeps that student in (their row
     * already exists and `upsert` only revives it), which is the deliberate
     * answer to "what happens to the forty students already inside" — they
     * finish. New students meet this.
     */
    const access = await this.resolveCourseAccess(userId, courseId);
    if (!access.allowed) {
      // The reason travels: `needs_course_grant` is «الكورس ده مقفول» to a
      // student, and `expired` is «انتهت صلاحيتك» — a 403 with no reason is
      // the support ticket this service's return type exists to prevent.
      throw new ForbiddenException(access.reason);
    }

    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: { status: 'active' },
      select: { id: true, lastLessonId: true },
    });

    return {
      enrollmentId: enrollment.id,
      access,
      // Where they stopped wins; the opening lesson is the fallback for a
      // first enrollment — and BOTH are filtered by the months this student
      // owns, because «نبدأ» landing on a padlock is the worst possible first
      // press. See `resumableLessonId`.
      resumeLessonId: await this.resumableLessonId(courseId, userId, course, enrollment.lastLessonId),
    };
  }

  /** The caller's own enrollments. `userId` comes from the session, never the URL. */
  listOwnEnrollments(userId: string) {
    return this.prisma.enrollment.findMany({
      where: { userId, status: { in: ['active', 'completed'] } },
      orderBy: [{ enrolledAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        course: { select: { id: true, slug: true, title: true, coverKey: true } },
      },
    });
  }
}
