import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Archive, BarChart3, ChevronLeft, Clock3, Eye, Film, FolderX, HardDrive, Timer, Users, Wallet } from 'lucide-react';
import {
  VideoLibrarySchema,
  type VideoLibraryArchived,
  type VideoLibraryItem,
  type VideoLibraryOrphan,
  type VideoLibraryTarget,
} from '@ayman/contracts/admin/video-upload';
import {
  VideoAnalyticsListSchema,
  videoKeyOf,
  type VideoAnalyticsList,
  type VideoStatsRow,
} from '@ayman/contracts/admin/video-analytics';
import { copy } from '@ayman/contracts/copy/admin';
import { R2_USD_PER_GB_MONTH, TENANT_USD_PER_GB_MONTH } from '@ayman/contracts/video';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { hours, num, pct } from '@/components/admin/charts/format';
import { getEntitlements } from '@/lib/entitlements';
import { can, getSession } from '@/lib/session';
import { IS_AYMAN } from '@/lib/tenant';
import { DeleteVideoButton } from './delete-video-button';
import { RestoreVideoButton } from './restore-video-button';

const c = copy.admin.videos;

/** The window the strip and the row numbers use — «التحليلات ← الفيديوهات»'s
 *  default, so the link from here lands on the same figures. */
const STATS_PERIOD = '28d';

export const metadata = { title: c.title };

/**
 * The rate this screen quotes. On the owner's stack it is Cloudflare's own —
 * the bill is his. On a teacher's it is what the owner CHARGES him, twice the
 * cost (see `TENANT_USD_PER_GB_MONTH`): the bucket is on the owner's account,
 * so Cloudflare's number is not what the teacher pays.
 */
const USD_PER_GB_MONTH = IS_AYMAN ? R2_USD_PER_GB_MONTH : TENANT_USD_PER_GB_MONTH;

const stamp = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });

/** `1.4 جيجا` / `350 ميجا` — the number LTR and monospaced, the unit Arabic. */
function Size({ bytes }: { bytes: number | null }) {
  if (bytes === null) return <span className="text-fg-subtle">—</span>;
  const giga = bytes >= 1e9;
  const value = giga ? (bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1) : Math.max(1, Math.round(bytes / 1e6)).toString();
  return (
    <span className="whitespace-nowrap">
      <span dir="ltr" className="mono tabular">
        {value}
      </span>{' '}
      {giga ? c.unitGb : c.unitMb}
    </span>
  );
}

function duration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const STATUS_TONE: Record<VideoLibraryItem['status'], string> = {
  ready: 'border-[color-mix(in_oklab,var(--ok)_40%,var(--border))] bg-[color-mix(in_oklab,var(--ok)_10%,var(--n-2))] text-ok',
  uploading: 'border-[color-mix(in_oklab,var(--info)_40%,var(--border))] bg-[color-mix(in_oklab,var(--info)_10%,var(--n-2))] text-info',
  pending: 'border-[color-mix(in_oklab,var(--info)_40%,var(--border))] bg-[color-mix(in_oklab,var(--info)_10%,var(--n-2))] text-info',
  mirroring: 'border-[color-mix(in_oklab,var(--warn)_40%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_10%,var(--n-2))] text-warn',
  failed: 'border-[color-mix(in_oklab,var(--err)_40%,var(--border))] bg-[color-mix(in_oklab,var(--err)_10%,var(--n-2))] text-err',
  disabled: 'border-line bg-surface-3 text-fg-muted',
};

/**
 * `/admin/videos` — «إيه اللي متخزّن، وبكام، وأمسح إيه».
 *
 * ## Why it exists
 *
 * Uploaded lectures are billed by the byte, and until this screen nothing on
 * the platform ever took a byte OUT of the bucket: deleting a lesson, a section
 * or a whole course cascades the database row away and leaves the files
 * behind, listed nowhere and paid for every month. The second list here —
 * «ملفات من غير محاضرة» — is those files.
 *
 * ## The numbers lead
 *
 * The question the owner asked was «هدفع كام»: so the total, the count and the
 * monthly cost come first, before any row. The cost is storage × the R2 rate,
 * because egress is free — there is no second number to add.
 *
 * `adminGet` (uncached) like every admin list: a deleted video that stays on
 * the screen reads exactly like a delete that failed.
 */
export default async function AdminVideosPage() {
  if (!(await getEntitlements())['video.upload']) notFound();

  const [{ items, archived, targets, orphans, totalBytes, storageRead }, stats] = await Promise.all([
    adminGet('/api/admin/videos', VideoLibrarySchema),
    videoStats(),
  ]);
  const monthly = (totalBytes / 1e9) * USD_PER_GB_MONTH;
  const statsByVideo = new Map(stats?.videos.map((row) => [row.key, row]));

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">{c.eyebrow}</p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      <dl className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Stat icon={HardDrive} label={c.statTotal} tone="accent">
          <Size bytes={totalBytes} />
        </Stat>
        <Stat icon={Film} label={c.statCount} tone="info">
          <span className="mono tabular">{items.length}</span>
        </Stat>
        <Stat
          icon={Wallet}
          label={IS_AYMAN ? c.statCost : c.statCostTenant}
          tone="ok"
          hint={IS_AYMAN ? c.statCostHint : formatCopy(c.statCostTenantHint, { price: USD_PER_GB_MONTH.toFixed(2) })}
        >
          <span dir="ltr" className="mono tabular">
            ${monthly < 0.01 && monthly > 0 ? '<0.01' : monthly.toFixed(2)}
          </span>{' '}
          {/* «كل شهر» said on the number itself, not only in the small print. */}
          <span className="text-[length:var(--fs-text-sm)] font-normal text-fg-muted">{c.perMonth}</span>
        </Stat>
      </dl>

      {stats !== null ? <StatsStrip stats={stats} /> : null}

      {storageRead ? null : (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-[color-mix(in_oklab,var(--warn)_40%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_9%,var(--n-2))] px-3 py-2 text-[length:var(--fs-text-sm)] text-warn">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {c.storageUnread}
        </p>
      )}

      {archived.length > 0 ? <Archived videos={archived} targets={targets} /> : null}

      {orphans.length > 0 ? <Orphans orphans={orphans} /> : null}

      <h2 className="mt-8 text-[length:var(--fs-title-4)] font-semibold text-fg">{c.listTitle}</h2>
      {items.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {items.map((item) => (
            <VideoRow
              key={`${item.videoId}:${item.lessonId}`}
              item={item}
              stats={stats === null ? undefined : (statsByVideo.get(videoKeyOf('upload', item.videoId)) ?? null)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * «اتشاف قد إيه» for every row, from the analytics surface — or `null` when
 * this session may not read analytics (`analytics:read` is its own grant; a
 * role that manages uploads need not hold it) or the read failed.
 *
 * `null` hides the numbers and never breaks the page: this screen's job is
 * storage and deleting, and a views query that 500s must not take the delete
 * button down with it. «التحليلات ← الفيديوهات» reads the same endpoint and is
 * where a real fault shows.
 */
async function videoStats(): Promise<VideoAnalyticsList | null> {
  if (!can(await getSession(), 'analytics:read')) return null;
  return adminGet(`/api/admin/analytics/videos?period=${STATS_PERIOD}`, VideoAnalyticsListSchema).catch(() => null);
}

const statsHref = (key?: string) =>
  key === undefined
    ? `/admin/analytics/videos?period=${STATS_PERIOD}`
    : `/admin/analytics/videos/${encodeURIComponent(key)}?period=${STATS_PERIOD}`;

/**
 * The views strip — the three numbers the owner asked for, over the last 28
 * days, across EVERY video (YouTube lectures too, not only the uploads listed
 * below), linking to the screen that breaks them down.
 */
function StatsStrip({ stats }: { stats: VideoAnalyticsList }) {
  const { totals } = stats;
  return (
    <section className="mt-3 rounded-xl border border-[color-mix(in_oklab,var(--viz-1)_35%,var(--border))] bg-[color-mix(in_oklab,var(--viz-1)_6%,var(--n-2))] p-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
          <BarChart3 className="size-4 text-accent-text" aria-hidden="true" />
          {c.statsLead}
        </p>
        <Link
          href={statsHref()}
          className="group inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-accent-text transition-colors duration-[160ms] ease-out hover:text-fg"
        >
          {c.statsOpen}
          <ChevronLeft
            className="size-3.5 transition-transform duration-[160ms] ease-out group-hover:-translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Stat icon={Eye} label={c.statsViews} tone="viz1">
          <span className="tabular">{num(totals.views)}</span>
        </Stat>
        <Stat icon={Timer} label={c.statsWatchHours} tone="viz3">
          <span className="tabular">{num(totals.watchSeconds / 3600, totals.watchSeconds < 36_000 ? 1 : 0)}</span>
        </Stat>
        <Stat icon={Users} label={c.statsViewers} tone="viz2">
          <span className="tabular">{num(totals.uniqueViewers)}</span>
        </Stat>
      </dl>
    </section>
  );
}

const STAT_TONE = {
  accent: 'bg-accent/12 text-accent-text',
  info: 'bg-[color-mix(in_oklab,var(--info)_14%,var(--n-2))] text-info',
  ok: 'bg-[color-mix(in_oklab,var(--ok)_14%,var(--n-2))] text-ok',
  viz1: 'bg-[color-mix(in_oklab,var(--viz-1)_16%,var(--n-2))] text-[color:var(--viz-1)]',
  viz2: 'bg-[color-mix(in_oklab,var(--viz-2)_16%,var(--n-2))] text-[color:var(--viz-2)]',
  viz3: 'bg-[color-mix(in_oklab,var(--viz-3)_16%,var(--n-2))] text-[color:var(--viz-3)]',
} as const;

function Stat({
  icon: Icon,
  label,
  tone,
  hint,
  children,
}: {
  icon: typeof Film;
  label: string;
  tone: keyof typeof STAT_TONE;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <span aria-hidden="true" className={cn('grid size-10 shrink-0 place-items-center rounded-lg', STAT_TONE[tone])}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <dd className="text-[length:var(--fs-title-3)] font-semibold text-fg">{children}</dd>
        <dt className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
        {hint ? <p className="mt-1 text-[length:var(--fs-text-xs)] leading-relaxed text-fg-subtle">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * `stats`: `undefined` — this session cannot read analytics, so the row says
 * nothing about views; `null` — it can, and nobody watched in the window;
 * otherwise the video's row from the analytics list. The three are different
 * facts and render differently.
 */
function VideoRow({ item, stats }: { item: VideoLibraryItem; stats: VideoStatsRow | null | undefined }) {
  const busy = item.status === 'uploading' || item.status === 'mirroring';
  const length = duration(item.durationSeconds);
  const key = videoKeyOf('upload', item.videoId);

  return (
    <li className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent-text"
        >
          <Film className="size-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-[length:var(--fs-text-sm)] font-semibold text-fg">
              {item.lessonTitle}
            </span>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
                STATUS_TONE[item.status],
              )}
            >
              {c.status[item.status]}
            </span>
          </div>
          <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {item.courseTitle} · {item.sectionTitle}
          </p>

          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
            <div className="flex items-center gap-1.5">
              <HardDrive className="size-3.5" aria-hidden="true" />
              <dd>
                <Size bytes={item.sizeBytes} />
              </dd>
            </div>
            {item.maxHeight !== null ? (
              <div className="flex items-center gap-1.5">
                <dd dir="ltr" className="mono">
                  {formatCopy(c.quality, { height: item.maxHeight })}
                </dd>
              </div>
            ) : null}
            {length !== null ? (
              <div className="flex items-center gap-1.5">
                <Clock3 className="size-3.5" aria-hidden="true" />
                <dd dir="ltr" className="mono tabular">
                  {length}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5">
              <dd className="tabular">{stamp.format(new Date(item.updatedAt))}</dd>
            </div>
            {item.sourceName ? (
              <div className="flex min-w-0 items-center gap-1.5">
                <dd dir="ltr" className="mono truncate text-fg-subtle">
                  {item.sourceName}
                </dd>
              </div>
            ) : null}
          </dl>

          {stats !== undefined ? <RowStats stats={stats} /> : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {stats !== undefined ? (
            <Link
              href={statsHref(key)}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--viz-1)_40%,var(--border))] bg-[color-mix(in_oklab,var(--viz-1)_8%,var(--n-2))] px-3 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:bg-[color-mix(in_oklab,var(--viz-1)_14%,var(--n-2))] md:h-9"
            >
              <BarChart3 className="size-4 text-accent-text" aria-hidden="true" />
              {c.rowStats}
            </Link>
          ) : null}
          <Link
            href={`/admin/courses/${item.courseId}`}
            className="inline-flex h-10 items-center rounded-md border border-line px-3 text-[length:var(--fs-text-sm)] font-medium text-fg transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:bg-surface-3 md:h-9"
          >
            {c.openLesson}
          </Link>
          <DeleteVideoButton videoId={item.videoId} courseId={item.courseId} disabled={busy} />
        </div>
      </div>
    </li>
  );
}

/** Views · watch time · how much of it was watched, as three coloured chips —
 *  the row's answer to «اتشاف قد إيه» without leaving the storage screen. */
function RowStats({ stats }: { stats: VideoStatsRow | null }) {
  if (stats === null || stats.views === 0) {
    return <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-subtle">{c.rowNoViews}</p>;
  }
  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg';
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className={cn(chip, 'bg-[color-mix(in_oklab,var(--viz-1)_14%,var(--n-2))]')}>
        <Eye className="size-3 text-[color:var(--viz-1)]" aria-hidden="true" />
        {formatCopy(c.rowViews, { n: num(stats.views) })}
      </span>
      <span className={cn(chip, 'bg-[color-mix(in_oklab,var(--viz-3)_14%,var(--n-2))]')}>
        <Timer className="size-3 text-[color:var(--viz-3)]" aria-hidden="true" />
        {hours(stats.watchSeconds / 3600)}
      </span>
      {stats.avgPercentWatched !== null ? (
        <span className={cn(chip, 'bg-[color-mix(in_oklab,var(--viz-2)_14%,var(--n-2))]')}>
          <Users className="size-3 text-[color:var(--viz-2)]" aria-hidden="true" />
          {formatCopy(c.rowWatched, { p: pct(stats.avgPercentWatched) })}
        </span>
      ) : null}
    </p>
  );
}

function Orphans({ orphans }: { orphans: VideoLibraryOrphan[] }) {
  const total = orphans.reduce((sum, orphan) => sum + orphan.sizeBytes, 0);

  return (
    <section className="mt-6 rounded-xl border border-[color-mix(in_oklab,var(--warn)_40%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_6%,var(--n-2))] p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--warn)_16%,var(--n-2))] text-warn"
        >
          <FolderX className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">
            {c.orphansTitle} · <Size bytes={total} />
          </h2>
          <p className="mt-1 text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.orphansHint}</p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {orphans.map((orphan) => (
          <li
            key={orphan.videoId}
            className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{c.orphanLabel}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[length:var(--fs-text-xs)] text-fg-muted">
                <Size bytes={orphan.sizeBytes} />
                {orphan.lastModified ? (
                  <span className="tabular">{stamp.format(new Date(orphan.lastModified))}</span>
                ) : null}
                <span dir="ltr" className="mono truncate text-fg-subtle">
                  {orphan.videoId.slice(0, 8)}
                </span>
              </p>
            </div>
            <DeleteVideoButton videoId={orphan.videoId} courseId={null} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * «محفوظة» — taken off a lesson but kept. Blue, not the amber of the leftovers
 * below: these are not money being wasted, they are the way back the owner
 * asked for.
 */
function Archived({ videos, targets }: { videos: VideoLibraryArchived[]; targets: VideoLibraryTarget[] }) {
  return (
    <section className="mt-6 rounded-xl border border-[color-mix(in_oklab,var(--info)_35%,var(--border))] bg-[color-mix(in_oklab,var(--info)_5%,var(--n-2))] p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--info)_16%,var(--n-2))] text-info"
        >
          <Archive className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.archivedTitle}</h2>
          <p className="mt-1 text-[length:var(--fs-text-sm)] leading-relaxed text-fg-muted">{c.archivedHint}</p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {videos.map((video) => {
          const length = duration(video.durationSeconds > 0 ? video.durationSeconds : null);
          return (
            <li
              key={video.videoId}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">
                  {video.fromLessonTitle !== null
                    ? formatCopy(c.archivedFrom, { lesson: video.fromLessonTitle, course: video.fromCourseTitle ?? '' })
                    : (video.sourceName ?? c.orphanLabel)}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[length:var(--fs-text-xs)] text-fg-muted">
                  <Size bytes={video.sizeBytes} />
                  {video.maxHeight !== null ? (
                    <span dir="ltr" className="mono">
                      {formatCopy(c.quality, { height: video.maxHeight })}
                    </span>
                  ) : null}
                  {length !== null ? (
                    <span dir="ltr" className="mono tabular">
                      {length}
                    </span>
                  ) : null}
                  <span className="tabular">{stamp.format(new Date(video.archivedAt))}</span>
                  {video.sourceName ? (
                    <span dir="ltr" className="mono truncate text-fg-subtle">
                      {video.sourceName}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <RestoreVideoButton videoId={video.videoId} targets={targets} />
                <DeleteVideoButton videoId={video.videoId} courseId={null} body={c.deleteArchivedBody} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
