import Link from 'next/link';
import { CalendarDays, Check, ClipboardCheck, School, Users, X } from 'lucide-react';
import {
  AdminCentersSchema,
  StudentAttendanceSchema,
  type AdminCenters,
  type StudentAttendance,
} from '@ayman/contracts/admin/centers';
import { formatSlotTime } from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { AdminApiError, adminGet } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import {
  Chip,
  Ltr,
  Meter,
  ROW_BUTTON,
  ROW_BUTTON_TONE,
  TINT_WELL,
  dateOfIso,
  fullDate,
  percent,
  rateHue,
  tone,
  weekday,
} from '../../centers/centers-ui';
import { CenterBookingControl, type BookingSlotOption } from './center-booking-control';

const c = copy.admin.centers.student;

/** How many classes the panel lists before «و١٢ حصة كمان» — the whole record
 *  is on the slot's sheet, one click away. */
const ENTRIES_SHOWN = 12;

/**
 * `null` = there is nothing to show and nothing to say: an account with no
 * student profile (404), or an operator without `center:read` (403) — on an
 * instructor's stack that is every student page, and a «not allowed» panel
 * there would be noise about a feature they do not run. Anything else is a
 * real failure and says so.
 */
async function load<T>(read: () => Promise<T>): Promise<T | null | 'error'> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof AdminApiError && (error.status === 404 || error.status === 403)) return null;
    return 'error';
  }
}

/**
 * «السنتر والحضور» on a student's record — the booking, a way to move it,
 * and every class they sat or missed.
 *
 * Its own async component behind a Suspense boundary, like the analytics
 * record: two more reads, neither of which the profile form above should wait
 * on, and both allowed to fail without taking the page with them.
 *
 * The feature appears by data, as on the student side: a stack with no centre
 * and a student with no record here renders nothing at all.
 */
export async function CenterAttendanceSection({ userId }: { userId: string }) {
  const [session, attendance, centers] = await Promise.all([
    getSession(),
    load(() =>
      adminGet(`/api/admin/centers/students/${encodeURIComponent(userId)}/attendance`, StudentAttendanceSchema),
    ),
    load(() => adminGet('/api/admin/centers', AdminCentersSchema)),
  ]);

  if (attendance === null) return null;
  if (attendance === 'error') {
    return (
      <div className="rounded-lg border border-dashed border-line p-6 text-center">
        <p className="text-fg-muted">{c.unavailable}</p>
      </div>
    );
  }
  const list: AdminCenters['centers'] = centers && centers !== 'error' ? centers.centers : [];
  if (list.length === 0 && attendance.booking === null && attendance.entries.length === 0) return null;

  const canWrite = can(session, 'center:write');
  const options: BookingSlotOption[] = list.flatMap((center) =>
    center.slots.map((slot) => ({
      id: slot.id,
      centerName: center.name,
      text: slot.label ? `${slot.label} — ${formatSlotTime(slot)}` : formatSlotTime(slot),
      active: center.isActive && slot.isActive,
      full: slot.full,
    })),
  );

  return (
    <section className="rounded-lg border border-line bg-surface-2">
      <header className="flex flex-wrap items-center gap-2 border-b border-line p-4">
        <span
          style={tone('var(--viz-2)')}
          className={cn('grid size-9 shrink-0 place-items-center rounded-lg', TINT_WELL)}
        >
          <School className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.title}</h2>
        <span className="ms-auto flex flex-wrap gap-1.5">
          <Chip color="var(--viz-5)">
            {c.studentNumber} <Ltr>{attendance.studentNumber}</Ltr>
          </Chip>
          <Chip color={attendance.attendanceMode === 'center' ? 'var(--viz-2)' : 'var(--info)'}>
            {attendance.attendanceMode ? c.attendanceModes[attendance.attendanceMode] : c.unknown}
          </Chip>
        </span>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <BookingBox attendance={attendance} />

        {canWrite ? (
          <CenterBookingControl
            userId={userId}
            currentSlotId={attendance.booking?.slotId ?? null}
            slots={options}
          />
        ) : null}

        <Stats attendance={attendance} />

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-[length:var(--fs-text-sm)] font-semibold text-fg">
            <CalendarDays className="size-4 text-[color:var(--viz-3)]" aria-hidden="true" />
            {c.entries}
          </h3>
          {attendance.entries.length === 0 ? (
            <p className="rounded-md bg-surface-1 p-3 text-[length:var(--fs-text-sm)] text-fg-muted">
              {c.noEntries}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line-subtle overflow-hidden rounded-md border border-line-subtle bg-surface-1">
                {attendance.entries.slice(0, ENTRIES_SHOWN).map((entry) => {
                  const present = entry.status === 'present';
                  return (
                    <li
                      key={`${entry.date}-${entry.slotLabel}`}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <span
                        style={tone(present ? 'var(--ok)' : 'var(--err)')}
                        className={cn('grid size-8 shrink-0 place-items-center rounded-md', TINT_WELL)}
                      >
                        {present ? (
                          <Check className="size-4" strokeWidth={3} aria-hidden="true" />
                        ) : (
                          <X className="size-4" strokeWidth={3} aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[length:var(--fs-text-sm)] font-medium text-fg">
                          {weekday(entry.date)} · {fullDate(entry.date)}
                        </span>
                        <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted">
                          {entry.centerName} — {entry.slotLabel}
                        </span>
                      </span>
                      <Chip color={present ? 'var(--ok)' : 'var(--err)'}>
                        {present ? c.present : c.absentEntry}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
              {attendance.entries.length > ENTRIES_SHOWN ? (
                <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">
                  {formatCopy(c.moreEntries, { count: attendance.entries.length - ENTRIES_SHOWN })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function BookingBox({ attendance }: { attendance: StudentAttendance }) {
  const { booking } = attendance;
  if (booking === null) {
    return (
      <p className="rounded-md border border-dashed border-line bg-surface-1 p-3 text-[length:var(--fs-text-sm)] text-fg-muted">
        {c.noBooking}
      </p>
    );
  }
  return (
    <div
      style={tone('var(--viz-2)')}
      className="flex flex-col gap-3 rounded-md border border-[color-mix(in_oklab,var(--ct-tone)_32%,var(--border))] bg-[color-mix(in_oklab,var(--ct-tone)_8%,var(--n-2))] p-3"
    >
      <div className="min-w-0">
        <p className="text-[length:var(--fs-text-xs)] font-medium text-fg-muted">{c.booking}</p>
        <p className="mt-0.5 font-semibold text-fg">{booking.centerName}</p>
        <p className="text-[length:var(--fs-text-sm)] text-fg">
          {booking.slot.label ? `${booking.slot.label} — ` : ''}
          {formatSlotTime(booking.slot)}
        </p>
        <p className="mt-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.bookedOn, { date: dateOfIso(booking.bookedAt) })}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/centers/slots/${booking.slotId}`}
          style={tone('var(--info)')}
          className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
        >
          <Users className="size-4" aria-hidden="true" />
          {c.openBookings}
        </Link>
        <Link
          href={`/admin/centers/slots/${booking.slotId}/attendance`}
          style={tone('var(--viz-3)')}
          className={cn(ROW_BUTTON, ROW_BUTTON_TONE)}
        >
          <ClipboardCheck className="size-4" aria-hidden="true" />
          {c.openSheet}
        </Link>
      </div>
    </div>
  );
}

function Stats({ attendance }: { attendance: StudentAttendance }) {
  const held = attendance.attended + attendance.absent;
  const rate = percent(attendance.attended, held);
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile color="var(--ok)" value={attendance.attended} label={c.attended} />
      <Tile color="var(--err)" value={attendance.absent} label={c.absent} />
      <Tile color={rateHue(rate)} value={rate === null ? '—' : `${rate}%`} label={c.rate} />
      {held > 0 ? (
        <div className="col-span-3">
          <Meter value={attendance.attended} max={held} color={rateHue(rate)} />
        </div>
      ) : null}
    </div>
  );
}

function Tile({ color, value, label }: { color: string; value: number | string; label: string }) {
  return (
    <div
      style={tone(color)}
      className="rounded-md border border-[color-mix(in_oklab,var(--ct-tone)_32%,var(--border))] bg-[color-mix(in_oklab,var(--ct-tone)_9%,var(--n-2))] p-2.5 text-center"
    >
      <p className="text-[length:var(--fs-title-3)] font-bold tabular-nums text-[color:color-mix(in_oklab,var(--ct-tone)_78%,var(--n-12))]">
        {value}
      </p>
      <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
    </div>
  );
}
