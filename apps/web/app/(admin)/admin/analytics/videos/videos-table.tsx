'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowUpDown, Layers } from 'lucide-react';
import type { VideoPeriod, VideoStatsRow } from '@ayman/contracts/admin/video-analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { dateTime, duration, hours, num, pct } from '@/components/admin/charts/format';
import { VideoThumb, clockDuration } from '@/components/admin/video-thumb';
import { ProviderBadge, ReachBar, videoHref } from './video-bits';

const c = copy.analytics;

type SortKey =
  | 'views'
  | 'uniqueViewers'
  | 'watchSeconds'
  | 'avgViewSeconds'
  | 'avgPercentWatched'
  | 'completionRate'
  | 'lastViewedAt';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'views', label: c.columnViews },
  { key: 'uniqueViewers', label: c.columnViewers },
  { key: 'watchSeconds', label: c.columnWatchTime },
  { key: 'avgViewSeconds', label: c.columnAvgView },
  { key: 'avgPercentWatched', label: c.columnAvgPercent },
  { key: 'completionRate', label: c.columnVideoCompletion },
  { key: 'lastViewedAt', label: c.columnLastViewed },
];

/**
 * Every video, sorted CLIENT-side — the list is bounded by the catalogue (a
 * few hundred videos at the far end), not by students, so the whole set
 * arrives in one response like the lessons table's does.
 *
 * Nulls sort last in both directions: a video nobody watched has no average,
 * and floating it to the top of «أعلى متوسط» would read as a perfect one.
 */
export function VideosTable({ rows, period }: { rows: readonly VideoStatsRow[]; period: VideoPeriod }) {
  const [sort, setSort] = useState<SortKey>('views');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const value = (row: VideoStatsRow): number | null => {
      if (sort === 'lastViewedAt') return row.lastViewedAt === null ? null : Date.parse(row.lastViewedAt);
      return row[sort];
    };
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
      {/* Cards on a phone — eight columns do not fit 360px. */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {sorted.map((row) => (
          <li key={row.key}>
            <Link
              href={videoHref(row.key, period)}
              className="block rounded-lg border border-line bg-surface-2 p-3 transition-colors duration-[160ms] ease-out hover:border-line-strong hover:bg-surface-3"
            >
              <div className="flex gap-3">
                <VideoThumb
                  provider={row.provider}
                  externalId={row.externalId}
                  duration={clockDuration(row.durationSeconds)}
                  className="w-28"
                />
                <VideoName row={row} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[length:var(--fs-text-xs)]">
                <Metric label={c.columnViews} tint="var(--viz-1)">{num(row.views)}</Metric>
                <Metric label={c.columnViewers} tint="var(--viz-2)">{num(row.uniqueViewers)}</Metric>
                <Metric label={c.columnWatchTime} tint="var(--viz-3)">{hours(row.watchSeconds / 3600)}</Metric>
                <Metric label={c.columnAvgView}>{duration(row.avgViewSeconds)}</Metric>
                <Metric label={c.columnAvgPercent}>{pct(row.avgPercentWatched)}</Metric>
                <Metric label={c.columnVideoCompletion}>{pct(row.completionRate)}</Metric>
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-line md:block">
        <table className="w-full min-w-[60rem] text-[length:var(--fs-text-sm)]">
          <thead className="bg-surface-3">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium text-fg-muted">
                {c.columnVideo}
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.key}
                className={cn('border-t border-line-subtle hover:bg-surface-2', row.views === 0 && 'text-fg-muted')}
              >
                <th scope="row" className="px-3 py-2 text-start font-normal">
                  <Link href={videoHref(row.key, period)} className="group flex min-w-0 max-w-96 items-center gap-3">
                    <VideoThumb
                      provider={row.provider}
                      externalId={row.externalId}
                      duration={clockDuration(row.durationSeconds)}
                      className="w-24"
                    />
                    <VideoName row={row} />
                  </Link>
                </th>
                <Cell strong>{num(row.views)}</Cell>
                <Cell>{num(row.uniqueViewers)}</Cell>
                <Cell>{hours(row.watchSeconds / 3600)}</Cell>
                <Cell>{duration(row.avgViewSeconds)}</Cell>
                <Cell>
                  <ReachBar fraction={row.avgPercentWatched} />
                </Cell>
                <Cell>{pct(row.completionRate)}</Cell>
                <Cell muted>{row.lastViewedAt === null ? c.never : dateTime(row.lastViewedAt)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VideoName({ row }: { row: VideoStatsRow }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="line-clamp-2 font-medium text-fg group-hover:text-accent-text">{row.title}</span>
      <span className="mt-0.5 block truncate text-[length:var(--fs-text-xs)] text-fg-muted">{row.courseTitle}</span>
      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-text-xs)]">
        <ProviderBadge provider={row.provider} />
        {row.lessonCount > 1 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--viz-5)_14%,var(--n-2))] px-2 py-0.5 text-fg">
            <Layers className="size-3" aria-hidden="true" />
            {formatCopy(c.onLessons, { n: num(row.lessonCount) })}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function Cell({ children, strong, muted }: { children: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <td
      className={cn(
        'tabular whitespace-nowrap px-3 py-2 text-end',
        strong ? 'font-semibold text-fg' : muted ? 'text-fg-muted' : 'text-fg',
      )}
    >
      {children}
    </td>
  );
}

function Metric({ label, tint, children }: { label: string; tint?: string; children: ReactNode }) {
  return (
    <div
      className="rounded-md border border-line-subtle px-2 py-1.5"
      style={tint ? { background: `color-mix(in oklch, ${tint}, transparent 90%)` } : undefined}
    >
      <dt className="truncate text-fg-muted">{label}</dt>
      <dd className="tabular mt-0.5 font-semibold text-fg">{children}</dd>
    </div>
  );
}
