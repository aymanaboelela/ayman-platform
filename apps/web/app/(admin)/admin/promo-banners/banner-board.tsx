'use client';

import { useState, useTransition } from 'react';
import { CalendarRange, GalleryHorizontalEnd, Link2, Radio, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { PROMO_BANNER_MAX, promoBannerInWindow, type PromoBanner } from '@ayman/contracts/admin/promo-banners';
import { copy } from '@ayman/contracts/copy/admin';
import { promoBannersCopy } from '@ayman/contracts/copy/promo-banners';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Switch } from '@ayman/ui/components/switch';
import { cn } from '@ayman/ui/lib/cn';
import { mediaUrl } from '@ayman/ui/branding';
import { useAdminCan } from '@/components/admin/permissions-context';
import { SortableList, type SortableHandleProps } from '@/components/admin/sortable-list';
import type { ReorderStatus } from '@/components/admin/use-debounced-reorder';
import { patchPromoBannerAction, removePromoBannerAction, reorderPromoBannersAction } from './actions';
import { PromoBannerDialog, type YearOption } from './banner-dialog';

const c = promoBannersCopy.admin;

type Status = 'live' | 'off' | 'scheduled' | 'ended';

/** One word for where a banner stands TODAY — the thing the list is scanned
 *  for. `today` comes from the server so the label cannot flip on hydration. */
function statusOf(banner: PromoBanner, today: string): Status {
  if (!banner.isActive) return 'off';
  if (banner.startsOn && banner.startsOn > today) return 'scheduled';
  if (banner.endsOn && banner.endsOn < today) return 'ended';
  return 'live';
}

const STATUS_TONE: Record<Status, 'ok' | 'neutral' | 'warn' | 'err'> = {
  live: 'ok',
  off: 'neutral',
  scheduled: 'warn',
  ended: 'err',
};

function statusLabel(status: Status, banner: PromoBanner): string {
  if (status === 'live') return c.statusLive;
  if (status === 'off') return c.statusOff;
  if (status === 'scheduled') return formatCopy(c.statusScheduled, { date: banner.startsOn ?? '' });
  return formatCopy(c.statusEnded, { date: banner.endsOn ?? '' });
}

function windowLabel(banner: PromoBanner): string {
  if (banner.startsOn && banner.endsOn) return formatCopy(c.windowRange, { from: banner.startsOn, to: banner.endsOn });
  if (banner.startsOn) return formatCopy(c.windowFrom, { date: banner.startsOn });
  if (banner.endsOn) return formatCopy(c.windowUntil, { date: banner.endsOn });
  return c.windowAlways;
}

const REORDER_STATUS: Record<ReorderStatus, string> = {
  idle: '',
  pending: copy.admin.common.saving,
  saving: copy.admin.common.saving,
  saved: copy.admin.common.saved,
  error: copy.admin.common.saveFailed,
};

/**
 * The screen under the header: three counts, then every banner in the order
 * students see them, draggable.
 *
 * ## The counts are the competitor's three, and «شغّالة» means live TODAY
 *
 * «النشطة» on the screen this was modelled on counted the switch. Here it
 * counts what a student would actually see right now — switched on AND inside
 * its dates — because «عندي ٥ نشطة» while two of them ended last week is the
 * exact confusion the status pill on each row exists to prevent.
 */
export function PromoBannerBoard({
  banners,
  yearOptions,
  today,
  atCap,
}: {
  banners: readonly PromoBanner[];
  yearOptions: readonly YearOption[];
  today: string;
  atCap: boolean;
}) {
  const live = banners.filter((banner) => banner.isActive && promoBannerInWindow(banner, today)).length;
  const withLink = banners.filter((banner) => banner.linkUrl !== null).length;
  const canWrite = useAdminCan('home:write');
  const yearLabel = new Map(yearOptions.map((option) => [option.year, option.label]));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={GalleryHorizontalEnd} label={c.statTotal} value={banners.length} tone="--e-stage" />
        <StatTile icon={Radio} label={c.statLive} value={live} tone="--ok" />
        <StatTile icon={Link2} label={c.statWithLink} value={withLink} tone="--info" />
      </div>

      {atCap && canWrite ? (
        <p className="rounded-[var(--r-lg)] border border-[color:var(--warn)] bg-[color-mix(in_oklch,var(--warn),transparent_90%)] p-3 text-[length:var(--fs-text-sm)] text-fg">
          {formatCopy(c.limitReached, { max: String(PROMO_BANNER_MAX) })}
        </p>
      ) : null}

      {banners.length === 0 ? (
        <div className="rounded-[var(--r-lg)] border border-dashed border-line p-10 text-center">
          <GalleryHorizontalEnd className="mx-auto mb-3 size-10 text-accent" strokeWidth={1.5} aria-hidden="true" />
          <p className="font-semibold text-fg">{c.empty}</p>
          <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
        </div>
      ) : (
        <SortableList
          items={banners}
          disabled={!canWrite}
          onReorder={(ids) => reorderPromoBannersAction(ids)}
          renderItem={(banner, handleProps) => (
            <BannerRow
              banner={banner}
              handleProps={handleProps}
              today={today}
              yearOptions={yearOptions}
              yearLabel={yearLabel}
              canWrite={canWrite}
            />
          )}
          announcements={{
            pickedUp: (position) => `${copy.admin.reorder.pickedUp} ${position}`,
            movedOver: (position) => `${copy.admin.reorder.movedOver} ${position}`,
            dropped: (position) => `${copy.admin.reorder.dropped} ${position}`,
            cancelled: copy.admin.reorder.cancelled,
          }}
          statusSlot={(status) => (
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.reorderHint}</p>
              <p aria-live="polite" className="text-[length:var(--fs-text-sm)] text-fg-muted">
                {REORDER_STATUS[status]}
              </p>
            </div>
          )}
        />
      )}
    </div>
  );
}

/**
 * A count on a wash of its own colour — ember for the total (the platform's
 * own hue), green for what is live, blue for links. The colour carries the
 * meaning at a glance; the label says it.
 */
function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Radio;
  label: string;
  value: number;
  tone: '--e-stage' | '--ok' | '--info';
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-[var(--r-lg)] border p-4"
      style={{
        borderColor: `color-mix(in oklch, var(${tone}), transparent 70%)`,
        background: `color-mix(in oklch, var(${tone}), transparent 90%)`,
      }}
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-full text-[color:var(--ink-fg)]"
        style={{ background: `var(${tone})` }}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{label}</p>
        <p className="text-[length:var(--fs-title-2)] font-bold leading-tight text-fg tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function BannerRow({
  banner,
  handleProps,
  today,
  yearOptions,
  yearLabel,
  canWrite,
}: {
  banner: PromoBanner;
  handleProps: SortableHandleProps;
  today: string;
  yearOptions: readonly YearOption[];
  yearLabel: ReadonlyMap<number, string>;
  canWrite: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const status = statusOf(banner, today);

  function setActive(isActive: boolean) {
    start(async () => {
      const result = await patchPromoBannerAction(banner.id, { isActive });
      if (!result.ok) toast.error(result.message);
    });
  }

  function remove() {
    start(async () => {
      const result = await removePromoBannerAction(banner.id);
      if (result.ok) {
        toast.success(c.removed);
        setConfirming(false);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <article
      className={cn(
        'grid grid-cols-1 gap-4 rounded-[var(--r-lg)] border border-line bg-surface-1 p-3 md:grid-cols-[auto_minmax(0,16rem)_minmax(0,1fr)]',
        status !== 'live' && 'bg-surface-2',
      )}
    >
      {canWrite ? (
        <button
          type="button"
          aria-label={copy.admin.reorder.handle}
          className="hidden cursor-grab self-center rounded-xs px-1 py-2 text-fg-muted focus-visible:outline-2 md:block"
          {...handleProps.attributes}
          {...handleProps.listeners}
        >
          <span aria-hidden="true" className="block h-px w-5 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-5 bg-current" />
          <span aria-hidden="true" className="mt-1 block h-px w-5 bg-current" />
        </button>
      ) : (
        <span className="hidden md:block" />
      )}

      {/* 3:1, the frame the dashboard draws — what the admin sees here is
          the crop a student gets. Raw <img> for the reason `MediaKeyField`
          gives. */}
      <div
        className={cn(
          'relative aspect-[3/1] overflow-hidden rounded-[var(--r-md)] border border-line bg-surface-3',
          status !== 'live' && 'opacity-70',
        )}
      >
        <img src={mediaUrl(banner.imageKey)} alt="" className="size-full object-cover" loading="lazy" />
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('font-semibold', banner.title ? 'text-fg' : 'text-fg-muted')}>
            {banner.title ?? c.noTitle}
          </h3>
          <Badge tone={STATUS_TONE[status]}>{statusLabel(status, banner)}</Badge>
        </div>

        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[length:var(--fs-text-sm)] text-fg-muted">
          <li className="flex min-w-0 items-center gap-1.5">
            <Link2 className="size-4 shrink-0" aria-hidden="true" />
            {banner.linkUrl ? (
              <span dir="ltr" className="truncate [unicode-bidi:isolate]">
                {banner.linkUrl}
              </span>
            ) : (
              c.noLink
            )}
          </li>
          <li className="flex items-center gap-1.5">
            <Users className="size-4 shrink-0" aria-hidden="true" />
            {banner.years.length === 0
              ? c.yearsAll
              : banner.years.map((year) => yearLabel.get(year) ?? String(year)).join('، ')}
          </li>
          <li className="flex items-center gap-1.5">
            <CalendarRange className="size-4 shrink-0" aria-hidden="true" />
            <span className="[unicode-bidi:isolate]">{windowLabel(banner)}</span>
          </li>
        </ul>

        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className="me-2 inline-flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg">
              <Switch
                checked={banner.isActive}
                disabled={pending}
                onCheckedChange={setActive}
                aria-label={banner.isActive ? c.turnOff : c.turnOn}
              />
              {c.activeLabel}
            </label>
            <PromoBannerDialog banner={banner} yearOptions={yearOptions} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.remove}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent closeLabel={c.cancel}>
          <DialogHeader>
            <DialogTitle>{c.removeConfirm}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              {c.cancel}
            </Button>
            <Button type="button" variant="danger" disabled={pending} onClick={remove}>
              {c.remove}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
