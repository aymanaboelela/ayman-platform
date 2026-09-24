import { EXAM_SHELF_TITLE } from '@ayman/contracts/quiz/scheduled';

/**
 * Is this lesson a MONTHLY EXAM — a quiz on the «امتحانات الشهر» shelf?
 *
 * The one predicate every reader of the rule below shares: the access check,
 * the lesson gate, the untagged-lesson count, the adopt press and the admin
 * outline. A copy that drifted by one condition recreates the dead end this
 * exists to close — the server says «فيه ١ من غير شهر» and the list shows
 * nothing, or the row opens and then 403s.
 *
 * ## The rule it carries
 *
 * «أي حد مشترك في الكورس، من غير فلوس زيادة». A monthly exam belongs to the
 * COURSE, not to a curriculum month: it is never tagged with one, and anybody
 * holding a live subscription to the course — any month, a term, the year —
 * sits it. Month tags decide who sees a LECTURE; they are meaningless on an
 * exam, and treating an untagged exam as «في شهر تاني» locked it away from
 * every month buyer while it still blocked every month from going on sale.
 *
 * ⚠️ `quiz` AND the shelf, not the shelf alone. A lecture somebody placed on
 * the shelf through the API is still a lecture, and it keeps the month rule.
 *
 * A NEW module rather than more of `quiz/scheduled.ts`: that one is imported by
 * client components, and a module a previous build already shipped must not
 * gain exports (a tab from that build would read them as `undefined`).
 */
export function isMonthlyExamLesson(kind: string, sectionTitle: string): boolean {
  return kind === 'quiz' && sectionTitle === EXAM_SHELF_TITLE;
}

/** The same predicate as a Prisma `LessonWhereInput` fragment — for
 *  `NOT: MONTHLY_EXAM_LESSON` on the untagged count and the adopt press. */
export const MONTHLY_EXAM_LESSON = {
  kind: 'quiz',
  section: { title: EXAM_SHELF_TITLE },
} as const;
