import Link from 'next/link';
import { CheckCircle2, Clock3, ExternalLink, NotebookPen, RotateCcw } from 'lucide-react';
import { listResponse } from '@ayman/contracts/admin/list';
import { AdminHomeworkRowSchema, type AdminHomeworkRow } from '@ayman/contracts/homework';
import { copy } from '@ayman/contracts/copy/admin';
import { adminStudentPanel as c } from '@ayman/contracts/copy/admin-student-panel';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { formatCairoShort } from '@/components/admin/exams/exam-time';
import { WASH } from '../../../attempts/labels';
import { HomeworkReviewInline } from './homework-review-inline';
import { PanelNotice } from './panel-notice';

const PER_PAGE = 100;

const STATUS_WASH: Record<AdminHomeworkRow['status'], keyof typeof WASH> = {
  submitted: 'accent',
  accepted: 'ok',
  needs_work: 'warn',
};

const STATUS_ICON: Record<AdminHomeworkRow['status'], typeof Clock3> = {
  submitted: Clock3,
  accepted: CheckCircle2,
  needs_work: RotateCcw,
};

/**
 * «الواجبات» — everything this student handed in, its verdict and its mark,
 * with the review (accept / «يتعاد» / change the mark) right on the row.
 *
 * `GET /api/admin/homework?userId=` — the queue's own list, narrowed to one
 * student. The photographs stay on the full review screen («افتح الواجب»):
 * a submission still waiting is read page by page there, and the drawer is
 * for the decision, not for reading an exercise book at 56rem.
 */
export async function HomeworkTab({ userId }: { userId: string }) {
  let list;
  try {
    list = await adminGetOrForbidden(
      `/api/admin/homework?userId=${encodeURIComponent(userId)}&filter=all&perPage=${PER_PAGE}`,
      listResponse(AdminHomeworkRowSchema),
    );
  } catch {
    return <PanelNotice title={c.unavailable} />;
  }
  if (list === null) {
    return <PanelNotice title={copy.admin.settings.panelForbidden} hint={copy.admin.settings.panelForbiddenHint} />;
  }

  const rows = list.rows as AdminHomeworkRow[];
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center">
        <span aria-hidden="true" className={cn('mx-auto grid size-12 place-items-center rounded-2xl', WASH.study)}>
          <NotebookPen className="size-6" />
        </span>
        <p className="mt-3 font-semibold text-fg">{c.homework.empty}</p>
        <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.homework.emptyHint}</p>
      </div>
    );
  }

  const session = await getSession();
  const canReview = can(session, 'homework:review');
  const count = (status: AdminHomeworkRow['status']) => rows.filter((row) => row.status === status).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Count icon={NotebookPen} tone="study" label={c.homework.sat} value={list.rowCount} />
        <Count icon={CheckCircle2} tone="ok" label={c.homework.accepted} value={count('accepted')} />
        <Count icon={RotateCcw} tone="warn" label={c.homework.needsWork} value={count('needs_work')} />
        <Count icon={Clock3} tone="accent" label={c.homework.pending} value={count('submitted')} />
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row) => {
          const Icon = STATUS_ICON[row.status];
          return (
            <li
              key={row.id}
              className={cn(
                'flex gap-3 rounded-2xl border bg-surface-2 p-4',
                row.status === 'submitted' ? 'border-accent/40' : 'border-line',
              )}
            >
              <span
                aria-hidden="true"
                className={cn('grid size-11 shrink-0 place-items-center rounded-xl', WASH[STATUS_WASH[row.status]])}
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
                          WASH[STATUS_WASH[row.status]],
                        )}
                      >
                        {c.homework.status[row.status]}
                      </span>
                      {row.attempt > 1 ? (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
                          {formatCopy(c.homework.attempt, { n: row.attempt })}
                        </span>
                      ) : null}
                    </div>
                    <h4 className="mt-1.5 font-semibold text-fg">{row.lessonTitle}</h4>
                    <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{row.courseTitle}</p>
                    <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-faint tabular-nums">
                      {formatCairoShort(row.submittedAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-xl px-3 py-1.5 text-[length:var(--fs-text-base)] font-bold tabular-nums',
                      row.grade === null ? WASH.neutral : WASH.ok,
                    )}
                  >
                    {row.grade === null
                      ? c.homework.noGrade
                      : formatCopy(c.homework.gradeOf, { grade: Number(row.grade.toFixed(2)) })}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {canReview ? <HomeworkReviewInline row={row} /> : null}
                  <Link
                    href={`/admin/homework/${row.id}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[length:var(--fs-text-sm)] font-medium text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/50 hover:text-fg"
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                    {c.homework.open}
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {list.rowCount > rows.length ? (
        <p className="text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {formatCopy(c.homework.capped, { n: rows.length })}
        </p>
      ) : null}
    </div>
  );
}

function Count({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Clock3;
  tone: keyof typeof WASH;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3">
      <span aria-hidden="true" className={cn('grid size-9 shrink-0 place-items-center rounded-xl', WASH[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--fs-title-4)] font-bold leading-tight text-fg tabular-nums">{value}</p>
        <p className="truncate text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
      </div>
    </div>
  );
}
