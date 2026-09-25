import Link from 'next/link';
import {
  Armchair,
  CalendarClock,
  ClipboardCheck,
  HandCoins,
  MapPin,
  Phone,
  ScanLine,
  School,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { AdminCentersSchema, type AdminCenter, type AdminSlot } from '@ayman/contracts/admin/centers';
import { DAY_NAMES_AR, formatMinute } from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { formatEGP } from '@/lib/price';
import { can, getSession } from '@/lib/session';
import { CenterActions, CenterDialog, SlotActions, SlotDialog, SlotSwitches } from './center-controls';
import {
  Chip,
  Ltr,
  Meter,
  ROW_BUTTON,
  ROW_BUTTON_TONE,
  StatTile,
  TINT_WELL,
  TONE_TEXT,
  centerHue,
  dayHue,
  tone,
  yearLabel,
} from './centers-ui';

const c = copy.admin.centers;

export const metadata = { title: c.title };

/**
 * `/admin/centers` — «السناتر».
 *
 * The five numbers, then one big card per centre with its week of slots
 * inside it. Every slot carries the three doors out of this page — its
 * students, its sheet, and the scanner already pointed at it — because the
 * question that brings someone here is almost always about ONE class.
 *
 * Write controls render only for `center:write`, the scanner link only for
 * `center:attendance` — the permissions the API itself checks, so a role that
 * may only read never meets a button that 403s.
 */
export default async function CentersPage() {
  const [session, data] = await Promise.all([
    getSession(),
    adminGet('/api/admin/centers', AdminCentersSchema),
  ]);
  const canWrite = can(session, 'center:write');
  const canScan = can(session, 'center:attendance');
  const { totals } = data;

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
            {c.eyebrow}
          </p>
          <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
          <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canScan ? (
            <Link
              href="/admin/centers/scan"
              style={tone('var(--ok)')}
              className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
            >
              <ScanLine className="size-4" aria-hidden="true" />
              {c.openScanner}
            </Link>
          ) : null}
          <Link
            href="/admin/centers/finance"
            style={tone('var(--viz-1)')}
            className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
          >
            <HandCoins className="size-4" aria-hidden="true" />
            {c.openFinance}
          </Link>
          {canWrite ? <CenterDialog /> : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 2xl:grid-cols-5">
        <StatTile color="var(--viz-2)" icon={School} value={totals.centers} label={c.tiles.centers} />
        <StatTile color="var(--viz-3)" icon={CalendarClock} value={totals.slots} label={c.tiles.slots} />
        <StatTile color="var(--info)" icon={Users} value={totals.booked} label={c.tiles.booked} />
        <StatTile
          color="var(--ok)"
          icon={UserCheck}
          value={totals.attendedThisMonth}
          label={c.tiles.attended}
        />
        <StatTile
          color="var(--viz-1)"
          icon={Wallet}
          value={`${formatEGP(totals.revenueThisMonthCents)} ج`}
          label={c.tiles.revenue}
          wide
        />
      </div>

      {data.centers.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <span
            style={tone('var(--viz-2)')}
            className={cn('grid size-14 place-items-center rounded-full', TINT_WELL)}
          >
            <School className="size-7" aria-hidden="true" />
          </span>
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.empty}</p>
          <p className="max-w-[32rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.emptyHint}</p>
          {canWrite ? <CenterDialog /> : null}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {data.centers.map((center, index) => (
            <CenterCard
              key={center.id}
              center={center}
              color={centerHue(index)}
              canWrite={canWrite}
              canScan={canScan}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function CenterCard({
  center,
  color,
  canWrite,
  canScan,
}: {
  center: AdminCenter;
  color: string;
  canWrite: boolean;
  canScan: boolean;
}) {
  const booked = center.slots.reduce((sum, slot) => sum + slot.booked, 0);
  return (
    <section
      style={tone(color)}
      aria-labelledby={`center-${center.id}`}
      className={cn(
        'overflow-hidden rounded-xl border border-s-4 border-line border-s-[color:var(--ct-tone)] bg-surface-2',
        !center.isActive && 'opacity-80',
      )}
    >
      {/* The centre's band — its colour, name and the three ways to reach it. */}
      <header className="flex flex-col gap-3 bg-[color-mix(in_oklab,var(--ct-tone)_10%,var(--n-2))] p-4 sm:p-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('grid size-12 shrink-0 place-items-center rounded-xl', TINT_WELL)}>
            <School className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id={`center-${center.id}`}
                className={cn('text-[length:var(--fs-title-3)] font-semibold', TONE_TEXT)}
              >
                {center.name}
              </h2>
              <Chip color={center.isActive ? 'var(--ok)' : 'var(--err)'}>
                {center.isActive ? c.active : c.inactive}
              </Chip>
              <Chip color="var(--info)" icon={Users}>
                <Ltr>{booked}</Ltr>
              </Chip>
            </div>
            <div className="mt-1.5 flex flex-col gap-1 text-[length:var(--fs-text-sm)] text-fg-muted sm:flex-row sm:flex-wrap sm:gap-x-4">
              {center.address ? (
                <span className="flex min-w-0 items-start gap-1.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[color:var(--ct-tone)]" aria-hidden="true" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{center.address}</span>
                  {center.mapUrl ? (
                    <a
                      href={center.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 font-medium text-accent-text underline underline-offset-4 hover:no-underline"
                    >
                      {c.map}
                    </a>
                  ) : null}
                </span>
              ) : center.mapUrl ? (
                <a
                  href={center.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-accent-text underline underline-offset-4 hover:no-underline"
                >
                  <MapPin className="size-4" aria-hidden="true" />
                  {c.map}
                </a>
              ) : null}
              {center.phone ? (
                <a
                  href={`tel:${center.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-1.5 hover:text-fg"
                >
                  <Phone className="size-4 shrink-0 text-[color:var(--ct-tone)]" aria-hidden="true" />
                  <Ltr>{center.phone}</Ltr>
                </a>
              ) : null}
            </div>
          </div>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <SlotDialog centerId={center.id} centerName={center.name} />
            <CenterActions center={center} />
          </div>
        ) : null}
      </header>

      <div className="p-3 sm:p-4">
        {center.slots.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line bg-surface-1 px-4 py-8 text-center">
            <CalendarClock className="size-6 text-[color:var(--ct-tone)]" aria-hidden="true" />
            <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.noSlots}</p>
            {canWrite ? (
              <SlotDialog centerId={center.id} centerName={center.name} prominent />
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2 min-[1800px]:grid-cols-3">
            {center.slots.map((slot) => (
              <li key={slot.id} className="min-w-0">
                <SlotCard
                  slot={slot}
                  centerId={center.id}
                  centerName={center.name}
                  canWrite={canWrite}
                  canScan={canScan}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SlotCard({
  slot,
  centerId,
  centerName,
  canWrite,
  canScan,
}: {
  slot: AdminSlot;
  centerId: string;
  centerName: string;
  canWrite: boolean;
  canScan: boolean;
}) {
  const color = dayHue(slot.dayOfWeek);
  const fill = slot.capacity ? slot.booked / slot.capacity : 0;
  const fillColor = fill >= 1 ? 'var(--err)' : fill >= 0.8 ? 'var(--warn)' : 'var(--ok)';

  return (
    <article
      style={tone(color)}
      className={cn(
        'flex h-full flex-col gap-3 rounded-lg border border-line bg-surface-1 p-3.5',
        !slot.isActive && 'border-dashed',
      )}
    >
      <div className="flex items-start gap-3">
        {/* The day as a coloured block — the thing the eye looks for first in
            a week of slots. */}
        <span
          className={cn(
            'flex w-16 shrink-0 flex-col items-center justify-center rounded-lg px-1 py-2 text-center',
            TINT_WELL,
          )}
        >
          <span className="text-[length:var(--fs-text-sm)] font-bold leading-tight">
            {DAY_NAMES_AR[slot.dayOfWeek]}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">
            {formatMinute(slot.startMinute)} – {formatMinute(slot.endMinute)}
          </p>
          {slot.label ? (
            <p className="truncate text-[length:var(--fs-text-sm)] text-fg-muted">{slot.label}</p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip color={slot.year === null ? 'var(--viz-5)' : 'var(--viz-3)'}>{yearLabel(slot.year)}</Chip>
            {slot.isFull ? <Chip color="var(--warn)">{c.full}</Chip> : null}
            {!slot.isActive ? <Chip color="var(--err)">{c.inactive}</Chip> : null}
          </div>
        </div>
      </div>

      <div className="rounded-md bg-surface-2 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[length:var(--fs-text-sm)]">
          <span className="inline-flex items-center gap-1.5 font-medium text-fg">
            <Armchair className="size-4 text-info" aria-hidden="true" />
            {slot.capacity
              ? formatCopy(c.bookedOf, { booked: slot.booked, capacity: slot.capacity })
              : formatCopy(c.bookedUnlimited, { booked: slot.booked })}
          </span>
          {slot.seatsLeft !== null ? (
            <span
              className={cn(
                'text-[length:var(--fs-text-xs)] font-semibold',
                slot.seatsLeft > 0 ? 'text-fg-muted' : 'text-err',
              )}
            >
              {slot.seatsLeft > 0 ? formatCopy(c.seatsLeft, { count: slot.seatsLeft }) : c.noSeatsLeft}
            </span>
          ) : null}
        </div>
        {slot.capacity ? (
          <Meter value={slot.booked} max={slot.capacity} color={fillColor} />
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Wallet className="size-3.5 text-[color:var(--viz-1)]" aria-hidden="true" />
            {slot.priceCents === null
              ? c.noPrice
              : formatCopy(c.perClass, { price: formatEGP(slot.priceCents) })}
          </span>
          <span className="inline-flex items-center gap-1">
            <ClipboardCheck className="size-3.5 text-ok" aria-hidden="true" />
            {formatCopy(c.sessionsHeld, { count: slot.sessions })}
          </span>
        </div>
      </div>

      {canWrite ? <SlotSwitches slot={slot} /> : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/centers/slots/${slot.id}`}
          style={tone('var(--info)')}
          className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
        >
          <Users className="size-4" aria-hidden="true" />
          {c.students}
        </Link>
        <Link
          href={`/admin/centers/slots/${slot.id}/attendance`}
          style={tone('var(--viz-3)')}
          className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
        >
          <ClipboardCheck className="size-4" aria-hidden="true" />
          {c.attendance}
        </Link>
        {canScan && slot.isActive ? (
          <Link
            href={`/admin/centers/scan?slot=${slot.id}`}
            style={tone('var(--ok)')}
            className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
          >
            <ScanLine className="size-4" aria-hidden="true" />
            {c.scanHere}
          </Link>
        ) : null}
        {canWrite ? <SlotActions slot={slot} centerId={centerId} centerName={centerName} /> : null}
      </div>
    </article>
  );
}
