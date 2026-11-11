import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { formatCopy } from '@ayman/contracts/format';

/**
 * The line the review box starts with — it lands in the student's thread
 * (the review endpoint always writes one), so it has to say what changed.
 * A mark is only ever spoken for an accepted submission; the contract refuses
 * a grade on «يتعاد».
 */
export function defaultHomeworkMessage({
  lesson,
  decision,
  grade,
}: {
  lesson: string;
  decision: 'accepted' | 'needs_work';
  grade: number | null;
}): string {
  if (decision === 'needs_work') return formatCopy(c.homework.defaultNeedsWork, { lesson });
  if (grade === null || !Number.isFinite(grade)) return formatCopy(c.homework.defaultAccepted, { lesson });
  return formatCopy(c.homework.defaultGraded, { lesson, grade });
}
