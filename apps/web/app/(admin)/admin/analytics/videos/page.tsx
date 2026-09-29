import type { SearchParams } from 'nuqs/server';
import { Info } from 'lucide-react';
import {
  VIDEO_SERIES_MAX_DAYS,
  VideoAnalyticsListSchema,
} from '@ayman/contracts/admin/video-analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { adminGet } from '@/lib/admin-api';
import { AreaChart } from '@/components/admin/charts/area-chart';
import { BarList } from '@/components/admin/charts/bar-list';
import { ChartCard } from '@/components/admin/charts/chart-card';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { duration, hours, num, shortDate } from '@/components/admin/charts/format';
import { seriesColor } from '@/components/admin/charts/palette';
import { AnalyticsNav } from '../analytics-nav';
import { videosCache } from '../search-params';
import { PeriodSwitcher } from './period-switcher';
import { videoHref } from './video-bits';
import { VideosTable } from './videos-table';

const c = copy.analytics;

export const metadata = { title: c.navVideos };

/**
 * «الفيديوهات» — YouTube Studio's «المحتوى» tab, for this platform's lectures.
 *
 * Reading order: the four numbers the owner asked for («اتشاف قد إيه، كام
 * مشاهدة، وإجمالي»), then when (the daily line) and which (the top six), then
 * every video in a table that sorts by any of them. Uploads and YouTube
 * lectures side by side — every figure is from our own heartbeats, so the host
 * makes no difference to how a view is counted.
 */
export default async function VideoAnalyticsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { period } = videosCache.parse(await searchParams);
  const { totals, daily, videos } = await adminGet(
    `/api/admin/analytics/videos?period=${period}`,
    VideoAnalyticsListSchema,
  );

  const top = videos.filter((video) => video.views > 0).slice(0, 6);
  const viewsPerViewer = totals.uniqueViewers > 0 ? totals.views / totals.uniqueViewers : null;

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <header className="mb-4">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.videosTitle}</h1>
        <p className="mt-1 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] text-fg-muted">{c.videosLead}</p>
      </header>

      <AnalyticsNav />
      <PeriodSwitcher exportHref="/api/admin/analytics/export/videos.csv" />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={c.views}
          value={num(totals.views)}
          context={formatCopy(c.videosWatched, { n: num(totals.watchedVideos), total: num(totals.videos) })}
          accent
        />
        <StatTile
          label={c.uniqueViewers}
          value={num(totals.uniqueViewers)}
          context={viewsPerViewer === null ? undefined : formatCopy(c.viewsPerViewer, { n: num(viewsPerViewer, 1) })}
          tint="var(--viz-2)"
        />
        <StatTile label={c.watchTime} value={hours(totals.watchSeconds / 3600)} tint="var(--viz-3)" />
        <StatTile
          label={c.avgViewDuration}
          value={duration(totals.avgViewSeconds)}
          context={c.perView}
          tint="var(--viz-4)"
        />
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={c.viewsPerDay}
          hint={period === 'all' && daily.length >= VIDEO_SERIES_MAX_DAYS ? c.seriesCapped : undefined}
          className="lg:col-span-2"
          isEmpty={totals.views === 0}
          rows={daily.map((point) => ({ label: shortDate(point.date), value: num(point.views) }))}
        >
          <AreaChart
            points={daily.map((point) => ({ date: point.date, value: point.views }))}
            valueLabel={c.viewsPerDay}
            unit={c.viewsUnit}
          />
        </ChartCard>

        <ChartCard
          title={c.topVideos}
          hint={c.topVideosHint}
          isEmpty={top.length === 0}
          rows={top.map((video, index) => ({
            label: video.title,
            value: num(video.views),
            share: totals.views > 0 ? video.views / totals.views : null,
            color: seriesColor(index),
          }))}
        >
          <BarList
            ariaLabel={c.topVideos}
            rows={top.map((video, index) => ({
              key: video.key,
              label: video.title,
              value: video.views,
              display: num(video.views),
              displayNote: hours(video.watchSeconds / 3600),
              color: seriesColor(index),
              meta: video.courseTitle,
              href: videoHref(video.key, period),
            }))}
          />
        </ChartCard>
      </div>

      {videos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-10 text-center text-fg-muted">{c.noVideos}</p>
      ) : (
        <VideosTable rows={videos} period={period} />
      )}

      <div className="mt-4 flex flex-col gap-1.5 text-[length:var(--fs-text-xs)] leading-relaxed text-fg-subtle">
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {c.videosDefinition}
        </p>
        <p className="ps-5">{c.videosSwapNote}</p>
      </div>
    </div>
  );
}
