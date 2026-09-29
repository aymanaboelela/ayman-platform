import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { LessonKind } from '@ayman/contracts';
import type { EnrollmentSource } from '../../generated/prisma/client';
import { isMonthlyExamLesson } from '@ayman/contracts/quiz/monthly-exam';
import { isPrismaDataValidationError } from '../../common/prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ACTIVE_ENROLLMENT_STATUSES } from '../enrollment/enrollment.service';
import type { CourseAccessSubject } from '../entitlement/grant-liveness';
import { EntitlementService, type CourseAccess } from '../entitlement/entitlement.service';
import { contentGrantOpening } from '../entitlement/content-access';
import { LessonGateService } from './lesson-gate.service';

export interface LessonAccessContext {
  lessonId: string;
  kind: LessonKind;
  courseId: string;
  courseSlug: string;
  /** The unit this lecture sits in — what a `scope: section` code names. */
  sectionId: string;
  enrollmentId: string;
  /** How that enrollment came to exist. `code` means a code minted it, and
   *  is what `resolveContentAccess` reads to close what no code named. */
  enrollmentSource: EnrollmentSource;
  /** 0 when unknown — auto-completion is then impossible by design. */
  durationSeconds: number;
  /** The term this lesson's SECTION belongs to, or `null` when the course has
   *  no terms configured (or this section was never assigned to one). Only
   *  ever consulted by `require()` — see its own term-gating comment. */
  termId: string | null;
  /** The curriculum months that open THIS lecture — `LessonMonth` rows, both
   *  the primary one and the «كمان لشهر ٢ و٣» extras. Empty is a real state
   *  and means no month grant opens it; see `courseSellsByMonth`. */
  monthIds: string[];
  /**
   * Whether this lecture's course has any `CourseMonth` at all.
   *
   * `false` on every course today, and it is what keeps the original rolling
   * monthly subscription working untouched: with no month to sell there is
   * nothing to refine, so `require()` skips the month check entirely and this
   * class behaves exactly as it did before months existed. Configuring the
   * first month on a course is the single switch that turns the gate on, for
   * that course and no other.
   */
  courseSellsByMonth: boolean;
  /** The course as `courseAccessScopes` needs to see it. Carried on the
   *  context because `resolve()` has already selected every column of it. */
  courseAccessSubject: CourseAccessSubject;
  /** A quiz on the «امتحانات الشهر» shelf — opened by any live subscription to
   *  the course rather than by month (see `isMonthlyExamLesson`). */
  isMonthlyExam: boolean;
}

/**
 * Which of `resolveCourseAccess`'s denial reasons `require()` treats as a NEW
 * cutoff for a student who is already enrolled — as opposed to a reason that
 * only describes today's ENROLLMENT-time policy.
 *
 * `expired` / `revoked` / `not_yet_valid` all mean: this student was given a
 * specific grant, and right now it does not cover them. That is exactly the
 * gap `EntitlementService.enroll()` checks once, at signup, and this class
 * never re-checked — a purchased subscription's `AccessGrant.validUntil`
 * lapsing had no effect on a student already inside the course.
 *
 * `no_grant` / `needs_course_grant` are deliberately EXCLUDED. Those describe
 * `Course.requiresGrant`'s CURRENT value, which `EntitlementService.enroll`
 * already documents as an enrollment-time gate only — see its own "does not
 * shut out a student who enrolled BEFORE it was closed" test. A course closed
 * to new students after this one joined must not evict them; re-applying that
 * scope policy on every lesson open would silently break that promise.
 */
const LAPSED_GRANT_REASONS: ReadonlySet<Extract<CourseAccess, { allowed: false }>['reason']> =
  new Set(['expired', 'revoked', 'not_yet_valid']);

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly gate: LessonGateService,
    private readonly entitlement: EntitlementService,
  ) {}

  /**
   * Ownership and publication ONLY — the progression gate is deliberately not
   * consulted.
   *
   * For finishing something the student already legitimately started. The
   * codebase already holds this line elsewhere (see `gradeAndFinalise`'s B2
   * note: "a mid-attempt unpublish must not make an in-flight attempt
   * unsubmittable"), and the gate can move underneath a live attempt in one
   * real way — an admin publishes a new lesson while a student is sitting the
   * exam, which flips `everyOtherCleared` to false. Submitting that attempt,
   * or appealing its grade afterwards, must not become impossible because of
   * something the student had no part in.
   *
   * Nothing here can be used to REACH new content: every caller already holds
   * an attempt or an appeal that was created through the gated path below.
   */
  async requireOwnership(userId: string, lessonId: string): Promise<LessonAccessContext> {
    return this.resolve(userId, lessonId);
  }

  /**
   * Ownership, publication, AND the progression gate. The default, and what
   * every path that OPENS something uses.
   *
   * A locked lesson throws the same `NotFoundException` as a nonexistent one:
   * a 403 would confirm to anyone iterating ids that lesson 7 exists and is
   * merely out of reach, which is the enumeration oracle the 404-not-403 rule
   * exists to close.
   */
  async require(userId: string, lessonId: string): Promise<LessonAccessContext> {
    const context = await this.requireEntitled(userId, lessonId);

    const available = await this.gate.isAvailable(
      context.enrollmentId,
      context.courseId,
      context.lessonId,
      userId,
    );
    if (!available) {
      throw new NotFoundException('lesson not found');
    }

    return context;
  }

  /**
   * Everything `require()` checks EXCEPT the progression gate: ownership,
   * publication, the live grant, the term and the month.
   *
   * Split out for `QuizAccessService.assertCanAttempt`, which had no
   * entitlement check of any kind — it hand-rolled the enrollment predicate and
   * stopped there, so a student whose subscription had expired could still
   * start and resume an attempt, and the month gate would have been decorative
   * on every quiz in the platform. Its own docblock claimed a spec asserted the
   * two predicates could not drift; the spec only ever covered "no enrollment
   * at all".
   *
   * The progression gate is deliberately NOT in here, and that is the whole
   * reason this is a second method rather than a flag. The gate can move under
   * a live attempt — an admin publishes a lecture while a student is sitting
   * the final exam, and `everyLectureCleared` flips false — and `resume` must
   * not become a 404 because of something the student had no part in. Same
   * line `requireOwnership` above already draws, one notch further along.
   */
  async requireEntitled(userId: string, lessonId: string): Promise<LessonAccessContext> {
    const context = await this.resolve(userId, lessonId);

    /*
     * «فتح بكود» — FIRST, and it short-circuits.
     *
     * A lecture a live code grant names is open, whatever else is true: the
     * month subscriber who bought lecture 7 of «شهر ٢» by code must not meet
     * the month check below and be told it belongs to a month they did not
     * buy, and the student whose yearly subscription lapsed keeps the lecture
     * they paid for separately. A code grant is content bought outright, like
     * a month grant, so it has no window of its own to re-check here.
     *
     * Then the other half: a student whose ONLY standing on this course is
     * codes gets nothing a code did not name. Without this the enrollment the
     * code had to create would open the whole course (see `ContentAccess`).
     * `needs_course_grant` is the refusal every other closed-course door
     * already speaks, so the player's existing «اشترك» handling applies.
     */
    const content = await this.entitlement.resolveContentAccess(
      userId,
      context.courseAccessSubject,
      context.enrollmentSource,
    );
    if (contentGrantOpening(content.slice, { id: context.lessonId, sectionId: context.sectionId })) {
      return context;
    }
    if (content.codeOnly) {
      throw new ForbiddenException('needs_course_grant');
    }

    /*
     * The live-grant re-check. `resolve()` above only proves the ENROLLMENT
     * row is active — it never looks at `AccessGrant.validUntil`, and neither
     * did anything else on this path (see this class's own docblock:
     * ownership and publication "and nothing else"). `resolveCourseAccess` is
     * the one place that logic already lives; this is a 403 with the same
     * `reason` the enroll-time check already throws (`ForbiddenException`,
     * caught by the frontend's existing "your access lapsed" handling),
     * rather than a 404 that would read as the course having vanished — a
     * student who was already inside deserves the real reason and a path
     * back to renewing.
     */
    const access = await this.entitlement.resolveCourseAccess(userId, context.courseId);
    if (!access.allowed && LAPSED_GRANT_REASONS.has(access.reason)) {
      throw new ForbiddenException(access.reason);
    }

    /*
     * The TERM re-check — orthogonal to the lapsed-grant check above, and
     * deliberately not folded into it. A course-wide grant (`platform`,
     * `course`, `subject_teacher`) covers every term regardless of open/
     * closed state, so this only ever runs any real check when the access
     * this student's course-level standing rests on is ITSELF `scope: term`
     * — `resolveTermAccess` returns its input unchanged for every other case,
     * including the grandfather denial the check above already let through.
     *
     * A student blocked here never held (or no longer holds) a live grant for
     * THIS lesson's term specifically — most commonly because an admin closed
     * it, which bulk-revokes every live term grant for it (see
     * `TermService.setOpen`) and surfaces here as `reason: 'revoked'`, the
     * exact same word a lapsed course subscription already throws above.
     */
    // A monthly exam belongs to the whole course; a term cannot narrow it.
    if (context.termId !== null && !context.isMonthlyExam) {
      const termAccess = await this.entitlement.resolveTermAccess(
        userId,
        context.courseId,
        context.termId,
        access,
      );
      if (!termAccess.allowed) {
        throw new ForbiddenException(termAccess.reason);
      }
    }

    /*
     * The MONTH re-check — «الاشتراك الشهري بقى شهر من المنهج».
     *
     * Runs only for a course the instructor has configured months on, so every
     * course that has not moved over behaves exactly as it did. Unlike the term
     * check above it does NOT take `access`: `resolveMonthAccess` re-queries and
     * unions every live grant rather than refining the single one
     * `resolveCourseAccess` picked, because a student can hold a month AND a
     * wider subscription at once and the newest grant is not the widest. Its own
     * docblock has the case that costs a paying student access.
     *
     * A lecture with no month reaches nobody through a month grant — the closed
     * default, so an untagged lecture cannot leak the back-catalogue into every
     * month at once.
     */
    if (context.courseSellsByMonth) {
      const monthAccess = await this.entitlement.resolveMonthAccess(
        userId,
        context.courseAccessSubject,
        context.monthIds,
        // «أي حد مشترك في الكورس» — a monthly exam is never tagged with a
        // month, and read as a lecture it was locked to every month buyer.
        { monthlyExam: context.isMonthlyExam },
      );
      if (!monthAccess.allowed) {
        throw new ForbiddenException(monthAccess.reason);
      }
    }

    return context;
  }

  /**
   * What `require()` would say about each of these lessons, for a screen that
   * LISTS doors — «الطريق لفوق» on `/rank` — and must never draw one that
   * 404s or 403s on click.
   *
   * ## It IS `require()`, not a re-derivation of it
   *
   * Every lesson goes through `require()` itself, codes and months and terms
   * and the lapsed-grant check and the progression gate included. A bulk
   * version written from the same parts would be a second copy of the one
   * sentence that decides what a paying student may open, and the first
   * change to either copy would make a listed row open onto a padlock —
   * exactly what `unlock-codes-gate` warns every new door about.
   *
   * What makes it affordable is the collaborators, not the rule: they are
   * wrapped for THIS call so each per-COURSE question (the grants, the month
   * slice, the code slice, the gate map) is asked once per course instead of
   * once per lesson. Only `resolve()` is per lesson. The wrapper lives for one
   * call, so nothing is cached across requests and a grant bought a second
   * ago is seen.
   *
   * - `open`   — `require()` returned.
   * - `locked` — a 403: the student belongs to the course, but a subscription
   *              does not cover this (another month or term, an expired
   *              grant, a code-only buyer). A door to buy exists.
   * - `hidden` — a 404: unpublished, not theirs, or the course exam still
   *              gated. Nothing to show, and nothing to sell.
   *
   * Anything else — a database fault — is thrown, not read as «مقفول».
   */
  async openable(
    userId: string,
    lessonIds: readonly string[],
  ): Promise<Map<string, 'open' | 'locked' | 'hidden'>> {
    const scoped = new LessonAccessService(this.prisma, askedOnce(this.gate), askedOnce(this.entitlement));
    const verdicts = new Map<string, 'open' | 'locked' | 'hidden'>();
    const queue = [...new Set(lessonIds)];

    // A few at a time, not all at once: this runs on a page view, and forty
    // lesson reads fired together would hold forty pool connections that the
    // lesson player needs more.
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          await scoped.require(userId, id);
          verdicts.set(id, 'open');
        } catch (error) {
          if (error instanceof ForbiddenException) verdicts.set(id, 'locked');
          else if (error instanceof NotFoundException) verdicts.set(id, 'hidden');
          else throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(OPENABLE_CONCURRENCY, queue.length) }, worker));
    return verdicts;
  }

  private async resolve(userId: string, lessonId: string): Promise<LessonAccessContext> {
    // `lessonId` is a raw `@Param()` string, never Zod-validated the way a
    // request body is — a caller iterating ids (exactly the case this
    // method's own 404-not-403 comment defends against) can send something
    // that isn't even UUID-shaped. `lessons.id` is `uuid`, so Postgres itself
    // rejects that with `invalid input syntax for type uuid` (Prisma code
    // `P2007`) instead of the query simply matching zero rows the way a
    // `text` column always did. From the caller's point of view "not a real
    // id" and "a real id that doesn't exist" are the same answer, so both
    // fall through to the identical 404 below.
    const lesson = await this.prisma.lesson
      .findFirst({
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
          sectionId: true,
          course: {
            select: {
              slug: true,
              // `subjectId` and `requiresGrant` are the rest of what
              // `courseAccessScopes` needs — selected here so the month check
              // does not cost a second round trip for a row this query already
              // touched.
              subjectId: true,
              requiresGrant: true,
              // `take: 1` and not a count: the only question is «فيه شهور
              // أصلًا», and a course with nine months must not pay for nine
              // rows on every lesson open.
              months: { select: { id: true }, take: 1 },
              enrollments: {
                where: { userId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] } },
                select: { id: true, source: true },
                take: 1,
              },
            },
          },
          section: { select: { termId: true, title: true } },
          months: { select: { monthId: true } },
          video: { select: { durationSeconds: true } },
        },
      })
      .catch((error: unknown) => {
        if (isPrismaDataValidationError(error)) return null;
        throw error;
      });

    const enrollment = lesson?.course.enrollments[0];
    if (!lesson || !enrollment) {
      throw new NotFoundException('lesson not found');
    }

    return {
      lessonId: lesson.id,
      kind: lesson.kind as LessonKind,
      courseId: lesson.courseId,
      courseSlug: lesson.course.slug,
      sectionId: lesson.sectionId,
      enrollmentId: enrollment.id,
      enrollmentSource: enrollment.source,
      durationSeconds: lesson.video?.durationSeconds ?? 0,
      termId: lesson.section.termId,
      monthIds: lesson.months.map((row) => row.monthId),
      courseSellsByMonth: lesson.course.months.length > 0,
      courseAccessSubject: {
        id: lesson.courseId,
        subjectId: lesson.course.subjectId,
        requiresGrant: lesson.course.requiresGrant,
      },
      isMonthlyExam: isMonthlyExamLesson(lesson.kind, lesson.section.title),
    };
  }
}

/** How many lessons `openable()` asks about at the same time. */
const OPENABLE_CONCURRENCY = 4;

/**
 * The same object, except every method answers each distinct set of arguments
 * ONCE for as long as this wrapper lives — for `openable()`, one call.
 *
 * A `Proxy` rather than a hand-written subclass per service, because the point
 * is that `require()` runs UNCHANGED against it: a subclass would have to list
 * the methods it caches, and a method added to `EntitlementService` next month
 * would quietly go uncached rather than quietly keep working.
 *
 * Methods are invoked with the proxy as `this`, so a method that calls a
 * sibling (`LessonGateService.isAvailable` → `resolveCourse`,
 * `resolveMonthAccess` → `resolveMonthSlice`) reaches the cached one too. The
 * key is the JSON of the arguments — ids, a `CourseAccessSubject`, a
 * `CourseAccess` — none of which carry anything JSON cannot tell apart.
 *
 * ⚠️ Never for a WRITE. It is only ever handed the two read-only services
 * `require()` consults.
 */
function askedOnce<T extends object>(target: T): T {
  const answers = new Map<string, unknown>();
  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver);
      if (typeof value !== 'function' || typeof property !== 'string') return value;
      return (...args: unknown[]) => {
        const key = `${property}:${JSON.stringify(args)}`;
        if (!answers.has(key)) answers.set(key, (value as (...a: unknown[]) => unknown).apply(receiver, args));
        return answers.get(key);
      };
    },
  });
}
