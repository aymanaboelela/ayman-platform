'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpDown, CheckCircle2 } from 'lucide-react';
import type { VideoViewerRow } from '@ayman/contracts/admin/video-analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { dateTime, duration, num } from '@/components/admin/charts/format';
import { ReachBar } from '../video-bits';

const c = copy.analytics;

type SortKey = 'watchSeconds' | 'views' | 'percentWatched' | 'lastViewedAt';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'views', label: c.columnViews },
  { key: 'watchSeconds', label: c.columnWatchTime },
  { key: 'percentWatched', label: c.columnReached },
  { key: 'lastViewedAt', label: c.columnLastViewed },
];

/**
 * «مين اتفرّج» — the rows behind the viewer count, sortable here because the
 * two questions a teacher brings are opposite sorts of the same list: who
 * watched the most, and who watched most recently.
 */
export function ViewersTable({ rows }: { rows: readonly VideoViewerRow[] }) {
  const [sort, setSort] = useState<SortKey>('watchSeconds');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const value = (row: VideoViewerRow): number | null =>
      sort === 'lastViewedAt' ? Date.parse(row.lastViewedAt) : row[sort];
    return [...rows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return dir === 'asc' ? left - right : right - left;
    });
  }, [rows, sort, dir]);

  function toggle(key: SortKey) {
    if (key === sort) setDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir('desc');
    }
  }

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {sorted.map((row) => (
          <li key={row.userId} className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <Name row={row} />
              {row.completed ? <Finished /> : null}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[length:var(--fs-text-xs)]">
              <div>
                <dt className="text-fg-muted">{c.columnWatchTime}</dt>
                <dd className="tabular font-semibold text-fg">{duration(row.watchSeconds)}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">{c.columnViews}</dt>
                <dd className="tabular font-semibold text-fg">{num(row.views)}</dd>
              </div>
              <div>
                <dt className="text-fg-muted">{c.columnReached}</dt>
                <dd className="tabular text-fg">
                  <ReachBar fraction={row.percentWatched} />
                </dd>
              </div>
              <div>
                <dt className="text-fg-muted">{c.columnLastViewed}</dt>
                <dd className="tabular text-fg">{dateTime(row.lastViewedAt)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
        <table className="w-full min-w-[46rem] text-[length:var(--fs-text-sm)]">
          <thead className="bg-surface-3">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium text-fg-muted">
                {c.columnStudent}
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={sort === column.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="p-0 text-end"
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className="flex w-full items-center justify-end gap-1 px-3 py-2 font-medium text-fg-muted transition-colors duration-[160ms] ease-out hover:text-fg"
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
                {c.columnVideoCompletion}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.userId} className="border-t border-line-subtle hover:bg-surface-2">
                <th scope="row" className="max-w-72 px-3 py-2 text-start font-normal">
                  <Name row={row} />
                </th>
                <td className="tabular px-3 py-2 text-end text-fg">{num(row.views)}</td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-end font-semibold text-fg">
                  {duration(row.watchSeconds)}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-end text-fg">
                  <ReachBar fraction={row.percentWatched} color="var(--viz-6)" />
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-end text-fg-muted">
                  {dateTime(row.lastViewedAt)}
                </td>
                <td className="px-3 py-2 text-end">{row.completed ? <Finished /> : <span className="text-fg-subtle">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Name({ row }: { row: VideoViewerRow }) {
  return (
    <span className="block min-w-0">
      <Link
        href={`/admin/analytics/students/${row.userId}`}
        className="block truncate font-medium text-fg hover:text-accent-text"
      >
        {row.fullName}
      </Link>
      {row.governorateNameAr ? (
        <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">{row.governorateNameAr}</span>
      ) : null}
    </span>
  );
}

function Finished() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--ok)_14%,var(--n-2))] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-ok">
      <CheckCircle2 className="size-3" aria-hidden="true" />
      {c.finished}
    </span>
  );
}
