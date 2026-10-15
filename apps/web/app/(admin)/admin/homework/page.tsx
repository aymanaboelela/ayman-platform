import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEntitlements } from '@/lib/entitlements';
import { ArrowRight, CheckCircle2, ChevronLeft, Clock3, Images, RotateCcw } from 'lucide-react';
// `/copy/admin`, never the root barrel: these screens only ever render
// inside the admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  AdminHomeworkLessonSummarySchema,
  AdminHomeworkRowSchema,
  HOMEWORK_FILTERS,
  HomeworkFilterSchema,
  type AdminHomeworkLessonSummary,
  type AdminHomeworkRow,
  type HomeworkFilter,
} from '@ayman/contracts/homework';
import { listResponse } from '@ayman/contracts/admin/list';
import { z } from '@ayman/contracts/zod';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { CreateHomeworkDialog } from './create-homework-dialog';
import { groupHomeworkLessons } from './groups';
import { homeworkListHref } from './nav';

const c = copy.admin.homework;
const RowsSchema = listResponse(AdminHomeworkRowSchema);
const LessonsSchema = z.array(AdminHomeworkLessonSummarySchema);

/** Only what the course picker renders. A narrow schema on purpose: this list
 *  feeds a `<select>`, and parsing the admin list's full shape here would make
 *  an unrelated field's change break the الواجبات screen. */
const CoursePickSchema = z.array(z.object({ id: z.uuid(), title: z.string() }));

/** One of `ListQuerySchema`'s sizes. Fifty because a lecture's whole class
 *  should fit on one screen; anything past it pages instead of vanishing. */
const PER_PAGE = 50;

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/admin/homework` — «أشوف الواجبات ومين اللي بعت».
 *
 * ## Two levels, because one flat stream read as a mess
 *
 * «الدنيا ملخبطة مش متقسّمة… الدرس إيه واجباته إيه» (2026-10-12). Every
 * student on every lecture used to arrive in one list, newest first, so a
 * lecture's hand-ins were scattered between everyone else's. Now the screen
 * opens on the courses, each split into its sections and lectures in the
 * course's own order, with every lecture's counts on its line; a lecture opens
 * its own list, with the status tabs.
 *
 * The flat list also asked for no page size, so the API answered with its
 * default twenty and nothing said there were more. The lecture list pages.
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
  /*
   * القسم ده مش موجود على ستاك الفيتشر دي مقفولة فيه — والصف بتاعه في
   * `ADMIN_NAV` مش بيترسم أصلًا. ده الباب لو حد كتب الـURL بإيده.
   *
   * `notFound()` مش ٤٠٣: الصفحة مش «ممنوعة»، هي مش هنا. ونفس الشكل بالحرف
   * اللي `(admin)/layout.tsx` بيستخدمه، وبيشرح ليه فوقه.
   */
  if (!(await getEntitlements()).homework) notFound();

  const params = await searchParams;
  const lessonId = first(params.lessonId);

  if (lessonId && UUID_RE.test(lessonId)) {
    // Through the schema, never `as HomeworkFilter`: this lands in a query
    // string the API re-validates, and junk should read as the default rather
    // than as an error page.
    const filter = HomeworkFilterSchema.parse(first(params.filter) ?? undefined);
    const page = Math.max(1, Number.parseInt(first(params.page) ?? '1', 10) || 1);
    return <LessonView lessonId={lessonId} filter={filter} page={page} />;
  }

  /*
   * Both in parallel — the course list feeds the «أضف واجب» picker and has
   * nothing to do with the queue, so making the queue wait on it would slow
   * the screen down for the reader who never opens the dialog.
   */
  const [lines, courses] = await Promise.all([
    adminGet('/api/admin/homework/lessons', LessonsSchema),
    adminGet('/api/admin/courses', CoursePickSchema),
  ]);
  const groups = groupHomeworkLessons(lines);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.queueTitle}</h1>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.overviewLead}</p>
        </div>
        {/* The queue answers "what is waiting on me"; this is the one thing he
            could not do from here at all. */}
        <CreateHomeworkDialog courses={courses} />
      </div>

      {groups.length === 0 ? (
        <AdminEmpty spot="homework" title={c.empty} hint={c.emptyHint} />
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {groups.map((course) => (
            <section key={course.courseId} aria-labelledby={`hw-course-${course.courseId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                <h2
                  id={`hw-course-${course.courseId}`}
                  className="text-[length:var(--fs-title-3)] font-semibold text-fg"
                >
                  {course.courseTitle}
                </h2>
                {course.pending > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-[length:var(--fs-text-sm)] font-medium text-accent-text tabular-nums">
                    <Clock3 className="size-4" aria-hidden="true" />
                    {formatCopy(c.coursePending, { n: course.pending })}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--ok),transparent_86%)] px-3 py-1 text-[length:var(--fs-text-sm)] font-medium text-[color:var(--ok)]">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    {c.courseAllDone}
                  </span>
                )}
              </div>

              {course.sections.map((section, index) => (
                <div key={`${section.title}-${index}`} className="mt-4">
                  <h3 className="mb-2 text-[length:var(--fs-text-xs)] font-semibold tracking-wide text-fg-muted">
                    {section.title}
                  </h3>
                  <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                    {section.lessons.map((lesson) => (
                      <li key={lesson.lessonId}>
                        <LessonLine lesson={lesson} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** One lecture on the overview: its name, its counts, and the way in. */
function LessonLine({ lesson }: { lesson: AdminHomeworkLessonSummary }) {
  const waiting = lesson.pending > 0;
  const Icon = waiting ? Clock3 : CheckCircle2;
  return (
    <div
      className={cn(
        // `flex-wrap`: on a phone the button drops under the text at full width
        // instead of squeezing the lecture's name to «تطور تكنولوجيا المعا…».
        'relative flex h-full flex-wrap items-center gap-3 rounded-xl border bg-surface-2 p-4',
        'transition-colors duration-[160ms] ease-out hover:border-accent/50 focus-within:border-accent/50',
        waiting ? 'border-accent/40' : 'border-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-lg',
          waiting ? STATUS_TONE.submitted : STATUS_TONE.accepted,
        )}
      >
        <Icon className="size-5" />
      </span>

      <div className="min-w-0 flex-1 basis-48">
        <p className="line-clamp-2 text-[length:var(--fs-text-base)] font-semibold text-fg">{lesson.lessonTitle}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)] tabular-nums">
          <CountChip tone="submitted" label={c.countPending} n={lesson.pending} strong />
          <CountChip tone="accepted" label={c.countAccepted} n={lesson.accepted} />
          <CountChip tone="needs_work" label={c.countNeedsWork} n={lesson.needsWork} />
          <span className="whitespace-nowrap text-fg-muted">
            {c.lastSubmission} {submittedAtFormatter.format(new Date(lesson.lastSubmittedAt))}
          </span>
        </div>
      </div>

      {/* Stretched link — the whole card opens the lecture, same shape the
          submission rows use below. Opens on «مستني» when anything is. */}
      <Link
        href={homeworkListHref(lesson.lessonId, waiting ? 'pending' : 'all')}
        className={cn(
          'chip shrink-0 justify-center after:absolute after:inset-0 after:content-[\'\'] max-sm:w-full',
          waiting ? 'chip--solid' : 'chip--quiet',
        )}
      >
        {c.openSubmissions}
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

function CountChip({
  tone,
  label,
  n,
  strong = false,
}: {
  tone: keyof typeof STATUS_TONE;
  label: string;
  n: number;
  strong?: boolean;
}) {
  // A zero is noise on every chip but «مستني» — that one says «nothing waiting».
  if (n === 0 && !strong) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
        n === 0 ? 'bg-surface-3 text-fg-muted' : STATUS_TONE[tone],
      )}
    >
      {label} {n}
    </span>
  );
}

/** One lecture's hand-ins, on a status tab, paged. */
async function LessonView({ lessonId, filter, page }: { lessonId: string; filter: HomeworkFilter; page: number }) {
  const [lines, list] = await Promise.all([
    adminGet('/api/admin/homework/lessons', LessonsSchema),
    adminGet(
      `/api/admin/homework?lessonId=${lessonId}&filter=${filter}&perPage=${PER_PAGE}&page=${page}`,
      RowsSchema,
    ),
  ]);
  // The lecture's name and counts come from the overview's own read, so a tab
  // with nothing in it still says which lecture this is.
  const lesson = lines.find((line) => line.lessonId === lessonId);
  if (!lesson) notFound();

  const counts: Record<HomeworkFilter, number> = {
    pending: lesson.pending,
    accepted: lesson.accepted,
    needs_work: lesson.needsWork,
    all: lesson.pending + lesson.accepted + lesson.needsWork,
  };
  const { rows, rowCount } = list;
  const from = rowCount === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const to = Math.min(rowCount, page * PER_PAGE);
  const pageHref = (n: number) => `${homeworkListHref(lessonId, filter)}&page=${n}`;

  return (
    <>
      <p className="mb-4">
        <Link
          href="/admin/homework"
          className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          {c.backToLessons}
        </Link>
      </p>

      <header className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {lesson.courseTitle} · {lesson.sectionTitle}
        </p>
        <h1 className="mt-0.5 text-[length:var(--fs-title-2)] font-semibold text-fg">{lesson.lessonTitle}</h1>
      </header>

      {/* Real tabs, not a `<select>`, each with its count: which one has
          anything in it is the most useful thing this header can say. */}
      <nav className="mt-4 flex flex-wrap gap-1.5">
        {HOMEWORK_FILTERS.map((option) => (
          <Link
            key={option}
            href={homeworkListHref(lessonId, option)}
            aria-current={option === filter ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
              'transition-colors duration-[160ms] ease-out',
              option === filter
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {FILTER_LABELS[option]}
            <span className="tabular-nums opacity-80">{counts[option]}</span>
          </Link>
        ))}
      </nav>

      {rowCount === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line bg-surface-2 px-5 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.lessonEmpty}
        </p>
      ) : (
        <>
          <ul className="mt-5 flex flex-col gap-2.5">
            {rows.map((row) => (
              <li key={row.id}>
                <HomeworkRow row={row} filter={filter} lessonId={lessonId} />
              </li>
            ))}
          </ul>

          {rowCount > PER_PAGE ? (
            <nav className="mt-4 flex items-center justify-between gap-3 text-[length:var(--fs-text-sm)]">
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="chip chip--quiet">
                  {c.pagePrev}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-fg-muted tabular-nums">
                {formatCopy(c.pageOf, { from, to, total: rowCount })}
              </span>
              {to < rowCount ? (
                <Link href={pageHref(page + 1)} className="chip chip--quiet">
                  {c.pageNext}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

function HomeworkRow({ row, filter, lessonId }: { row: AdminHomeworkRow; filter: HomeworkFilter; lessonId: string }) {
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
        'relative flex items-center gap-3 rounded-xl border bg-surface-2 p-4',
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

        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Images className="size-3.5" aria-hidden="true" />
            {row.imageCount} {c.imageUnit}
          </span>
          <span className="whitespace-nowrap tabular-nums">{submittedAtFormatter.format(new Date(row.submittedAt))}</span>
          {row.grade !== null ? (
            <span className="font-semibold text-[color:var(--ok)] tabular-nums">{row.grade} / 100</span>
          ) : null}
        </p>
      </div>

      <Link
        href={`/admin/homework/${row.id}?filter=${filter}&lessonId=${lessonId}`}
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
