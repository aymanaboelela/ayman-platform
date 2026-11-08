'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RefreshCw, Search } from 'lucide-react';
import {
  RESERVATION_STATUSES,
  reservationGradeLabel,
  type AdminReservation,
  type ReservationStatus,
} from '@ayman/contracts/center-reservations';
import { formatSlotTime } from '@ayman/contracts/centers';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { egyptianPhoneForLabel } from '@ayman/contracts/phone';
import { cn } from '@ayman/ui/lib/cn';
import { Ltr, ROW_BUTTON, ROW_BUTTON_TONE, tone } from '@/app/(admin)/admin/centers/centers-ui';
import { ReservationCard, STATUS_HUE } from '@/app/(admin)/admin/centers/reservations/reservation-card';

const a = reservationsCopy.admin;
const page = reservationsCopy.page;
const t = reservationsCopy.portal;

/** Spreadsheet cell: quoted, inner quotes doubled, and a leading `=+-@` defused. */
function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * The list, filtered in the browser — a centre's whole season is a few
 * hundred rows, all already on the page, so a status tap or a search needs no
 * round trip. «تنزيل Excel» writes the same rows as a CSV with a BOM, which is
 * what makes Excel read the Arabic as Arabic.
 */
export function PortalList({
  reservations,
  centerName,
  previewCenterId,
}: {
  reservations: AdminReservation[];
  centerName: string;
  previewCenterId: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ReservationStatus | null>(null);
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const out: Record<ReservationStatus, number> = { started: 0, submitted: 0, confirmed: 0, rejected: 0, cancelled: 0 };
    for (const r of reservations) out[r.status] += 1;
    return out;
  }, [reservations]);

  const shown = useMemo(() => {
    const needle = q.trim();
    const digits = needle.replace(/\D/g, '').replace(/^0/, '');
    return reservations.filter((r) => {
      if (status && r.status !== status) return false;
      if (!needle) return true;
      return (
        r.fullName.includes(needle) ||
        (digits.length >= 3 && (r.phone.includes(digits) || (r.senderPhone ?? '').includes(digits))) ||
        String(r.number) === needle
      );
    });
  }, [reservations, status, q]);

  function download() {
    const head = ['#', 'الاسم', 'الموبايل', 'السنة', 'المجموعة', 'نوع الدراسة', 'النظام', 'النوع', 'الحالة', 'سعر الحصة', 'المدفوع', 'اتحوّل من', 'التاريخ'];
    const rows = shown.map((r) => [
      r.number,
      r.fullName,
      egyptianPhoneForLabel(r.phone),
      reservationGradeLabel(r.gradeSlug),
      r.slot ? `${r.slot.label ? `${r.slot.label} · ` : ''}${formatSlotTime(r.slot)}` : '',
      r.track ? (r.track === 'arabic' ? page.trackArabic : page.trackLanguages) : '',
      r.system ? (r.system === 'azhar' ? page.systemAzhar : page.systemGeneral) : '',
      r.gender ? (r.gender === 'female' ? page.genderFemale : page.genderMale) : '',
      a.status[r.status],
      r.sessionPriceCents === null ? '' : r.sessionPriceCents / 100,
      r.amountCents / 100,
      r.senderPhone ? egyptianPhoneForLabel(r.senderPhone) : '',
      new Date(r.createdAt).toLocaleString('ar-EG-u-nu-latn', { timeZone: 'Africa/Cairo' }),
    ]);
    const csv = '﻿' + [head, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${centerName}-حجوزات.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const screenshotFor = (id: string) =>
    `/api/center-portal/reservations/${id}/screenshot${previewCenterId ? `?centerId=${previewCenterId}` : ''}`;

  return (
    <section className="mt-6 flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="portal-search" className="sr-only">
            {t.search}
          </label>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
          <input
            id="portal-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={t.search}
            className="h-11 w-full rounded-md border border-line bg-surface-2 ps-9 pe-3 text-[length:var(--fs-text-base)] text-fg placeholder:text-fg-muted"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.refresh()} style={tone('var(--viz-2)')} className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'h-11 md:h-11')}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {t.refresh}
          </button>
          <button type="button" onClick={download} disabled={shown.length === 0} style={tone('var(--ok)')} className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'h-11 md:h-11')}>
            <Download className="size-4" aria-hidden="true" />
            {t.export}
          </button>
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label={a.title}>
        <Tab active={status === null} color="var(--viz-2)" onClick={() => setStatus(null)}>
          {a.filterAll} <Ltr>{reservations.length}</Ltr>
        </Tab>
        {RESERVATION_STATUSES.map((s) => (
          <Tab key={s} active={status === s} color={STATUS_HUE[s]} onClick={() => setStatus(s)}>
            {a.status[s]} <Ltr>{counts[s]}</Ltr>
          </Tab>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface-2 px-6 py-10 text-center text-fg-muted">{a.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shown.map((reservation) => (
            <ReservationCard key={reservation.id} reservation={reservation} screenshotSrc={screenshotFor(reservation.id)} showCenter={false} />
          ))}
        </div>
      )}
    </section>
  );
}

function Tab({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={tone(color)}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[length:var(--fs-text-sm)] font-semibold transition-colors',
        active
          ? 'border-[color:var(--ct-tone)] bg-[color-mix(in_oklab,var(--ct-tone)_20%,var(--n-2))] text-fg'
          : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}
