import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

/** Anything with a `lesson`, `lessonProgress` and `enrollment` delegate — the
 *  PrismaService itself or a transaction client, interchangeably. */
type PrismaLike = Prisma.TransactionClient;

/**
 * What `recalculate` answers with.
 *
 * It used to be a bare `number`, and the change is the whole reason «مبروك،
 * خلصت الكورس» can exist. The notification ROW is written in here, inside the
 * caller's transaction, because a congratulation for a completion that rolled
 * back is a message about something that did not happen. But the LIVE
 * announcement must not go out until that transaction commits — see
 * `NotificationsService.announce` — and this service has no way to know when
 * that is. So it hands the id back and the transaction's owner announces,
 * exactly the shape `BookOrdersService.pay` uses for `book_order_placed`.
 *
 * A caller that ignores `completedNow` is not broken, only quieter: the row
 * is already durable, and the student sees it on their next poll instead of
 * the same second.
 */
export interface CourseProgressResult {
  /** 0–100, rounded to two decimals. */
  percent: number;
  /**
   * The STUDENT's user id, and only when THIS call is the one that moved the
   * course into finished. `null` on every other outcome — including a
   * recalculation of a course that was already finished before it ran.
   */
  completedNow: string | null;
}

@Injectable()
export class CourseProgressService {
  /**
   * Required, not `@Optional()`.
   *
   * `NotificationsService` itself makes two of its own dependencies optional
   * for hand-constructed specs, and the temptation here is to copy that. It
   * would be the wrong trade: those two are FAN-OUT (a live socket, a push),
   * and losing them costs a student a few seconds. This one writes the row —
   * the notification itself — so a missing provider would not degrade the
   * feature, it would delete it, silently, in production only. The three
   * specs that build this service by hand pass one; that is the smaller cost.
   */
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * Course progress is "completed published lessons ÷ published lessons",
   * which is the number every Egyptian platform shows and the only one a
   * student can sanity-check against the outline they are looking at.
   *
   * Per-lesson partial `completion` still exists — it drives the continue-
   * watching bar and future analytics — but averaging partials into the
   * course number would make the headline percentage drift every ten seconds
   * for no informational gain, and would force this aggregate to run on every
   * heartbeat instead of only on a state transition.
   */
  async recalculate(
    tx: PrismaLike,
    enrollmentId: string,
    courseId: string,
  ): Promise<CourseProgressResult> {
    /**
     * ⚠️ `section: { isPublished: true }` is load-bearing on BOTH counts, and
     * its absence is why a finished course could not reach 100%.
     *
     * A lesson carries its own `isPublished`, and so does its section. The
     * student-facing outline requires both — `player.service.ts` builds every
     * list it shows from `{ courseId, isPublished: true, section: {
     * isPublished: true } }`. This aggregate used to require only the first.
     *
     * So a published lesson inside an UNPUBLISHED section was invisible to the
     * student and impossible for them to open, while still sitting in the
     * denominator here. The student completed every lesson the platform would
     * show them and the course stuck at 90-something percent; `finished` never
     * became true, so `completedAt` was never stamped and the course never
     * moved out of «اللي لسه شغال عليه». Nothing on any screen explained it,
     * because the lessons responsible were the ones deliberately not rendered.
     *
     * The predicate is duplicated rather than imported because the two live in
     * different modules; if a third place needs it, extract it then. What must
     * not happen again is the two DRIFTING — a denominator that counts lessons
     * the numerator can never reach is unsatisfiable by construction.
     */
    /**
     * ⚠️ `kind: { not: 'quiz' }` — the denominator is LECTURES.
     *
     * A quiz is not a lesson a student "does"; it is the check that hangs off
     * the lecture above it, and the final exam is the check on the course. With
     * quizzes in the denominator a three-lecture course read «١ من ٥», the
     * outline numbered the quizzes «المحاضرة ٣» and «المحاضرة ٥», and the
     * headline percentage disagreed with the count beside it — 66.67% next to
     * «٢ / ٥», because the two were computed over different sets.
     *
     * Counting lectures only makes every one of those agree, and it is also the
     * set `resolveGate` walks: what moves the student forward and what counts
     * as progress are now the same list.
     */
    const reachable = {
      courseId,
      isPublished: true,
      section: { isPublished: true },
      kind: { not: 'quiz' as const },
    };

    /*
     * The enrolment is read BEFORE the update, and it is read for two things
     * that look unrelated and are the same thing: `completedAt` (were we
     * already finished?) and `userId` (who is the student?).
     *
     * The row is the only durable record, inside this transaction, of whether
     * this course has already been celebrated. There is no other — a
     * `notifications` lookup would be a second source of truth, free to
     * disagree the day an old notification is deleted or a feed is pruned.
     */
    const [totalLessons, completedLessons, enrollment] = await Promise.all([
      tx.lesson.count({ where: reachable }),
      tx.lessonProgress.count({
        where: {
          enrollmentId,
          state: { in: ['completed', 'passed'] },
          lesson: reachable,
        },
      }),
      tx.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
        select: { userId: true, completedAt: true },
      }),
    ]);

    const percent =
      totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 10_000) / 100;
    const finished = totalLessons > 0 && completedLessons === totalLessons;

    /*
     * ⚠️ The EDGE, not the value.
     *
     * `finished` is recomputed from scratch on every lesson completion and it
     * keeps answering `true` for a course that is already done. Two separate
     * bugs live in treating that answer as an event:
     *
     *   1. `completedAt: finished ? new Date() : null` re-stamped a FRESH date
     *      every time a finished course was recalculated, so «خلصته في مارس»
     *      quietly became «خلصته امبارح» — the completion date drifted forward
     *      with every revision visit, and nothing on any screen said so.
     *      `enrollment.completedAt ?? new Date()` keeps the first answer,
     *      which is the true one.
     *
     *   2. Emitting on `finished` would congratulate a student every single
     *      time they re-opened a lesson in a course they had already closed.
     *      The warmest message on the platform would become the one they mute.
     *
     * The un-finish branch is UNCHANGED and deliberately so: publishing a new
     * lesson into a finished course must still clear `completedAt`, because
     * the course genuinely is not finished any more. And that is also what
     * re-arms the notification — finishing the newly added lesson is a second,
     * real completion, and it says so again.
     */
    const justFinished = finished && enrollment.completedAt === null;

    await tx.enrollment.update({
      where: { id: enrollmentId },
      data: {
        progressPercent: percent,
        // `status` deliberately stays `active`. Finishing a course must not
        // drop the enrollment out of the ownership filters and revoke access
        // to the very thing that was just completed.
        completedAt: finished ? (enrollment.completedAt ?? new Date()) : null,
      },
    });

    if (justFinished) {
      /*
       * INSIDE the transaction, on purpose — the same discipline every other
       * emitter follows. This one is being written by the very statement above
       * that decides the course is finished; a congratulation that survived a
       * rollback would tell a student they had closed a course the database
       * still thinks they are halfway through.
       *
       * The live half — `announce` — is the caller's job, after the commit.
       * See `CourseProgressResult`.
       */
      await this.notifications.emit(tx, {
        userId: enrollment.userId,
        kind: 'course_completed',
        courseId,
      });
    }

    return { percent, completedNow: justFinished ? enrollment.userId : null };
  }
}
