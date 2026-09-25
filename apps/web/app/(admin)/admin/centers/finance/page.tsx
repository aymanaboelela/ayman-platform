import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Coins,
  School,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { CenterFinanceSchema } from '@ayman/contracts/admin/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { can, getSession } from '@/lib/session';
import { FinanceTabs } from '../../finance/finance-tabs';
import {
  Meter,
  StatTile,
  TINT_WELL,
  TONE_TEXT,
  cairoTodayKey,
  centerHue,
  percent,
  tone,
} from '../centers-ui';

const c = copy.admin.centers;
const f = c.finance;

export const metadata = { title: f.title };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `2026-09` shifted by whole months — arithmetic on the pair, no Date, so
 *  no zone can move a month boundary. */
function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const total = year * 12 + (index - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

const monthName = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
function monthLabel(month: string): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return monthName.format(new Date(Date.UTC(year, index - 1, 1)));
}

const hrefFor = (month: string) => `/admin/centers/finance?month=${month}`;

/**
 * `/admin/centers/finance` — «فلوس السناتر».
 *
 * A month at a time, because that is how a centre is paid: every attendance
 * carries the class price it was scanned at, so this is a sum of what was
 * actually recorded at the door — not bookings times a price, which would
 * count every absent student as paid.
 */
export default async function CentersFinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = typeof params.month === 'string' ? params.month : undefined;
  const requested = raw && MONTH.test(raw) ? raw : undefined;

  const [session, finance] = await Promise.all([
    getSession(),
    adminGet(
      `/api/admin/centers/finance${requested ? `?month=${requested}` : ''}`,
      CenterFinanceSchema,
    ),
  ]);
  const month = finance.month;
  const current = cairoTodayKey().slice(0, 7);
  // The strip of recent months: the six up to this one, so the pill for the
  // month on screen is always among them unless it is older than that.
  const recent = Array.from({ length: 6 }, (_, index) => shiftMonth(current, index - 5));
  const average = finance.attendances > 0 ? Math.round(finance.totalCents / finance.attendances) : null;
  const withAttendance = finance.byCenter.filter((center) => center.attendances > 0).length;

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {f.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{f.title}</h1>
      <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">{f.subtitle}</p>

      {/* The accounts' own tabs, for whoever also reads the other halves —
          without `payment:read` they would be three doors onto a 403. */}
      {can(session, 'payment:read') ? <FinanceTabs active="/admin/centers/finance" /> : null}

      {/* ── The month ────────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <MonthArrow href={hrefFor(shiftMonth(month, -1))} label={f.prev}>
            <ChevronRight className="size-5" aria-hidden="true" />
          </MonthArrow>
          <p className="min-w-0 flex-1 text-center text-[length:var(--fs-title-4)] font-semibold text-fg lg:min-w-[10rem]">
            {monthLabel(month)}
          </p>
          <MonthArrow
            href={month < current ? hrefFor(shiftMonth(month, 1)) : null}
            label={f.next}
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </MonthArrow>
        </div>
        <nav aria-label={f.title} className="flex flex-wrap gap-1.5">
          {recent.map((option) => {
            const active = option === month;
            return (
              <Link
                key={option}
                href={hrefFor(option)}
                aria-current={active ? 'page' : undefined}
                scroll={false}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-3 text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms]',
                  active
                    ? 'border-accent bg-accent text-[#1A1206]'
                    : 'border-line bg-surface-1 text-fg-muted hover:text-fg',
                )}
              >
                {option === current ? f.thisMonth : monthLabel(option)}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile
          color="var(--viz-1)"
          icon={Wallet}
          value={`${formatEGP(finance.totalCents)} ج`}
          label={f.total}
        />
        <StatTile color="var(--ok)" icon={UserCheck} value={finance.attendances} label={f.attendances} />
        <StatTile
          color="var(--viz-3)"
          icon={Coins}
          value={average === null ? '—' : `${formatEGP(average)} ج`}
          label={f.average}
        />
        <StatTile color="var(--viz-2)" icon={School} value={withAttendance} label={f.centers} />
      </div>

      {finance.byCenter.length === 0 || finance.attendances === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <Wallet className="size-8 text-[color:var(--viz-1)]" aria-hidden="true" />
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{f.empty}</p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 2xl:grid-cols-2">
          {finance.byCenter.map((center, index) => {
            const hue = centerHue(index);
            const share = percent(center.totalCents, finance.totalCents);
            const top = Math.max(1, ...center.bySlot.map((slot) => slot.totalCents));
            return (
              <section
                key={center.centerId}
                style={tone(hue)}
                className="overflow-hidden rounded-xl border border-s-4 border-line border-s-[color:var(--ct-tone)] bg-surface-2"
              >
                <header className="flex flex-wrap items-center gap-3 bg-[color-mix(in_oklab,var(--ct-tone)_10%,var(--n-2))] p-4">
                  <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', TINT_WELL)}>
                    <School className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className={cn('truncate text-[length:var(--fs-title-4)] font-semibold', TONE_TEXT)}>
                      {center.centerName}
                    </h2>
                    <p className="text-[length:var(--fs-text-xs)] text-fg-muted">
                      {formatCopy(f.attendancesCount, { count: center.attendances })}
                      {share !== null ? ` · ${formatCopy(f.share, { percent: share })}` : ''}
                    </p>
                  </div>
                  <p className={cn('text-[length:var(--fs-title-3)] font-bold tabular-nums', TONE_TEXT)}>
                    {formatEGP(center.totalCents)} ج
                  </p>
                </header>
                <div className="p-4">
                  <Meter value={center.totalCents} max={finance.totalCents} color={hue} />
                  {center.bySlot.length > 0 ? (
                    <>
                      <h3 className="mt-4 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-semibold text-fg">
                        <CalendarClock className="size-4 text-[color:var(--ct-tone)]" aria-hidden="true" />
                        {f.slotsTitle}
                      </h3>
                      <ul className="mt-2 flex flex-col gap-2.5">
                        {center.bySlot.map((slot) => (
                          <li key={slot.slotId} className="rounded-md bg-surface-1 p-2.5">
                            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <Link
                                href={`/admin/centers/slots/${slot.slotId}/attendance`}
                                className="min-w-0 text-[length:var(--fs-text-sm)] font-medium text-fg hover:text-accent-text"
                              >
                                {slot.label}
                              </Link>
                              <span className="text-[length:var(--fs-text-sm)] tabular-nums text-fg">
                                <span className="font-semibold">{formatEGP(slot.totalCents)} ج</span>
                                <span className="text-fg-muted">
                                  {' · '}
                                  {formatCopy(f.attendancesCount, { count: slot.attendances })}
                                </span>
                              </span>
                            </div>
                            <Meter value={slot.totalCents} max={top} color={hue} />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function MonthArrow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  const shape = 'grid size-10 shrink-0 place-items-center rounded-lg border';
  if (href === null) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(shape, 'border-line text-fg-faint opacity-60')}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      scroll={false}
      className={cn(shape, 'border-line bg-surface-1 text-fg hover:border-accent/50 hover:text-accent-text')}
    >
      {children}
    </Link>
  );
}
