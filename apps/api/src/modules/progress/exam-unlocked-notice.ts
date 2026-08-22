import type { Prisma } from '../../generated/prisma/client';
import type { NotificationsService } from '../notifications/notifications.service';

/**
 * Fires `exam_unlocked` exactly once, the instant a course's last reachable
 * lecture clears — shared by `LessonProgressService.markComplete` and
 * `HeartbeatService.record`, the two places a lecture can transition into
 * `completed`. A quiz pass (`recordQuizResultTx`) never calls this: quizzes
 * are excluded from `CourseProgressService`'s own denominator, so passing one
 * can never be what makes a course `justFinished`.
 *
 * Takes the CALLER's own `tx` — `NotificationsService.emit` requires one (a
 * notification about a completion that gets rolled back is worse than none),
 * and this always runs from inside the same transaction that just computed
 * `justFinished`.
 *
 * `justFinished` is the guard, not `finished`: the caller has already done
 * the work of telling "just now completed" from "was already completed" (see
 * `CourseProgressService.recalculate`), so a course with no exam or one
 * already past this moment costs nothing beyond the boolean check.
 */
export async function notifyIfExamUnlocked(
  tx: Prisma.TransactionClient,
  notifications: NotificationsService,
  args: { userId: string; courseId: string; justFinished: boolean },
): Promise<void> {
  if (!args.justFinished) return;

  const course = await tx.course.findUnique({
    where: { id: args.courseId },
    select: { examLessonId: true },
  });
  if (!course?.examLessonId) return;

  await notifications.emit(tx, {
    userId: args.userId,
    kind: 'exam_unlocked',
    lessonId: course.examLessonId,
  });
}
