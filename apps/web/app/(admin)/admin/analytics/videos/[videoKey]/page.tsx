import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { BookOpen, Clock3, Layers, Users } from 'lucide-react';
import {
  RETENTION_STEPS,
  VIDEO_SERIES_MAX_DAYS,
  VIDEO_VIEWERS_LIMIT,
  VideoAnalyticsDetailSchema,
} from '@ayman/contracts/admin/video-analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { AreaChart } from '@/components/admin/charts/area-chart';
import { ChartCard } from '@/components/admin/charts/chart-card';
import { ColumnChart } from '@/components/admin/charts/column-chart';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { duration, hours, num, pct, shortDate } from '@/components/admin/charts/format';
import { sequentialColor } from '@/components/admin/charts/palette';
import { VideoThumb, clockDuration } from '@/components/admin/video-thumb';
import { AnalyticsNav } from '../../analytics-nav';
import { videosCache } from '../../search-params';
import { PeriodSwitcher } from '../period-switcher';
import { ProviderBadge } from '../video-bits';
import { ViewersTable } from './viewers-table';

const c = copy.analytics;

export const metadata = { title: c.openVideoStats };

/** `٩ م` — the hour a sitting started, for the tooltip. UTC because the hour
 *  already IS Cairo's (the API bucketed it); this only names it. */
const HOUR = new Intl.DateTimeFormat('ar-EG', { hour: 'numeric', hour12: true, timeZone: 'UTC' });
const hourName = (hour: number) => HOUR.format(new Date(Date.UTC(2026, 0, 1, hour)));

/** The four marks under the retention curve — a quarter, half, three
 *  quarters, the end — each a step on the curve's 5% grid. */
const CHECKPOINTS = [5, 10, 15, 20] as const;
const CHECKPOINT_COLOR = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-6)'] as const;

/**
 * One video, YouTube-Studio style: how much it was watched, when, how far
 * people got into it, on which lessons, and by whom.
 *
 * The video is `provider-externalId` (see `parseVideoKey`), not a lesson — an
 * upload reused on three lessons is ONE page here whose numbers are the sum
 * of the three, with each lesson's own share listed underneath.
 */
export default async function VideoStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoKey: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ videoKey }, query] = await Promise.all([params, searchParams]);
  const { period } = videosCache.parse(query);
  const detail = await adminGetOrNotFound(
    `/api/admin/analytics/videos/${encodeURIComponent(videoKey)}?period=${period}`,
    VideoAnalyticsDetailSchema,
  );
  const { summary, daily, retention, byHour, lessons, viewers } = detail;

  const viewsPerViewer = summary.uniqueViewers > 0 ? summary.views / summary.uniqueViewers : null;
  const capped = period === 'all' && daily.length >= VIDEO_SERIES_MAX_DAYS;
  const hourMax = Math.max(1, ...byHour);
  const head = lessons[0];

  return (
    <div className="mx-auto w-full max-w-[80rem]">
      <Link
        href={`/admin/analytics/videos?period=${period}`}
        className="mb-4 inline-block text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        {'< '}
        {c.backToVideos}
      </Link>

      <header className="mb-5 grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
        <VideoThumb
          provider={summary.provider}
          externalId={summary.externalId}
          duration={clockDuration(summary.durationSeconds)}
          className="w-full max-w-sm"
        />
        <div className="min-w-0">
          <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{summary.title}</h1>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">
            {summary.courseTitle}
            {head ? ` · ${head.sectionTitle}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
            <ProviderBadge provider={summary.provider} />
            {summary.durationSeconds !== null ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3.5" aria-hidden="true" />
                {c.videoLength} {duration(summary.durationSeconds)}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" aria-hidden="true" />
              {formatCopy(c.onLessons, { n: num(summary.lessonCount) })}
            </span>
            {summary.sourceName ? (
              <span dir="ltr" className="mono max-w-64 truncate text-fg-subtle">
                {summary.sourceName}
              </span>
            ) : null}
          </div>
          {head ? (
            <nav className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-sm)]">
              <Link href={`/admin/analytics/lessons/${head.lessonId}`} className="text-accent-text hover:underline">
                {c.openLessonAnalytics}
              </Link>
              <Link href={`/admin/courses/${head.courseId}`} className="text-accent-text hover:underline">
                {c.goToCourse}
              </Link>
            </nav>
          ) : null}
        </div>
      </header>

      <AnalyticsNav />
      <PeriodSwitcher />

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label={c.views}
          value={num(summary.views)}
          context={viewsPerViewer === null ? undefined : formatCopy(c.viewsPerViewer, { n: num(viewsPerViewer, 1) })}
          accent
        />
        <StatTile label={c.uniqueViewers} value={num(summary.uniqueViewers)} tint="var(--viz-2)" />
        <StatTile label={c.watchTime} value={hours(summary.watchSeconds / 3600)} tint="var(--viz-3)" />
        <StatTile
          label={c.avgViewDuration}
          value={duration(summary.avgViewSeconds)}
          context={c.perView}
          tint="var(--viz-4)"
        />
        <StatTile label={c.avgPercentWatched} value={pct(summary.avgPercentWatched)} tint="var(--viz-5)" />
        <StatTile
          label={c.videoCompletion}
          value={pct(summary.completionRate)}
          context={
            summary.uniqueViewers > 0
              ? `${num(summary.completedViewers)} ${formatCopy(c.ofTotal, { n: num(summary.uniqueViewers) })}`
              : undefined
          }
          tint="var(--viz-6)"
        />
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={c.viewsPerDay}
          hint={capped ? c.seriesCapped : undefined}
          isEmpty={summary.views === 0}
          rows={daily.map((point) => ({ label: shortDate(point.date), value: num(point.views) }))}
        >
          <AreaChart
            points={daily.map((point) => ({ date: point.date, value: point.views }))}
            valueLabel={c.viewsPerDay}
            unit={c.viewsUnit}
          />
        </ChartCard>
        <ChartCard
          title={c.watchMinutesPerDay}
          hint={capped ? c.seriesCapped : undefined}
          isEmpty={summary.views === 0}
          rows={daily.map((point) => ({ label: shortDate(point.date), value: num(point.watchMinutes, 0) }))}
        >
          <AreaChart
            points={daily.map((point) => ({ date: point.date, value: Math.round(point.watchMinutes) }))}
            valueLabel={c.watchMinutesPerDay}
            unit={c.minutesShort}
            color="var(--viz-3)"
          />
        </ChartCard>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={c.retentionTitle}
          hint={summary.views > 0 && retention === null ? c.retentionUnknown : c.retentionHint}
          className="lg:col-span-2"
          isEmpty={retention === null}
          rows={(retention ?? []).map((share, step) => ({
            label: formatCopy(c.retentionAt, { p: pct(step / RETENTION_STEPS) }),
            value: pct(share),
          }))}
        >
          {retention !== null ? (
            <>
              <AreaChart
                points={retention.map((share, step) => ({
                  date: String(step),
                  value: Math.round(share * 1000) / 10,
                  label: formatCopy(c.retentionAt, { p: pct(step / RETENTION_STEPS) }),
                  display: formatCopy(c.retentionShare, { p: pct(share) }),
                }))}
                valueLabel={c.retentionTitle}
                color="var(--viz-2)"
              />
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CHECKPOINTS.map((step, index) => (
                  <div
                    key={step}
                    className="rounded-md border px-3 py-2"
                    style={{
                      borderColor: `color-mix(in oklch, ${CHECKPOINT_COLOR[index]}, transparent 60%)`,
                      background: `color-mix(in oklch, ${CHECKPOINT_COLOR[index]}, transparent 91%)`,
                    }}
                  >
                    <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">
                      {formatCopy(c.retentionAt, { p: pct(step / RETENTION_STEPS) })}
                    </dt>
                    <dd className="tabular mt-0.5 text-[length:var(--fs-title-4)] font-semibold text-fg">
                      {pct(retention[step] ?? null)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
        </ChartCard>

        <ChartCard
          title={c.byHourTitle}
          hint={c.byHourHint}
          isEmpty={summary.views === 0}
          rows={byHour.map((n, hour) => ({
            label: formatCopy(c.hourRange, { from: hourName(hour), to: hourName((hour + 1) % 24) }),
            value: num(n),
            share: summary.views > 0 ? n / summary.views : null,
          }))}
        >
          <ColumnChart
            columns={byHour.map((n, hour) => ({
              key: String(hour),
              // Every sixth hour only: 24 labels under 24 columns on a phone
              // is 24 truncated glyphs. The tooltip names every hour.
              label: hour % 6 === 0 ? num(hour) : '',
              value: n,
              color: sequentialColor(0.25 + (n / hourMax) * 0.75),
              tooltip: formatCopy(c.hourRange, { from: hourName(hour), to: hourName((hour + 1) % 24) }),
            }))}
            unit={c.viewsUnit}
          />
        </ChartCard>
      </div>

      <section className="mb-8">
        <h2 className="flex items-center gap-2 text-[length:var(--fs-title-4)] font-semibold text-fg">
          <BookOpen className="size-4 text-accent-text" aria-hidden="true" />
          {c.videoLessonsTitle}
        </h2>
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.videoLessonsHint}</p>
        <ul className="mt-3 flex flex-col gap-2">
          {lessons.map((lesson) => {
            const share = summary.views > 0 ? lesson.views / summary.views : 0;
            return (
              <li
                key={lesson.lessonId}
                className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/analytics/lessons/${lesson.lessonId}`}
                      className="min-w-0 break-words font-medium text-fg hover:text-accent-text"
                    >
                      {lesson.title}
                    </Link>
                    {lesson.isPublished ? null : (
                      <span className="rounded-full bg-[color-mix(in_oklab,var(--warn)_14%,var(--n-2))] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-warn">
                        {c.draftLesson}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                    {lesson.courseTitle} · {lesson.sectionTitle}
                  </p>
                  <div className="mt-2 h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-[color:var(--viz-track)]" aria-hidden="true">
                    <div className="h-full rounded-full bg-[color:var(--viz-1)]" style={{ width: `${share * 100}%` }} />
                  </div>
                </div>
                <dl className="grid shrink-0 grid-cols-3 gap-4 text-[length:var(--fs-text-xs)] sm:text-end">
                  <div>
                    <dt className="text-fg-muted">{c.columnViews}</dt>
                    <dd className="tabular text-[length:var(--fs-text-sm)] font-semibold text-fg">{num(lesson.views)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{c.columnViewers}</dt>
                    <dd className="tabular text-[length:var(--fs-text-sm)] font-semibold text-fg">
                      {num(lesson.uniqueViewers)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{c.columnWatchTime}</dt>
                    <dd className="tabular text-[length:var(--fs-text-sm)] font-semibold text-fg">
                      {hours(lesson.watchSeconds / 3600)}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-[length:var(--fs-title-4)] font-semibold text-fg">
          <Users className="size-4 text-accent-text" aria-hidden="true" />
          {c.viewersTitle}
          <span className="tabular rounded-full bg-accent/12 px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-accent-text">
            {num(summary.uniqueViewers)}
          </span>
        </h2>
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.viewersHint}</p>
        <div className="mt-3">
          {viewers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-8 text-center text-fg-muted">{c.noViewers}</p>
          ) : (
            <ViewersTable rows={viewers} />
          )}
        </div>
        {summary.uniqueViewers > viewers.length ? (
          <p className={cn('mt-2 text-[length:var(--fs-text-xs)] text-fg-subtle')}>
            {formatCopy(c.viewersCapped, { n: num(VIDEO_VIEWERS_LIMIT) })}
          </p>
        ) : null}
      </section>
    </div>
  );
}
