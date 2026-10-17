import type { AdminAttemptState, AttemptQuizKind } from '@ayman/contracts/admin/attempts';
// `/copy/admin`, never the root barrel: these screens only ever render inside
// the admin layout. Read by SERVER components only — see the note on
// `copy.quizAdmin.board`.
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

const q = copy.quizAdmin;

/** The state words the old table printed, kept: the tabs and the row badges
 *  must say the same word for the same state. */
export const STATE_LABEL: Record<AdminAttemptState, string> = {
  in_progress: q.stateInProgress,
  overdue: q.stateOverdue,
  submitted: q.stateSubmitted,
  pending_review: q.statePendingReview,
  abandoned: q.stateAbandoned,
};

/** «كويز المحاضرة ٣» when the lecture has a number, the bare kind otherwise. */
export function kindLabel(kind: AttemptQuizKind, lectureNumber: number | null): string {
  return kind === 'lecture_quiz' && lectureNumber !== null
    ? formatCopy(q.board.lectureQuiz, { n: lectureNumber })
    : q.board.kind[kind];
}

/**
 * The washes every chip and icon well here is painted with — the homework
 * queue's own, so the two screens a teacher works through side by side speak
 * one colour language. Colour carries meaning, never decoration: amber is
 * «something to do», green «done», blue «still going».
 */
export const WASH = {
  accent: 'bg-accent/15 text-accent-text',
  ok: 'bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]',
  err: 'bg-[color-mix(in_oklch,var(--err),transparent_86%)] text-[color:var(--err)]',
  warn: 'bg-[color-mix(in_oklch,var(--warn),transparent_86%)] text-[color:var(--warn)]',
  info: 'bg-[color-mix(in_oklch,var(--info),transparent_86%)] text-[color:var(--info)]',
  study: 'bg-study-tint text-study',
  neutral: 'bg-surface-3 text-fg-muted',
} as const;

/** What kind of paper, at a glance: ember for a lecture's quiz (structure, like
 *  the course outline), amber for the course exam, blue for the month's. */
export const KIND_WASH: Record<AttemptQuizKind, keyof typeof WASH> = {
  lecture_quiz: 'study',
  course_exam: 'accent',
  monthly_exam: 'info',
};

export const STATE_WASH: Record<AdminAttemptState, keyof typeof WASH> = {
  in_progress: 'info',
  overdue: 'warn',
  submitted: 'ok',
  pending_review: 'accent',
  abandoned: 'neutral',
};
