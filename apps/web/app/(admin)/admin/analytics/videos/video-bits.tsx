import type { VideoPeriod, VideoStatsRow } from '@ayman/contracts/admin/video-analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';
import { pct } from '@/components/admin/charts/format';

const c = copy.analytics;

/*
 * The pieces both the server pages and the client tables render. Deliberately
 * NOT in a `'use client'` file: a plain function exported from one arrives in
 * a Server Component as a client reference, and calling `videoHref()` there
 * throws at render — while the typecheck is perfectly happy.
 */

/** One video's page, keeping the window the reader was looking at. */
export function videoHref(key: string, period: VideoPeriod): string {
  return `/admin/analytics/videos/${encodeURIComponent(key)}?period=${period}`;
}

export function ProviderBadge({ provider }: { provider: VideoStatsRow['provider'] }) {
  const youtube = provider === 'youtube';
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)]',
        youtube
          ? 'bg-[color-mix(in_oklab,var(--err)_13%,var(--n-2))] text-err'
          : 'bg-[color-mix(in_oklab,var(--info)_13%,var(--n-2))] text-info',
      )}
    >
      {youtube ? c.providerYoutube : c.providerUpload}
    </span>
  );
}

/** «اتشاف منه» with its length drawn — a column of bare percentages is read
 *  one cell at a time; a column of bars is read at a glance. */
export function ReachBar({ fraction, color = 'var(--viz-2)' }: { fraction: number | null; color?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[color:var(--viz-track)]" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${(fraction ?? 0) * 100}%`, background: color }} />
      </span>
      {pct(fraction)}
    </span>
  );
}
