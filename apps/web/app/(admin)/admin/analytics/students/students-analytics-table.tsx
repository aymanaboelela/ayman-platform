'use client';

import Link from 'next/link';
import { useQueryStates } from 'nuqs';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@ayman/ui/lib/cn';
import type { StudentAnalyticsRow } from '@ayman/contracts/admin/analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { dateTime, duration, hours, num, pct } from '@/components/admin/charts/format';
import { studentsAnalyticsSearchParams } from '../search-params';

const c = copy.analytics;

const COLUMNS = [
  { key: 'fullName', label: c.columnStudent, numeric: false },
  { key: 'lessonsCompleted', label: c.columnLessonsCompleted, numeric: true },
  { key: 'avgCompletion', label: c.avgCompletion, numeric: true },
  { key: 'watchHours', label: c.columnWatchHours, numeric: true },
  { key: 'attempts', label: c.columnAttempts, numeric: true },
  { key: 'meanScore', label: c.columnMeanScore, numeric: true },
  { key: 'passRate', label: c.passRate, numeric: true },
  { key: 'lastActiveAt', label: c.columnLastActive, numeric: true },
] as const;

/**
 * Sorted and paginated in SQL, not here.
 *
 * The lessons table sorts client-side because the whole catalogue fits in one
 * response. This one cannot: sorting a page of a paginated list client-side
 * sorts the page, so «أعلى متوسط درجات» would mean "the highest of the
 * twenty-five rows that happened to load" — a wrong answer that looks right.
 * Every control here writes to the URL and the server re-queries.
 */
export function StudentsAnalyticsTable({
  rows,
  rowCount,
}: {
  rows: readonly StudentAnalyticsRow[];
  rowCount: number;
}) {
  const [query, setQuery] = useQueryStates(studentsAnalyticsSearchParams);
  const pageCount = Math.max(1, Math.ceil(rowCount / query.perPage));

  function toggle(key: (typeof COLUMNS)[number]['key']) {
    if (key === query.sort) {
      void setQuery({ dir: query.dir === 'asc' ? 'desc' : 'asc', page: 1 });
    } else {
      void setQuery({ sort: key, dir: key === 'fullName' ? 'asc' : 'desc', page: 1 });
    }
  }

  return (
    <>
      <div className="mb-3">
        <input
          type="search"
          defaultValue={query.q}
          onChange={(event) => void setQuery({ q: event.target.value, page: 1 })}
          placeholder={c.searchStudent}
          aria-label={c.searchStudent}
          className={cn(
            'w-full max-w-72 rounded-md border border-line bg-surface-2 px-3 py-1.5',
            'text-[length:var(--fs-text-sm)] text-fg placeholder:text-fg-faint',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--a-9)]',
          )}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[56rem] text-[length:var(--fs-text-sm)]">
          <thead className="bg-surface-3">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    query.sort === column.key
                      ? query.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="p-0"
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
                      className={cn(
                        'size-3 shrink-0',
                        query.sort === column.key ? 'text-accent' : 'opacity-40',
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-t border-line-subtle hover:bg-surface-2">
                <th scope="row" className="max-w-64 px-3 py-2 text-start font-normal">
                  <Link
                    href={`/admin/analytics/students/${row.userId}`}
                    className="block truncate font-medium text-fg hover:text-accent-text"
                  >
                    {row.fullName}
                  </Link>
                  <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                    {row.governorateNameAr ?? ''}
                  </span>
                </th>
                <td className="tabular px-3 py-2 text-end">{num(row.lessonsCompleted)}</td>
                <td className="tabular px-3 py-2 text-end">{pct(row.avgCompletion)}</td>
                <td className="tabular px-3 py-2 text-end whitespace-nowrap">
                  {hours(row.watchHours)}
                </td>
                <td className="tabular px-3 py-2 text-end">
                  {num(row.attempts)}
                  <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
                    {duration(row.medianQuizSeconds)}
                  </span>
                </td>
                <td className="tabular px-3 py-2 text-end">{pct(row.meanScore, 1)}</td>
                <td className="tabular px-3 py-2 text-end">{pct(row.passRate)}</td>
                <td className="tabular px-3 py-2 text-end whitespace-nowrap text-fg-muted">
                  {dateTime(row.lastActiveAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav
        className="mt-3 flex items-center justify-between gap-3 text-[length:var(--fs-text-sm)]"
        aria-label={c.studentsTitle}
      >
        <p className="tabular text-fg-muted">
          {num(rowCount)} · {c.students}
        </p>
        <div className="flex items-center gap-2">
          {/* ChevronRight moves BACK: in RTL the previous page is to the right,
              and an arrow that points at the reader's "back" direction is the
              only one that reads correctly here. */}
          <PageButton
            disabled={query.page <= 1}
            onClick={() => void setQuery({ page: query.page - 1 })}
            label={c.previousPage}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </PageButton>
          <span className="tabular text-fg-muted">
            {num(query.page)} / {num(pageCount)}
          </span>
          <PageButton
            disabled={query.page >= pageCount}
            onClick={() => void setQuery({ page: query.page + 1 })}
            label={c.nextPage}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </PageButton>
        </div>
      </nav>
    </>
  );
}

function PageButton({
  disabled,
  onClick,
  children,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className={cn(
        'rounded-md border border-line bg-surface-2 p-1.5 text-fg-muted',
        'transition-colors duration-[160ms] ease-out',
        disabled ? 'opacity-40' : 'hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
