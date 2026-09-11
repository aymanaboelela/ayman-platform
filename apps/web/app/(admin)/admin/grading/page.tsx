import Link from 'next/link';
// `/copy/admin`, never the root barrel: these screens only ever render inside
// the admin layout, and `copy.admin.*` lives in that module.
import { copy } from '@ayman/contracts/copy/admin';
import {
  AdminGradingQueueSchema,
  AdminGradingResultsSchema,
  GRADING_SORTS,
  GradingSortSchema,
  type GradingSort,
} from '@ayman/contracts/admin/exams';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { GradingQueueRow } from '@/components/admin/grading/queue-row';
import { ResultRow } from '@/components/admin/grading/result-row';

const c = copy.admin.grading;

export const metadata = { title: c.title };

const TABS = ['queue', 'marked', 'top'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  queue: c.tabQueue,
  marked: c.tabMarked,
  top: c.tabTop,
};

const SORT_LABEL: Record<GradingSort, string> = {
  score: c.sortScore,
  fastest: c.sortFastest,
  latest: c.sortLatest,
  earliest: c.sortEarliest,
  name: c.sortName,
};

/**
 * «تصحيح الورق» — three sections, not one queue.
 *
 * ## What was missing
 *
 * The screen answered exactly one question: who is waiting. Marking the last
 * answer on a paper took it off the list and put it NOWHERE — «طيب أنا صححت
 * له، تروح التصحيح بتاعته لمكان تاني للناس اللي تصحح لهم ودرجات كل الناس». So
 * a mark could not be checked, revised, or compared against the rest of the
 * cohort; it existed only inside that one student's account.
 *
 *   `queue`  — «محتاج تصحيح». Oldest first, and it is read to be emptied.
 *   `marked` — «اتصحّح خلاص». Papers a HUMAN marked (`graded_by` is null on
 *              everything the engine scored), so it is a record of his own
 *              work, and every row opens back into the marking screen because
 *              revising a mark is the thing it is for.
 *   `top`    — «الأوائل». Every finished sitting, ranked on PERCENT so two
 *              papers marked out of different totals compare correctly.
 *
 * ## Tabs, not three stacked lists
 *
 * All three are long and all three are lists of people, so stacking them puts
 * «الأوائل» below a fold that moves every time a paper is submitted. A tab is
 * also the only one of the two that survives a phone: three sections of forty
 * rows each on a 360px screen is one scroll with no landmarks in it.
 *
 * Server-rendered links, the same shape `InboxTabs` and `FinanceTabs` use — no
 * `usePathname`, no client runtime for a highlight, and every view is a URL he
 * can bookmark or send to himself.
 *
 * ## Why the queue is fetched on every tab
 *
 * So the tab itself can carry the waiting count. «أضغط عليها أشوف مين الناس
 * اللي موجودة» starts with knowing there is something to press, and a badge on
 * the tab is that, from anywhere on the screen. It is one `groupBy` plus one
 * indexed `findMany` over papers nobody has marked yet — a set that is empty
 * most of the time and small the rest of it.
 *
 * `adminGet` (uncached) like every other admin list — a cached admin read is
 * indistinguishable from a lost write, and here a student is on the other end
 * of it holding a wrong mark.
 */
export default async function AdminGradingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string; exam?: string }>;
}) {
  const query = await searchParams;

  /*
   * Every parameter is validated into a known value rather than passed
   * through. `sort` reaches an ORDER BY at the far end (through the API's own
   * enum, which is the actual guard) and `tab` picks a branch here; a URL
   * someone edits by hand should land on the default view, not a blank one.
   */
  const tab: Tab = TABS.includes(query.tab as Tab) ? (query.tab as Tab) : 'queue';
  const sort: GradingSort = GradingSortSchema.safeParse(query.sort).data ?? 'score';
  // An empty `?exam=` is what the «كل الامتحانات» option submits, and it means
  // "no filter" — never a lesson id of the empty string.
  const exam = query.exam && query.exam.length > 0 ? query.exam : undefined;

  const { rows: queue } = await adminGet('/api/admin/grading-queue', AdminGradingQueueSchema);

  /*
   * «اتصحّح خلاص» is a record of what HE did, so its natural order is the most
   * recent first — ranking his own marking by score answers a question nobody
   * asked. An explicit `?sort=` still wins, which is why this branches on the
   * raw parameter being absent rather than on the parsed default.
   */
  const activeSort: GradingSort = tab === 'marked' && query.sort === undefined ? 'latest' : sort;

  // `URLSearchParams` rather than string concatenation: the exam filter is a
  // value from the database going into a query string, and it is the one part
  // of this URL that is not a literal.
  const params = new URLSearchParams({
    scope: tab === 'marked' ? 'marked' : 'all',
    sort: activeSort,
  });
  if (exam) params.set('lessonId', exam);

  /*
   * Issued ONLY for the tab that renders it. It is the expensive half of this
   * screen — a raw ranking query over every finished sitting — and paying for
   * it while looking at the queue would make the cheap, frequently-opened view
   * as slow as the rare one.
   */
  const results =
    tab === 'queue'
      ? null
      : await adminGet(`/api/admin/grading-results?${params}`, AdminGradingResultsSchema);

  return (
    <>
      <div>
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1 max-w-[44rem] text-[length:var(--fs-text-sm)] text-fg-muted">
          {tab === 'queue' ? c.lead : tab === 'marked' ? c.leadMarked : c.leadTop}
        </p>
      </div>

      <nav className="mt-4 flex flex-wrap gap-1.5" aria-label={c.title}>
        {TABS.map((value) => (
          <Link
            key={value}
            href={value === 'queue' ? '/admin/grading' : `/admin/grading?tab=${value}`}
            aria-current={value === tab ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-4 py-1.5',
              'text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms] ease-out',
              value === tab
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {TAB_LABEL[value]}
            {/* The count rides on «محتاج تصحيح» only. On the other two it would
                be a number with no decision attached to it. */}
            {value === 'queue' && queue.length > 0 ? (
              <span
                className={cn(
                  'mono rounded-full px-1.5 text-[length:var(--fs-text-xs)] tabular-nums',
                  value === tab ? 'bg-[#1A1206]/15' : 'bg-accent/15 text-accent-text',
                )}
              >
                {queue.length}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === 'queue' ? (
        queue.length === 0 ? (
          /* An empty queue is the GOOD state here, not a missing-data state — no
             «اعمل واحد» prompt, because there is nothing for him to create. */
          <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
            <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          </div>
        ) : (
          /* `<ol>` rather than `<ul>`: `ManualGradingService.queue` orders
             oldest-first and the position IS information — a paper waiting
             three days is more urgent than one that landed a minute ago. There
             is no sort control on this tab for the same reason. */
          <ol className="mt-5 flex flex-col gap-2.5">
            {queue.map((row) => (
              <li key={row.attemptId}>
                <GradingQueueRow row={row} />
              </li>
            ))}
          </ol>
        )
      ) : (
        <>
          {/*
            A plain GET form, so the filters are the URL and nothing here ships
            a byte of JavaScript. `method` defaults to GET; the hidden `tab`
            keeps the submission on the section it was made from.

            `flex-wrap` with a `min-w` on each control rather than a grid: on a
            phone the two selects stack full width and the button follows them,
            and on a desktop all three sit on one line — without a breakpoint
            that has to be kept in step with the shell's own column width.
          */}
          <form className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value={tab} />

            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
              <span className="text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
                {c.filterExam}
              </span>
              <select
                name="exam"
                defaultValue={exam ?? ''}
                className="h-10 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg"
              >
                <option value="">{c.filterExamAll}</option>
                {results?.exams.map((option) => (
                  <option key={option.lessonId} value={option.lessonId}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
              <span className="text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
                {c.filterSort}
              </span>
              <select
                name="sort"
                defaultValue={activeSort}
                className="h-10 rounded-lg border border-line bg-surface-2 px-3 text-[length:var(--fs-text-sm)] text-fg"
              >
                {GRADING_SORTS.map((value) => (
                  <option key={value} value={value}>
                    {SORT_LABEL[value]}
                  </option>
                ))}
              </select>
            </label>

            <button type="submit" className="chip chip--solid h-10 shrink-0">
              {c.filterApply}
            </button>
          </form>

          {results && results.rows.length > 0 ? (
            <ol className="mt-5 flex flex-col gap-2.5">
              {results.rows.map((row, index) => (
                <li key={row.attemptId}>
                  <ResultRow
                    row={row}
                    /* A rank only where the order IS a ranking. On «اتصحّح
                       خلاص», and on any list he has re-sorted by date or by
                       name, a «#1» would be a standing nobody earned. */
                    rank={tab === 'top' && activeSort === 'score' ? index + 1 : null}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
              <p className="text-[length:var(--fs-title-4)] font-medium text-fg">
                {tab === 'marked' ? c.emptyMarked : c.emptyTop}
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}
