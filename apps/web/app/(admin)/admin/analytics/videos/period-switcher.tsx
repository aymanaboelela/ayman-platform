'use client';

import { useQueryStates } from 'nuqs';
import { CalendarRange, Download } from 'lucide-react';
import { VIDEO_PERIODS, type VideoPeriod } from '@ayman/contracts/admin/video-analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { videosSearchParams } from '../search-params';

const c = copy.analytics;

const LABEL: Record<VideoPeriod, string> = {
  '7d': c.period7d,
  '28d': c.period28d,
  '90d': c.period90d,
  all: c.periodAll,
};

/**
 * YouTube Studio's period picker — the one control on the videos screens.
 *
 * The URL is the state (`shallow: false` in `videosSearchParams`), so a
 * switch is a server round-trip with the new window, and a copied link opens
 * on the same numbers. The CSV link carries the period for the same reason
 * `FilterBar`'s carries the course: the file must match the table.
 */
export function PeriodSwitcher({ exportHref }: { exportHref?: string }) {
  const [{ period }, setQuery] = useQueryStates(videosSearchParams);

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
        <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
        {c.period}
      </span>
      {/* A phone fits four short labels only just — scroll rather than wrap,
          so the active one never lands alone on a second line. */}
      <div className="max-w-full overflow-x-auto">
        <div className="flex w-max overflow-hidden rounded-md border border-line" role="group" aria-label={c.period}>
          {VIDEO_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => void setQuery({ period: value })}
              aria-pressed={period === value}
              className={cn(
                'whitespace-nowrap px-3 py-1.5 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
                'border-e border-line last:border-e-0',
                period === value
                  ? 'bg-accent text-[color:var(--n-1)]'
                  : 'bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg',
              )}
            >
              {LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {exportHref ? (
        <a
          href={`${exportHref}?period=${period}`}
          download
          title={c.exportHint}
          className={cn(
            'ms-auto inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5',
            'text-[length:var(--fs-text-sm)] text-fg',
            'transition-colors duration-[160ms] ease-out hover:border-line-strong hover:bg-surface-3',
          )}
        >
          <Download className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          {c.exportCsv}
        </a>
      ) : null}
    </div>
  );
}
