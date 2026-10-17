import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import {
  AdminAttemptListSchema,
  AdminAttemptsOverviewSchema,
  type AdminAttemptState,
} from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy, formatMark } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { ListControl } from '@/components/admin/list-controls';
import { AttemptRow } from './attempt-row';
import { wholePercent } from './format';
import { STATE_LABEL, WASH } from './labels';
import { overviewHref, quizHref, type QuizParams } from './nav';
import { Pager } from './pager';
import { KindChip } from './quiz-card';

const q = copy.quizAdmin;
const b = q.board;

/** One of `PAGE_SIZES`. Fifty, so a lecture's whole class fits on one screen —
 *  the homework queue's own reasoning — and anything past it pages. */
const PER_PAGE = 50;

/** The tabs, in the order the work is done: everything, the papers still being
 *  written, the ones waiting on a marker, the finished ones, then the two ways
 *  a sitting ends without a hand-in. */
const TABS: readonly (AdminAttemptState | null)[] = [
  null,
  'in_progress',
  'pending_review',
  'submitted',
  'overdue',
  'abandoned',
];

/**
 * One quiz: header «course · unit · lesson», the state tabs with their counts,
 * a student search, a sort that is actually sent, and pages with a total.
 *
 * Two reads in parallel. The HEADER is the overview's own line for this quiz
 * (`/attempts/overview?quizId=`), so the numbers here and on the card that
 * opened it come from one query and cannot disagree. The ROWS and the tab
 * counts come from the sittings list under the current search — so a tab never
 * promises rows the search then hides.
 */
export async function QuizAttempts({ params }: { params: QuizParams }) {
  const key = new URLSearchParams(params.quizId ? { quizId: params.quizId } : { lessonId: params.lessonId ?? '' });
  const page = params.page ?? 1;

  const listQuery = new URLSearchParams(key);
  listQuery.set('perPage', String(PER_PAGE));
  listQuery.set('page', String(page));
  listQuery.set('sort', params.sort ?? 'newest');
  if (params.state) listQuery.set('state', params.state);
  if (params.q) listQuery.set('q', params.q);

  const [overview, list] = await Promise.all([
    adminGet(`/api/admin/attempts/overview?${key}`, AdminAttemptsOverviewSchema),
    adminGet(`/api/admin/attempts?${listQuery}`, AdminAttemptListSchema),
  ]);
  const quiz = overview.quizzes[0];
  if (!quiz) notFound();

  // The URL names the quiz the same way from here on, whichever id it came in
  // with, so a tab link never flips from `lessonId` to `quizId` mid-visit.
  const here: QuizParams = { ...params, quizId: quiz.quizId, lessonId: undefined };
  const counts = list.stateCounts;
  const all = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <>
      {/* `ArrowRight`: «رجوع» points at the inline-start edge, the right-hand
          side in RTL — the glyph `/admin/homework` uses for the same journey. */}
      <p className="mb-4">
        <Link
          href={overviewHref(params.back)}
          className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
        >
          <ArrowRight className="size-4" aria-hidden="true" />
          {b.back}
        </Link>
      </p>

      <header className="rounded-xl border border-line bg-surface-2 p-4 sm:p-5">
        <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
          {quiz.courseTitle} · {quiz.sectionTitle}
        </p>
        <h1 className="mt-0.5 text-[length:var(--fs-title-2)] font-semibold text-fg">{quiz.lessonTitle}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)]">
          <KindChip kind={quiz.kind} lectureNumber={quiz.lectureNumber} />
          {!quiz.published ? (
            <span className={cn('rounded-full px-2 py-0.5 font-medium', WASH.neutral)}>{b.unpublished}</span>
          ) : null}
          <span className={cn('rounded-full px-2 py-0.5 font-medium tabular-nums', WASH.neutral)}>
            {formatCopy(b.outOf, { n: formatMark(quiz.gradeOutOf) })}
          </span>
          <span className={cn('rounded-full px-2 py-0.5 font-medium tabular-nums', WASH.neutral)}>
            {formatCopy(b.passMark, { n: formatMark(quiz.passPercent) })}
          </span>
          {quiz.allowsImprovement ? (
            <span className={cn('rounded-full px-2 py-0.5 font-medium', WASH.accent)}>{b.improvement}</span>
          ) : null}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={b.statAttempts} value={String(quiz.attempts)} />
          <Stat label={b.statStudents} value={String(quiz.students)} />
          <Stat
            label={b.statAverage}
            value={
              quiz.averagePercent === null ? '—' : formatCopy(b.percent, { n: wholePercent(quiz.averagePercent) })
            }
          />
          <Stat
            label={b.statPassRate}
            value={
              quiz.passRatePercent === null ? '—' : formatCopy(b.percent, { n: wholePercent(quiz.passRatePercent) })
            }
          />
        </dl>
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
          <span>{b.statsNote}</span>
          <Link href={`/admin/quizzes/${quiz.quizId}/analytics`} className="text-accent-text hover:underline">
            {b.analytics}
          </Link>
        </p>
      </header>

      {/* Real tabs, each with its count — which one has anything in it is the
          most useful thing this header can say. An empty tab is left out
          unless it is the one open, so six states do not fill two lines of a
          phone with zeros. */}
      <nav className="mt-4 flex flex-wrap gap-1.5">
        {TABS.filter((tab) => tab === null || tab === params.state || counts[tab] > 0).map((tab) => {
          const active = (params.state ?? null) === tab;
          return (
            <Link
              key={tab ?? 'all'}
              href={quizHref({ ...here, state: tab ?? undefined, page: undefined })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
                'transition-colors duration-[160ms] ease-out',
                active
                  ? 'border-accent bg-accent text-[color:var(--on-accent-ink)]'
                  : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
              )}
            >
              {tab === null ? q.filterAll : STATE_LABEL[tab]}
              <span className="tabular-nums opacity-80">{tab === null ? all : counts[tab]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {/* A GET form: everything that is not the search rides along as a
            hidden field, because submitting replaces the whole query string —
            the tab, the sort and the overview «رجوع» lands on. */}
        <form action="/admin/attempts" role="search" className="flex min-w-0 flex-1 basis-64 items-center gap-2">
          <input type="hidden" name="quizId" value={quiz.quizId} />
          {params.state ? <input type="hidden" name="state" value={params.state} /> : null}
          {params.sort && params.sort !== 'newest' ? <input type="hidden" name="sort" value={params.sort} /> : null}
          {params.back.courseId ? <input type="hidden" name="courseId" value={params.back.courseId} /> : null}
          {params.back.q ? <input type="hidden" name="oq" value={params.back.q} /> : null}
          <label htmlFor="attempts-student" className="sr-only">
            {b.studentSearchLabel}
          </label>
          <input
            id="attempts-student"
            name="q"
            type="search"
            defaultValue={params.q ?? ''}
            maxLength={120}
            placeholder={b.studentSearchPlaceholder}
            className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-full bg-accent px-5 text-[length:var(--fs-text-sm)] font-medium text-[color:var(--on-accent-ink)]"
          >
            {b.searchSubmit}
          </button>
          {params.q ? (
            <Link
              href={quizHref({ ...here, q: undefined, page: undefined })}
              className="h-10 shrink-0 rounded-full border border-line px-4 text-[length:var(--fs-text-sm)] leading-10 text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
            >
              {b.searchClear}
            </Link>
          ) : null}
        </form>
        {/* The sort the old screen offered and never sent. */}
        <ListControl
          name="sort"
          label={q.sortLabel}
          value={params.sort ?? 'newest'}
          className="max-sm:w-full"
          options={[
            { value: 'newest', label: q.sortNewest },
            { value: 'oldest', label: q.sortOldest },
            { value: 'score_desc', label: q.sortScoreDesc },
            { value: 'score_asc', label: q.sortScoreAsc },
          ]}
        />
      </div>

      {list.rowCount === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line bg-surface-2 px-5 py-8 text-center text-[length:var(--fs-text-sm)] text-fg-muted">
          {b.tabEmpty}
        </p>
      ) : (
        <>
          <ul className="mt-5 flex flex-col gap-2.5">
            {list.rows.map((row) => (
              <li key={row.id}>
                <AttemptRow row={row} />
              </li>
            ))}
          </ul>
          <Pager
            page={page}
            perPage={PER_PAGE}
            rowCount={list.rowCount}
            shown={list.rows.length}
            hrefFor={(n) => quizHref({ ...here, page: n })}
          />
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-1 px-3 py-2">
      <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
      <dd className="mt-0.5 text-[length:var(--fs-title-4)] font-semibold text-fg tabular-nums">{value}</dd>
    </div>
  );
}
