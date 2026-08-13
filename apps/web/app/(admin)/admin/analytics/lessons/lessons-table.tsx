'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@ayman/ui/lib/cn';
import type { LessonAnalyticsRow } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { duration, hours, num, pct } from '@/components/admin/charts/format';

const c = copy.analytics;

type SortKey =
  | 'position'
  | 'openRate'
  | 'avgCompletion'
  | 'quizParticipationRate'
  | 'quizMeanScore'
  | 'quizPassRate';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'position', label: c.columnLesson, numeric: false },
  { key: 'openRate', label: c.columnOpenRate, numeric: true },
  { key: 'avgCompletion', label: c.columnAvgCompletion, numeric: true },
  { key: 'quizParticipationRate', label: c.columnQuizParticipants, numeric: true },
  { key: 'quizMeanScore', label: c.columnQuizMean, numeric: true },
  { key: 'quizPassRate', label: c.columnQuizPass, numeric: true },
];

/**
 * The lessons table, sorted CLIENT-side.
 *
 * Unlike the students roster, this list is bounded by the number of lessons in
 * the catalogue rather than by enrolment — a few hundred rows at the far end
 * of the product's life — so the whole set arrives in one response and sorting
 * it does not need a round trip. The students table does the opposite, in SQL,
 * for exactly the reason this one does not have to: sorting a page of a
 * paginated list client-side sorts the page, not the list.
 *
 * Nulls sort last in both directions. A lesson with no quiz has no mean score,
 * and floating it to the top of «أعلى متوسط» would read as a perfect one.
 */
export function LessonsTable({ rows }: { rows: readonly LessonAnalyticsRow[] }) {
  const [sort, setSort] = useState<SortKey>('position');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const copyOf = [...rows];
    copyOf.sort((a, b) => {
      if (sort === 'position') {
        const byCourse = a.courseTitle.localeCompare(b.courseTitle, 'ar');
        if (byCourse !== 0) return dir === 'asc' ? byCourse : -byCourse;
        const byPosition = a.position - b.position;
        return dir === 'asc' ? byPosition : -byPosition;
      }
      const left = a[sort];
      const right = b[sort];
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return dir === 'asc' ? left - right : right - left;
    });
    return copyOf;
  }, [rows, sort, dir]);

  function toggle(key: SortKey) {
    if (key === sort) setDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir(key === 'position' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[52rem] text-[length:var(--fs-text-sm)]">
        <thead className="bg-surface-3">
          <tr>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={
                  sort === column.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className={cn('p-0', column.numeric ? 'text-end' : 'text-start')}
              >
                <button
                  type="button"
                  onClick={() => toggle(column.key)}
                  className={cn(
                    'flex w-full items-center gap-1 px-3 py-2 font-medium text-fg-muted',
                    'transition-colors duration-[160ms] ease-out hover:text-fg',
                    column.numeric && 'justify-end',
                  )}
                >
                  {column.label}
                  <ArrowUpDown
                    className={cn('size-3 shrink-0', sort === column.key ? 'text-accent' : 'opacity-40')}
                    aria-hidden="true"
                  />
                </button>
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
              {c.columnWatchHours}
            </th>
            <th scope="col" className="px-3 py-2 text-end font-medium text-fg-muted">
              {c.columnQuizDuration}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.lessonId} className="border-t border-line-subtle hover:bg-surface-2">
              <th scope="row" className="max-w-72 px-3 py-2 text-start font-normal">
                <Link
                  href={`/admin/analytics/lessons/${row.lessonId}`}
                  className="block truncate font-medium text-fg hover:text-accent-text"
                  title={row.title}
                >
                  {row.title}
                </Link>
                <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                  {row.courseTitle} · {row.sectionTitle}
                </span>
              </th>
              <Cell>
                {pct(row.openRate)}
                <Sub>
                  {num(row.opened)}/{num(row.eligible)}
                </Sub>
              </Cell>
              <Cell>{pct(row.avgCompletion)}</Cell>
              <Cell>
                {row.quizId === null ? (
                  <span className="text-fg-muted">{c.noQuiz}</span>
                ) : (
                  <>
                    {pct(row.quizParticipationRate)}
                    <Sub>{num(row.quizParticipants)}</Sub>
                  </>
                )}
              </Cell>
              <Cell>{row.quizId === null ? '—' : pct(row.quizMeanScore, 1)}</Cell>
              <Cell>{row.quizId === null ? '—' : pct(row.quizPassRate)}</Cell>
              <Cell>{hours(row.watchHours)}</Cell>
              <Cell>{row.quizId === null ? '—' : duration(row.quizMedianDurationSeconds)}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="tabular px-3 py-2 text-end whitespace-nowrap text-fg">{children}</td>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">{children}</span>
  );
}
