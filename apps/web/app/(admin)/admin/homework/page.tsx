import Link from 'next/link';
import { CheckCircle2, Clock3, Images, RotateCcw } from 'lucide-react';
// `/copy/admin`, never the root barrel: these screens only ever render
// inside the admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import {
  AdminHomeworkRowSchema,
  HOMEWORK_FILTERS,
  HomeworkFilterSchema,
  type AdminHomeworkRow,
  type HomeworkFilter,
} from '@ayman/contracts/homework';
import { listResponse } from '@ayman/contracts/admin/list';
import { z } from '@ayman/contracts/zod';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { CreateHomeworkDialog } from './create-homework-dialog';

const c = copy.admin.homework;
const RowsSchema = listResponse(AdminHomeworkRowSchema);

/** Only what the course picker renders. A narrow schema on purpose: this list
 *  feeds a `<select>`, and parsing the admin list's full shape here would make
 *  an unrelated field's change break the الواجبات screen. */
const CoursePickSchema = z.array(z.object({ id: z.uuid(), title: z.string() }));

export const metadata = { title: c.queueTitle };

const FILTER_LABELS: Record<HomeworkFilter, string> = {
  pending: c.filterPending,
  accepted: c.filterAccepted,
  needs_work: c.filterNeedsWork,
  all: c.filterAll,
};

/**
 * Western digits and a fixed order, same rule every date on this platform
 * follows — `formatDuration` owns the argument, and this is its `Intl` twin
 * for a calendar date the instructor scans down a column.
 */
const submittedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * `/admin/homework` — «أشوف الواجبات ومين اللي بعت».
 *
 * ## The default filter is «مستني مراجعة», not «الكل»
 *
 * The screen exists to surface work that is waiting on him, and the sidebar
 * badge counts exactly this list — so the number and the screen cannot
 * disagree. Same decision `/admin/inbox` records for «غير مقروءة».
 *
 * ## Rows link to ONE submission, not to a modal
 *
 * A payment is decided from a queue of otherwise-identical rows and could be
 * approved inline. A homework answer cannot: the thing to decide is a set of
 * photographs that has to be looked at, at a size, against the question that
 * was asked. That is a page.
 *
 * `adminGet` (uncached), like every other admin list — a cached admin read is
 * indistinguishable from a lost write, and here a student is waiting on the
 * other end.
 */
export default async function AdminHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  // Through the schema, never `as HomeworkFilter`: this lands in a query
  // string the API re-validates, and junk should read as the default rather
  // than as an error page.
  const filter = HomeworkFilterSchema.parse(raw ?? undefined);

  /*
   * Both in parallel — the course list feeds the «أضف واجب» picker and has
   * nothing to do with the queue, so making the queue wait on it would slow
   * the screen down for the reader who never opens the dialog.
   */
  const [{ rows, rowCount }, courses] = await Promise.all([
    adminGet(`/api/admin/homework?filter=${filter}`, RowsSchema),
    adminGet('/api/admin/courses', CoursePickSchema),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.queueTitle}</h1>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.queueLead}</p>
        </div>
        {/* The queue answers "what is waiting on me"; this is the one thing he
            could not do from here at all. */}
        <CreateHomeworkDialog courses={courses} />
      </div>

      {/* Real tabs, not a `<select>`: four options, and which one is active is
          the most useful thing this header can say at a glance. */}
      <nav className="mt-4 flex flex-wrap gap-1.5">
        {HOMEWORK_FILTERS.map((option) => (
          <Link
            key={option}
            href={`/admin/homework?filter=${option}`}
            aria-current={option === filter ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
              'transition-colors duration-[160ms] ease-out',
              option === filter
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {FILTER_LABELS[option]}
          </Link>
        ))}
      </nav>

      {rowCount === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.emptyHint}
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => (
            <li key={row.id}>
              <HomeworkRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function HomeworkRow({ row }: { row: AdminHomeworkRow }) {
  const Icon = STATUS_ICON[row.status];

  return (
    /*
      A STRETCHED LINK, not a `<Link>` wrapped round the card — the same shape
      `/admin/inbox` uses and for the same reason: the whole row opens the
      submission, and the student's NAME inside it is its own link into their
      record («أقدر أدخل على البروفايل بتاعه»). An `<a>` inside an `<a>` is
      invalid HTML that browsers resolve by dropping one of them, so the card
      is a plain container and the review link claims the area with
      `after:absolute after:inset-0`.
    */
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-xl border bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-accent/50',
        'focus-within:border-accent/50',
        row.status === 'submitted' ? 'border-accent/40' : 'border-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('grid size-10 shrink-0 place-items-center rounded-lg', STATUS_TONE[row.status])}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/students/${row.studentId}`}
            className="relative z-10 text-[length:var(--fs-text-base)] font-semibold text-fg underline-offset-2 hover:underline"
          >
            {row.studentName}
          </Link>
          {row.attempt > 1 ? (
            <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
              {c.attempt} {row.attempt}
            </span>
          ) : null}
        </div>

        <p className="mt-0.5 truncate text-[length:var(--fs-text-sm)] text-fg">
          {row.lessonTitle}
        </p>
        <p className="truncate text-[length:var(--fs-text-xs)] text-fg-muted">{row.courseTitle}</p>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Images className="size-3.5" aria-hidden="true" />
            {row.imageCount} {c.imageUnit}
          </span>
          <span className="tabular-nums">
            {submittedAtFormatter.format(new Date(row.submittedAt))}
          </span>
          {row.grade !== null ? (
            <span className="font-semibold text-[color:var(--ok)] tabular-nums">
              {row.grade} / 100
            </span>
          ) : null}
        </p>
      </div>

      <Link
        href={`/admin/homework/${row.id}`}
        className="chip chip--solid shrink-0 after:absolute after:inset-0 after:content-['']"
      >
        {STATUS_LABEL[row.status]}
      </Link>
    </div>
  );
}

const STATUS_ICON = {
  submitted: Clock3,
  accepted: CheckCircle2,
  needs_work: RotateCcw,
} as const;

const STATUS_LABEL = {
  submitted: c.pending,
  accepted: c.reviewedAccepted,
  needs_work: c.reviewedNeedsWork,
} as const;

const STATUS_TONE = {
  submitted: 'bg-accent/15 text-accent-text',
  accepted: 'bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]',
  needs_work: 'bg-[color-mix(in_oklch,var(--warn),transparent_86%)] text-[color:var(--warn)]',
} as const;
