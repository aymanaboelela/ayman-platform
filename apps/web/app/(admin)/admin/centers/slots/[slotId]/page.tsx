import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  Armchair,
  CalendarCheck2,
  ChevronRight,
  ClipboardCheck,
  Percent,
  Phone,
  ScanLine,
  UserRound,
  Users,
} from 'lucide-react';
import { AdminSlotBookingsSchema, type AdminBookedStudent } from '@ayman/contracts/admin/centers';
import { formatSlotTime } from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { WhatsappButton } from '@/components/admin/whatsapp-button';
import { SlotHeader } from './slot-header';
import {
  Chip,
  Ltr,
  Meter,
  ROW_BUTTON,
  ROW_BUTTON_TONE,
  StatTile,
  dateOfIso,
  percent,
  rateHue,
  tone,
  yearLabel,
} from '../../centers-ui';

const c = copy.admin.centers;
const b = c.bookings;

export const metadata = { title: b.eyebrow };

/**
 * `/admin/centers/slots/[slotId]` — who booked one slot, and how often each
 * of them actually came.
 *
 * Cards below `2xl` and a table from there: the admin shell's sidebar takes
 * 260px from `md` up, and a seven-column table at a 1280px viewport clipped its
 * own buttons on the unlock-codes screen (measured) — same call here.
 */
export default async function SlotBookingsPage({ params }: { params: Promise<{ slotId: string }> }) {
  const { slotId } = await params;
  // The API's column is a uuid; a pasted half-id would otherwise reach Prisma
  // and come back a 500 rather than «مش موجود».
  if (!z.uuid().safeParse(slotId).success) notFound();

  const [session, data] = await Promise.all([
    getSession(),
    adminGetOrNotFound(`/api/admin/centers/slots/${slotId}/bookings`, AdminSlotBookingsSchema),
  ]);
  const canScan = can(session, 'center:attendance');
  const { slot, students } = data;

  const attended = students.reduce((sum, row) => sum + row.attended, 0);
  const absent = students.reduce((sum, row) => sum + row.absent, 0);
  const rate = percent(attended, attended + absent);

  return (
    <>
      <Link
        href="/admin/centers"
        className="mb-4 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
        {c.backToCenters}
      </Link>

      <SlotHeader
        eyebrow={`${b.eyebrow} · ${data.centerName}`}
        title={slot.label ? `${slot.label} — ${formatSlotTime(slot)}` : formatSlotTime(slot)}
        year={slot.year}
        full={slot.isFull}
        active={slot.isActive}
        priceCents={slot.priceCents}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/admin/centers/slots/${slot.id}/attendance`}
          style={tone('var(--viz-3)')}
          className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
        >
          <ClipboardCheck className="size-4" aria-hidden="true" />
          {c.attendance}
        </Link>
        {canScan && slot.isActive ? (
          <Link
            href={`/admin/centers/scan?slot=${slot.id}`}
            style={tone('var(--ok)')}
            className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
          >
            <ScanLine className="size-4" aria-hidden="true" />
            {c.scanHere}
          </Link>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile
          color="var(--info)"
          icon={Users}
          value={slot.capacity ? `${slot.booked} / ${slot.capacity}` : slot.booked}
          label={b.tiles.booked}
        />
        <StatTile color="var(--viz-3)" icon={CalendarCheck2} value={slot.sessions} label={b.tiles.sessions} />
        <StatTile
          color={rateHue(rate)}
          icon={Percent}
          value={rate === null ? '—' : `${rate}%`}
          label={b.tiles.rate}
        />
        <StatTile
          color="var(--viz-2)"
          icon={Armchair}
          value={slot.seatsLeft === null ? b.unlimited : slot.seatsLeft}
          label={b.tiles.seats}
        />
      </div>

      {students.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <Users className="size-8 text-info" aria-hidden="true" />
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{b.empty}</p>
          <p className="max-w-[30rem] text-[length:var(--fs-text-sm)] text-fg-muted">{b.emptyHint}</p>
        </div>
      ) : (
        <>
          <ul className="mt-5 grid gap-3 xl:grid-cols-2 2xl:hidden">
            {students.map((row) => (
              <li key={row.userId} className="min-w-0">
                <StudentCard row={row} />
              </li>
            ))}
          </ul>

          <div className="mt-5 hidden overflow-x-auto rounded-lg border border-line bg-surface-2 2xl:block">
            <table className="w-full border-collapse text-[length:var(--fs-text-sm)]">
              <thead className="bg-surface-3 text-fg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{b.number}</th>
                  <th className="px-3 py-3 text-start font-medium">{b.student}</th>
                  <th className="px-3 py-3 text-start font-medium">{b.phone}</th>
                  <th className="px-3 py-3 text-start font-medium">{b.fatherPhone}</th>
                  <th className="px-3 py-3 text-start font-medium">{b.year}</th>
                  <th className="px-3 py-3 text-start font-medium">{b.record}</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">{c.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((row) => (
                  <tr key={row.userId} className="border-t border-line-subtle align-top">
                    <td className="px-4 py-3.5">
                      <NumberBadge value={row.studentNumber} />
                    </td>
                    <td className="px-3 py-3.5">
                      <NameCell row={row} />
                    </td>
                    <td className="px-3 py-3.5">
                      <PhoneCell phone={row.phone} label={b.whatsapp} />
                    </td>
                    <td className="px-3 py-3.5">
                      <PhoneCell phone={row.fatherPhone} label={b.whatsappFather} />
                    </td>
                    <td className="px-3 py-3.5">
                      <YearChips row={row} />
                    </td>
                    <td className="min-w-[12rem] px-3 py-3.5">
                      <RecordCell row={row} />
                    </td>
                    <td className="px-4 py-3.5 text-end">
                      <OpenStudent userId={row.userId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────────── */

function StudentCard({ row }: { row: AdminBookedStudent }) {
  const rate = percent(row.attended, row.attended + row.absent);
  return (
    <article
      style={tone(rateHue(rate))}
      className="flex h-full flex-col gap-3 rounded-lg border border-line border-s-4 border-s-[color:var(--ct-tone)] bg-surface-2 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <NameCell row={row} />
        <NumberBadge value={row.studentNumber} />
      </div>
      <YearChips row={row} />
      <dl className="grid grid-cols-1 gap-3 rounded-md bg-surface-1 p-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{b.phone}</dt>
          <dd className="mt-1">
            <PhoneCell phone={row.phone} label={b.whatsapp} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{b.fatherPhone}</dt>
          <dd className="mt-1">
            <PhoneCell phone={row.fatherPhone} label={b.whatsappFather} />
          </dd>
        </div>
      </dl>
      <RecordCell row={row} />
      <div className="mt-auto flex justify-end">
        <OpenStudent userId={row.userId} />
      </div>
    </article>
  );
}

function NumberBadge({ value }: { value: number }) {
  return (
    <span
      style={tone('var(--viz-5)')}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[color-mix(in_oklab,var(--ct-tone)_35%,var(--border))] bg-[color-mix(in_oklab,var(--ct-tone)_10%,var(--n-2))] px-2 py-0.5 font-mono text-[length:var(--fs-text-sm)] font-semibold text-fg"
    >
      <span className="text-[length:var(--fs-mono-label)] text-fg-muted">{b.number}</span>
      <Ltr>{value}</Ltr>
    </span>
  );
}

function NameCell({ row }: { row: AdminBookedStudent }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/admin/students/${row.userId}`}
        className="inline-flex max-w-full items-center gap-1.5 font-semibold text-fg underline decoration-dotted decoration-fg-faint underline-offset-4 hover:text-accent-text hover:decoration-solid"
      >
        <UserRound className="size-4 shrink-0 text-info" aria-hidden="true" />
        <span className="truncate">{row.fullName}</span>
      </Link>
      <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
        {formatCopy(b.bookedOn, { date: dateOfIso(row.bookedAt) })}
      </p>
    </div>
  );
}

function YearChips({ row }: { row: AdminBookedStudent }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip color="var(--viz-3)">{row.year === null ? '—' : yearLabel(row.year)}</Chip>
      {row.studyType ? (
        <Chip color={row.studyType === 'azhari' ? 'var(--viz-6)' : 'var(--viz-2)'}>
          {b.studyTypes[row.studyType]}
        </Chip>
      ) : null}
    </div>
  );
}

function PhoneCell({ phone, label }: { phone: string | null; label: string }) {
  if (!phone) return <span className="text-fg-faint">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-fg">
        <Phone className="size-3.5 shrink-0 text-fg-muted" aria-hidden="true" />
        <Ltr>{phone}</Ltr>
      </span>
      <WhatsappButton phone={phone} label={label} size="sm" />
    </div>
  );
}

/** Attended in green, absent in red, the rate as a bar in its own hue. */
function RecordCell({ row }: { row: AdminBookedStudent }) {
  const held = row.attended + row.absent;
  if (held === 0) {
    return <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{b.noClassesYet}</p>;
  }
  const rate = percent(row.attended, held);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Chip color="var(--ok)">{formatCopy(b.attendedCount, { count: row.attended })}</Chip>
        <Chip color="var(--err)">{formatCopy(b.absentCount, { count: row.absent })}</Chip>
        <span className="text-[length:var(--fs-text-sm)] font-semibold tabular-nums text-fg">{rate}%</span>
      </div>
      <Meter value={row.attended} max={held} color={rateHue(rate)} />
    </div>
  );
}

function OpenStudent({ userId }: { userId: string }) {
  return (
    <Link
      href={`/admin/students/${userId}`}
      style={tone('var(--info)')}
      className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
    >
      <UserRound className="size-4" aria-hidden="true" />
      {b.openStudent}
    </Link>
  );
}
