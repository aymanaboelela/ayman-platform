import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  Building2,
  ClipboardList,
  ExternalLink,
  Hourglass,
  LayoutDashboard,
  Search,
  Settings,
  UserRoundX,
  Wallet,
  WalletCards,
} from 'lucide-react';
import {
  AdminReservationsSchema,
  RESERVATION_STATUSES,
  ReservationSetupSchema,
  type ReservationCenterStats,
  type ReservationStatus,
} from '@ayman/contracts/center-reservations';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { featureEnabled } from '@/lib/entitlements';
import { formatEGP } from '@/lib/price';
import { SITE_URL } from '@/lib/seo/site-url';
import { can, getSession } from '@/lib/session';
import { Chip, Ltr, ROW_BUTTON, ROW_BUTTON_TONE, StatTile, TINT_CARD, TINT_WELL, TONE_TEXT, centerHue, tone } from '../centers-ui';
import { ReservationCard, STATUS_HUE } from './reservation-card';
import { CopyLinkButton, ReservationActions } from './reservation-controls';

const a = reservationsCopy.admin;

export const metadata = { title: a.title };

type Search = { center?: string; status?: string; q?: string; page?: string };

const UUID = /^[0-9a-f-]{36}$/i;

function hrefWith(current: Search, next: Partial<Search>): string {
  const merged = { ...current, ...next };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  const qs = params.toString();
  return qs ? `/admin/centers/reservations?${qs}` : '/admin/centers/reservations';
}

/**
 * `/admin/centers/reservations` — «حجوزات السناتر».
 *
 * The six numbers, one card per centre (its counts and its money — tapping it
 * filters the list), then the reservations themselves, newest first, each
 * with its phone, its answers, the transfer and the decision buttons.
 */
export default async function ReservationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await featureEnabled('centerReservations'))) notFound();
  const raw = await searchParams;
  const current: Search = {
    center: raw.center && UUID.test(raw.center) ? raw.center : undefined,
    status: RESERVATION_STATUSES.includes(raw.status as ReservationStatus) ? raw.status : undefined,
    q: raw.q?.trim().slice(0, 80) || undefined,
    page: raw.page && /^\d{1,5}$/.test(raw.page) && raw.page !== '1' ? raw.page : undefined,
  };

  const query = new URLSearchParams();
  if (current.center) query.set('centerId', current.center);
  if (current.status) query.set('status', current.status);
  if (current.q) query.set('q', current.q);
  if (current.page) query.set('page', current.page);

  const [session, data, setup] = await Promise.all([
    getSession(),
    adminGet(`/api/admin/center-reservations?${query.toString()}`, AdminReservationsSchema),
    adminGet('/api/admin/center-reservations/setup', ReservationSetupSchema),
  ]);
  const canWrite = can(session, 'center:write');
  const { totals } = data;
  const pages = Math.max(1, Math.ceil(data.matching / data.pageSize));
  const pageUrl = `${SITE_URL}/reserve`;
  const isOpen = setup.settings.isOpen && setup.centers.some((center) => center.reservationsOpen && center.isActive);

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">{a.eyebrow}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{a.title}</h1>
            <Chip color={isOpen ? 'var(--ok)' : 'var(--err)'}>{isOpen ? a.pageOpen : a.pageClosed}</Chip>
          </div>
          <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">{a.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyLinkButton url={pageUrl} />
          <a
            href="/reserve"
            target="_blank"
            rel="noreferrer"
            style={tone('var(--viz-2)')}
            className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {a.openPage}
          </a>
          {canWrite ? (
            <Link
              href="/admin/centers/reservations/setup"
              style={tone('var(--a-9)')}
              className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
            >
              <Settings className="size-4" aria-hidden="true" />
              {a.setup}
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
        {a.pageLink}:
        <Ltr className="truncate font-semibold text-fg">{pageUrl}</Ltr>
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 2xl:grid-cols-6">
        <StatTile color="var(--viz-2)" icon={ClipboardList} value={totals.total} label={a.tiles.total} />
        <StatTile color="var(--warn)" icon={UserRoundX} value={totals.started} label={a.tiles.started} />
        <StatTile color="var(--info)" icon={Hourglass} value={totals.submitted} label={a.tiles.submitted} />
        <StatTile color="var(--ok)" icon={BadgeCheck} value={totals.confirmed} label={a.tiles.confirmed} />
        <StatTile color="var(--viz-1)" icon={Wallet} value={`${formatEGP(totals.confirmedCents)} ج`} label={a.tiles.confirmedMoney} />
        <StatTile color="var(--viz-5)" icon={WalletCards} value={`${formatEGP(totals.submittedCents)} ج`} label={a.tiles.submittedMoney} />
      </div>

      {data.byCenter.length > 0 ? (
        <section className="mt-6" aria-labelledby="per-center">
          <h2 id="per-center" className="mb-2 text-[length:var(--fs-title-4)] font-semibold text-fg">
            {a.perCenter}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {data.byCenter.map((center, index) => (
              <CenterTile
                key={center.centerId}
                center={center}
                color={centerHue(index)}
                active={current.center === center.centerId}
                href={hrefWith(current, { center: current.center === center.centerId ? undefined : center.centerId, page: undefined })}
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-8 text-center">
          <Building2 className="size-8 text-fg-muted" aria-hidden="true" />
          <p className="font-semibold text-fg">{a.noCenters}</p>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{a.noCentersHint}</p>
        </div>
      )}

      {/* Filters: status tabs, then search. Plain links and a GET form — the URL is the state. */}
      <div className="mt-6 flex flex-col gap-3">
        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={a.title}>
          <FilterTab href={hrefWith(current, { status: undefined, page: undefined })} active={!current.status} color="var(--viz-2)">
            {a.filterAll} <Ltr>{totals.total}</Ltr>
          </FilterTab>
          {RESERVATION_STATUSES.map((status) => (
            <FilterTab
              key={status}
              href={hrefWith(current, { status, page: undefined })}
              active={current.status === status}
              color={STATUS_HUE[status]}
            >
              {a.status[status]} <Ltr>{totals[status]}</Ltr>
            </FilterTab>
          ))}
        </nav>
        <form method="get" action="/admin/centers/reservations" className="flex gap-2">
          {current.center ? <input type="hidden" name="center" value={current.center} /> : null}
          {current.status ? <input type="hidden" name="status" value={current.status} /> : null}
          <label htmlFor="reservation-search" className="sr-only">
            {a.search}
          </label>
          <input
            id="reservation-search"
            name="q"
            type="search"
            defaultValue={current.q ?? ''}
            placeholder={a.search}
            className="h-11 min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-3 text-[length:var(--fs-text-base)] text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-[color:var(--a-9)]"
          />
          <button
            type="submit"
            style={tone('var(--a-9)')}
            className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'h-11 md:h-11')}
          >
            <Search className="size-4" aria-hidden="true" />
            {a.searchSubmit}
          </button>
        </form>
      </div>

      {data.items.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <span style={tone('var(--viz-2)')} className={cn('grid size-14 place-items-center rounded-full', TINT_WELL)}>
            <ClipboardList className="size-7" aria-hidden="true" />
          </span>
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{a.empty}</p>
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{a.emptyHint}</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {data.items.map((reservation) => (
            <ReservationCard
              key={reservation.id}
              reservation={reservation}
              screenshotSrc={`/api/admin/center-reservations/${reservation.id}/screenshot`}
              showCenter={!current.center}
              actions={canWrite ? <ReservationActions reservation={reservation} /> : undefined}
            />
          ))}
        </div>
      )}

      {pages > 1 ? (
        <nav className="mt-5 flex items-center justify-center gap-3" aria-label={formatCopy(a.page, { page: data.page, pages })}>
          {data.page > 1 ? (
            <Link href={hrefWith(current, { page: String(data.page - 1) })} className={cn(ROW_BUTTON, ROW_BUTTON_TONE)} style={tone('var(--viz-2)')}>
              {a.prev}
            </Link>
          ) : null}
          <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{formatCopy(a.page, { page: data.page, pages })}</span>
          {data.page < pages ? (
            <Link href={hrefWith(current, { page: String(data.page + 1) })} className={cn(ROW_BUTTON, ROW_BUTTON_TONE)} style={tone('var(--viz-2)')}>
              {a.next}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

function FilterTab({ href, active, color, children }: { href: string; active: boolean; color: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={tone(color)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[length:var(--fs-text-sm)] font-semibold transition-colors',
        active
          ? 'border-[color:var(--ct-tone)] bg-[color-mix(in_oklab,var(--ct-tone)_20%,var(--n-2))] text-fg'
          : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </Link>
  );
}

function CenterTile({
  center,
  color,
  active,
  href,
}: {
  center: ReservationCenterStats;
  color: string;
  active: boolean;
  href: string;
}) {
  return (
    <div
      style={tone(color)}
      className={cn('flex flex-col gap-3 rounded-xl p-4', TINT_CARD, active && 'ring-2 ring-[color:var(--ct-tone)]')}
    >
      <Link href={href} className="flex items-center gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TINT_WELL)}>
          <Building2 className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[length:var(--fs-title-4)] font-semibold', TONE_TEXT)}>{center.centerName}</span>
          <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">
            {a.tiles.total}: <Ltr>{center.total}</Ltr>
          </span>
        </span>
        <span className="text-end">
          <span className={cn('block text-[length:var(--fs-title-4)] font-semibold tabular-nums', TONE_TEXT)}>
            <Ltr>{formatEGP(center.confirmedCents)}</Ltr> ج
          </span>
          <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">{a.tiles.confirmedMoney}</span>
        </span>
      </Link>
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniCount color="var(--ok)" value={center.confirmed} label={a.status.confirmed} />
        <MiniCount color="var(--info)" value={center.submitted} label={a.status.submitted} />
        <MiniCount color="var(--warn)" value={center.started} label={a.status.started} />
      </div>
      <Link
        href={`/center?centerId=${center.centerId}`}
        className="inline-flex items-center justify-center gap-1.5 text-[length:var(--fs-text-xs)] font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline"
      >
        <LayoutDashboard className="size-3.5" aria-hidden="true" />
        {a.viewPanel}
      </Link>
    </div>
  );
}

function MiniCount({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <span style={tone(color)} className="rounded-lg bg-[color-mix(in_oklab,var(--ct-tone)_12%,var(--n-2))] px-1 py-1.5">
      <span className={cn('block text-[length:var(--fs-title-4)] font-semibold tabular-nums', TONE_TEXT)}>{value}</span>
      <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">{label}</span>
    </span>
  );
}
