import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  EyeOff,
  Images,
  Keyboard,
  Lightbulb,
  PenLine,
  Users,
} from 'lucide-react';
import { dailyEssayCopy } from '@ayman/contracts/copy/daily-essay';
import {
  AdminEssayScheduleSchema,
  AdminEssaySubmissionRowSchema,
  ESSAY_QUEUE_FILTERS,
  ESSAY_SCHEDULE_FILTERS,
  EssayPendingCountSchema,
  type AdminEssay,
  type AdminEssaySubmissionRow,
  type EssayQueueFilter,
  type EssayScheduleFilter,
} from '@ayman/contracts/daily-essay';
import { listResponse } from '@ayman/contracts/admin/list';
import { formatCopy } from '@ayman/contracts/format';
import { z } from '@ayman/contracts/zod';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { EssayBatchDialog } from './essay-batch-dialog';
import { essayDayLabel } from './essay-day';
import { EssayRowActions } from './essay-row-actions';

const c = dailyEssayCopy.admin;

export const metadata = { title: c.title };

const QueueSchema = listResponse(AdminEssaySubmissionRowSchema);
const CoursePickSchema = z.array(z.object({ id: z.uuid(), title: z.string() }));

/** One of `ListQuerySchema`'s own page sizes — anything else is a 400 for the whole screen. */
const PER_PAGE = 50;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const submittedAtFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type Tab = 'marking' | 'schedule';

function pick<T extends string>(options: readonly T[], value: string | undefined, fallback: T): T {
  return value && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function href(tab: Tab, params: Record<string, string | number | undefined> = {}): string {
  const query = new URLSearchParams({ tab });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return `/admin/essays?${query.toString()}`;
}

/**
 * «الأسئلة المقالية اليومية» — the two halves of the job on one screen:
 * «التصحيح» (what students handed in) and «جدول الأسئلة» (what they will be
 * asked).
 *
 * Marking is the default tab because it is the daily one: the schedule is
 * written once a week or once a month, the queue is opened every evening.
 *
 * Gated like `/admin/homework`: a section that is switched off on this stack
 * answers as a page that does not exist, here as well as in the sidebar.
 */
export default async function AdminEssaysPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; filter?: string; essayId?: string; page?: string }>;
}) {
  if (!(await getEntitlements()).dailyEssay) notFound();

  const params = await searchParams;
  const tab = pick<Tab>(['marking', 'schedule'], params.tab, 'marking');
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const { pending } = await adminGet('/api/admin/daily-essays/submissions/pending-count', EssayPendingCountSchema);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-[length:var(--fs-title-2)] font-semibold text-fg">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent-text">
              <PenLine className="size-5" />
            </span>
            {c.title}
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>
        </div>
      </header>

      <nav className="mt-5 flex flex-wrap gap-1.5 border-b border-line pb-3">
        <TabLink href={href('marking')} active={tab === 'marking'} label={c.tabs.marking} count={pending} />
        <TabLink href={href('schedule')} active={tab === 'schedule'} label={c.tabs.schedule} />
      </nav>

      {tab === 'marking' ? (
        <MarkingTab
          filter={pick(ESSAY_QUEUE_FILTERS, params.filter, 'pending')}
          essayId={params.essayId && UUID_RE.test(params.essayId) ? params.essayId : undefined}
          page={page}
          pending={pending}
        />
      ) : (
        <ScheduleTab filter={pick(ESSAY_SCHEDULE_FILTERS, params.filter, 'upcoming')} page={page} />
      )}
    </>
  );
}

function TabLink({ href: to, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <Link
      href={to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[length:var(--fs-text-base)] font-semibold',
        'transition-colors duration-[160ms] ease-out',
        active ? 'border-accent bg-accent text-[#1A1206]' : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
      )}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] tabular-nums',
            active ? 'bg-[#1A1206]/15' : 'bg-accent/15 text-accent-text',
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function FilterPills<T extends string>({
  options,
  current,
  labels,
  to,
}: {
  options: readonly T[];
  current: T;
  labels: Record<T, string>;
  to: (option: T) => string;
}) {
  return (
    <nav className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <Link
          key={option}
          href={to(option)}
          aria-current={option === current ? 'page' : undefined}
          className={cn(
            'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
            option === current
              ? 'border-accent bg-accent/15 font-semibold text-fg'
              : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
          )}
        >
          {labels[option]}
        </Link>
      ))}
    </nav>
  );
}

function Pager({
  page,
  rowCount,
  to,
}: {
  page: number;
  rowCount: number;
  to: (page: number) => string;
}) {
  if (rowCount <= PER_PAGE) return null;
  const from = (page - 1) * PER_PAGE + 1;
  const until = Math.min(rowCount, page * PER_PAGE);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-[length:var(--fs-text-sm)]">
      {page > 1 ? (
        <Link href={to(page - 1)} className="chip chip--quiet">
          {c.queue.pagePrev}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-fg-muted tabular-nums">{formatCopy(c.queue.pageOf, { from, to: until, total: rowCount })}</span>
      {until < rowCount ? (
        <Link href={to(page + 1)} className="chip chip--quiet">
          {c.queue.pageNext}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-line bg-surface-2 px-5 py-10 text-center">
      <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">{title}</p>
      {hint ? <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{hint}</p> : null}
    </div>
  );
}

/* ── «التصحيح» ─────────────────────────────────────────────────────────── */

async function MarkingTab({
  filter,
  essayId,
  page,
  pending,
}: {
  filter: EssayQueueFilter;
  essayId: string | undefined;
  page: number;
  pending: number;
}) {
  const query = new URLSearchParams({ filter, perPage: String(PER_PAGE), page: String(page) });
  if (essayId) query.set('essayId', essayId);
  const { rows, rowCount } = await adminGet(`/api/admin/daily-essays/submissions?${query.toString()}`, QueueSchema);
  // The first waiting row is where «بدء التصحيح» goes; the marking screen
  // itself then walks from answer to answer.
  const first = filter === 'pending' ? rows[0] : undefined;

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          options={ESSAY_QUEUE_FILTERS}
          current={filter}
          labels={c.queue.filters}
          to={(option) => href('marking', { filter: option, essayId })}
        />
        {first ? (
          <Link href={`/admin/essays/${first.id}`} className="chip chip--solid">
            <PenLine className="size-4" aria-hidden="true" />
            {formatCopy(c.queue.start, { n: essayId ? rowCount : pending })}
          </Link>
        ) : null}
      </div>

      {essayId ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
          {rows[0] ? formatCopy(c.queue.onlyEssay, { day: essayDayLabel(rows[0].essayDay) }) : null}
          <Link href={href('marking', { filter })} className="chip chip--quiet">
            {c.queue.allEssays}
          </Link>
        </p>
      ) : null}

      {rowCount === 0 ? (
        <Empty title={filter === 'pending' ? c.queue.emptyPending : c.queue.empty} />
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-2.5">
            {rows.map((row) => (
              <li key={row.id}>
                <SubmissionRow row={row} />
              </li>
            ))}
          </ul>
          <Pager page={page} rowCount={rowCount} to={(n) => href('marking', { filter, essayId, page: n })} />
        </>
      )}
    </>
  );
}

function SubmissionRow({ row }: { row: AdminEssaySubmissionRow }) {
  const waiting = row.status === 'submitted';
  const Icon = waiting ? Clock3 : CheckCircle2;

  return (
    /*
      A STRETCHED LINK, not a `<Link>` wrapped round the card: the whole row
      opens the answer, and the student's NAME inside it is its own link into
      their record. An `<a>` inside an `<a>` is invalid HTML.
    */
    <div
      className={cn(
        'relative flex flex-wrap items-center gap-3 rounded-xl border bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-accent/50 focus-within:border-accent/50',
        waiting ? 'border-accent/40' : 'border-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-lg',
          waiting
            ? 'bg-accent/15 text-accent-text'
            : 'bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]',
        )}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[length:var(--fs-text-base)] font-semibold text-fg">
          <Link href={`/admin/students/${row.studentId}`} className="relative z-10 hover:text-accent-text">
            {row.studentName}
          </Link>
        </p>
        <p className="mt-0.5 line-clamp-1 text-[length:var(--fs-text-sm)] text-fg-muted">{row.essayExcerpt}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted tabular-nums">
          <span>{formatCopy(c.queue.essayDay, { day: essayDayLabel(row.essayDay) })}</span>
          <span>{submittedAtFormatter.format(new Date(row.submittedAt))}</span>
          <span className="inline-flex items-center gap-1">
            {row.typed ? (
              <>
                <Keyboard className="size-3.5" aria-hidden="true" />
                {c.queue.typed}
              </>
            ) : (
              <>
                <Images className="size-3.5" aria-hidden="true" />
                {row.imageCount} {c.queue.imageUnit}
              </>
            )}
          </span>
          {row.markerName ? <span>{formatCopy(c.queue.markedBy, { name: row.markerName })}</span> : null}
        </p>
      </div>

      {row.mark !== null ? (
        <span className="rounded-full bg-[color-mix(in_oklch,var(--ok),transparent_86%)] px-3 py-1 font-mono text-[length:var(--fs-text-base)] font-bold text-[color:var(--ok)] tabular-nums">
          <bdi dir="ltr">
            {row.mark} / {row.maxMarks}
          </bdi>
        </span>
      ) : null}

      <Link
        href={`/admin/essays/${row.id}`}
        className={cn(
          "chip shrink-0 justify-center after:absolute after:inset-0 after:content-[''] max-sm:w-full",
          waiting ? 'chip--solid' : 'chip--quiet',
        )}
      >
        {waiting ? c.queue.mark : c.queue.view}
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

/* ── «جدول الأسئلة» ────────────────────────────────────────────────────── */

async function ScheduleTab({ filter, page }: { filter: EssayScheduleFilter; page: number }) {
  const [schedule, courses] = await Promise.all([
    adminGet(`/api/admin/daily-essays?filter=${filter}&perPage=${PER_PAGE}&page=${page}`, AdminEssayScheduleSchema),
    adminGet('/api/admin/courses', CoursePickSchema),
  ]);

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          options={ESSAY_SCHEDULE_FILTERS}
          current={filter}
          labels={c.schedule.filters}
          to={(option) => href('schedule', { filter: option })}
        />
        <EssayBatchDialog courses={courses} nextFreeDay={schedule.nextFreeDay} today={schedule.today} />
      </div>

      {schedule.rowCount === 0 ? (
        <Empty title={c.schedule.empty} hint={c.schedule.emptyHint} />
      ) : (
        <>
          <ul className="mt-4 flex flex-col gap-3">
            {schedule.rows.map((essay) => (
              <li key={essay.id}>
                <EssayRow essay={essay} today={schedule.today} courses={courses} />
              </li>
            ))}
          </ul>
          <Pager page={page} rowCount={schedule.rowCount} to={(n) => href('schedule', { filter, page: n })} />
        </>
      )}
    </>
  );
}

function EssayRow({
  essay,
  today,
  courses,
}: {
  essay: AdminEssay;
  today: string;
  courses: z.infer<typeof CoursePickSchema>;
}) {
  const isToday = essay.day === today;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border bg-surface-2',
        isToday ? 'border-accent' : 'border-line',
        !essay.isPublished && 'opacity-75',
      )}
    >
      {/* The coloured band: the DAY is what a schedule is read by, so it is
          the row's head and not a cell inside it. */}
      <header
        className={cn(
          'flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5',
          isToday ? 'bg-accent/15' : 'bg-surface-3',
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
        <h2 className="text-[length:var(--fs-text-base)] font-semibold text-fg">{essayDayLabel(essay.day)}</h2>
        {isToday ? (
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-semibold text-[#1A1206]">
            {c.schedule.today}
          </span>
        ) : null}
        {!essay.isPublished ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-1 px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
            <EyeOff className="size-3.5" aria-hidden="true" />
            {c.schedule.hidden}
          </span>
        ) : null}
        <span className="ms-auto rounded-full bg-surface-1 px-2.5 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-fg-muted tabular-nums">
          {formatCopy(c.schedule.marks, { n: essay.maxMarks })}
        </span>
      </header>

      <div className="p-4">
        <p className="whitespace-pre-line text-[length:var(--fs-text-base)] leading-relaxed text-fg">{essay.body}</p>

        <details className="mt-3 rounded-lg border border-line bg-surface-3 px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-[length:var(--fs-text-sm)] font-semibold text-[color:var(--ok)]">
            <Lightbulb className="size-4" aria-hidden="true" />
            {c.schedule.model}
          </summary>
          <p className="mt-2 whitespace-pre-line text-[length:var(--fs-text-sm)] leading-relaxed text-fg">
            {essay.modelAnswer}
          </p>
        </details>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)]">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-fg-muted">
            <Users className="size-3.5" aria-hidden="true" />
            {essay.courses.length === 0 ? c.schedule.everyone : essay.courses.map((course) => course.title).join(' · ')}
          </span>
          {essay.submitted > 0 ? (
            <span className="rounded-full bg-surface-3 px-2.5 py-1 text-fg-muted tabular-nums">
              {formatCopy(c.schedule.answers, { n: essay.submitted })}
            </span>
          ) : null}
          {essay.pending > 0 ? (
            <span className="rounded-full bg-accent/15 px-2.5 py-1 font-semibold text-accent-text tabular-nums">
              {formatCopy(c.schedule.pending, { n: essay.pending })}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <EssayRowActions essay={essay} courses={courses} />
          {essay.submitted > 0 ? (
            <Link
              href={href('marking', { filter: essay.pending > 0 ? 'pending' : 'all', essayId: essay.id })}
              className={cn('chip ms-auto', essay.pending > 0 ? 'chip--solid' : 'chip--quiet')}
            >
              {c.schedule.openAnswers}
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}
