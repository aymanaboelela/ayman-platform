'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { AdminAttemptRow } from '@ayman/contracts/admin/attempts';
import { copy, formatCopy } from '@ayman/contracts';
import { Badge } from '@ayman/ui';
import { AttemptActions } from '@/components/admin/quiz/attempt-actions';

const STATE_LABEL = {
  in_progress: copy.quizAdmin.stateInProgress,
  overdue: copy.quizAdmin.stateOverdue,
  submitted: copy.quizAdmin.stateSubmitted,
  pending_review: copy.quizAdmin.statePendingReview,
  abandoned: copy.quizAdmin.stateAbandoned,
} as const;

const STATE_TONE = {
  in_progress: 'accent',
  overdue: 'warn',
  submitted: 'neutral',
  pending_review: 'accent',
  abandoned: 'neutral',
} as const;

/**
 * No `enableSorting` anywhere: `AttemptAdminService.listAttempts` has a fixed
 * `orderBy: { startedAt: 'desc' }` — there is no server-side sort to drive, and
 * a sortable header over data that never actually re-sorts is worse than none.
 */
export const attemptColumns: ColumnDef<AdminAttemptRow, unknown>[] = [
  {
    id: 'studentName',
    accessorKey: 'studentName',
    header: copy.quizAdmin.columnStudent,
  },
  {
    id: 'quizTitle',
    accessorKey: 'quizTitle',
    header: copy.quizAdmin.columnQuiz,
    cell: ({ row }) => (
      <div className="min-w-0">
        <p className="truncate text-fg">{row.original.quizTitle}</p>
        <p className="font-mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {formatCopy(copy.quiz.attemptNo, { n: row.original.attemptNumber })}
        </p>
      </div>
    ),
  },
  {
    id: 'state',
    header: copy.quizAdmin.columnState,
    cell: ({ row }) => <Badge tone={STATE_TONE[row.original.state]}>{STATE_LABEL[row.original.state]}</Badge>,
  },
  {
    id: 'score',
    header: copy.quizAdmin.columnScore,
    cell: ({ row }) =>
      row.original.score === null ? '—' : <span className="tabular-nums">{row.original.score}</span>,
  },
  {
    id: 'startedAt',
    header: copy.quizAdmin.columnStarted,
    cell: ({ row }) => new Date(row.original.startedAt).toLocaleString('ar-EG'),
  },
  {
    id: 'deadlineAt',
    header: copy.quizAdmin.columnDeadline,
    cell: ({ row }) =>
      row.original.deadlineAt ? new Date(row.original.deadlineAt).toLocaleString('ar-EG') : '—',
  },
  {
    id: 'actions',
    header: copy.quizAdmin.columnActions,
    cell: ({ row }) => (
      <AttemptActions
        attemptId={row.original.id}
        quizId={row.original.quizId}
        userId={row.original.userId}
        canReopen={row.original.state === 'submitted' || row.original.state === 'pending_review'}
      />
    ),
  },
];
