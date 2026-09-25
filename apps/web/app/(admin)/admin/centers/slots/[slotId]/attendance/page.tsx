import Form from 'next/form';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import {
  CalendarCheck2,
  Check,
  ChevronRight,
  Filter,
  Minus,
  ScanLine,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { AttendanceSheetSchema, type AttendanceSheet } from '@ayman/contracts/admin/centers';
import { formatSlotTime } from '@ayman/contracts/centers';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import {
  Chip,
  Ltr,
  ROW_BUTTON,
  ROW_BUTTON_TONE,
  StatTile,
  addDaysKey,
  cairoTodayKey,
  isDateKey,
  percent,
  rateHue,
  shortDate,
  tone,
  weekday,
} from '../../../centers-ui';
import { SlotHeader } from '../slot-header';
import { ExportSheetButton } from './export-button';

const c = copy.admin.centers;
const s = c.sheet;

export const metadata = { title: s.eyebrow };

/** The API's own default window, restated so the two date inputs can show
 *  what the page is actually looking at when nobody picked a range. */
const DEFAULT_WINDOW_DAYS = 7 * 12;

type Cell = AttendanceSheet['rows'][number]['cells'][number];

/** One CSV field. Quoted when it has to be, with quotes doubled — a name with
 *  a comma in it must not become two columns. */
function csvField(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv(sheet: AttendanceSheet): string {
  if (sheet.rows.length === 0) return '';
  const word: Record<Cell, string> = {
    present: s.present,
    absent: s.absentCell,
    not_booked: '—',
  };
  const lines: (string | number)[][] = [
    [s.number, s.student, s.phone, ...sheet.sessions.map((session) => session.date), s.attended, s.absent, s.rate],
    ...sheet.rows.map((row) => {
      const rate = percent(row.attended, row.attended + row.absent);
      return [
        row.studentNumber,
        row.fullName,
        row.phone ?? '',
        ...row.cells.map((cell) => word[cell]),
        row.attended,
        row.absent,
        rate === null ? '' : `${rate}%`,
      ];
    }),
    [
      '',
      s.total,
      '',
      ...sheet.sessions.map((session) => `${session.present} / ${session.present + session.absent}`),
      sheet.rows.reduce((sum, row) => sum + row.attended, 0),
      sheet.rows.reduce((sum, row) => sum + row.absent, 0),
      '',
    ],
  ];
  // CRLF — what Excel writes and what it reads without a second thought.
  return lines.map((line) => line.map(csvField).join(',')).join('\r\n');
}

/**
 * `/admin/centers/slots/[slotId]/attendance` — «كشف الحضور».
 *
 * One column per class HELD, one row per student booked at some point in the
 * window. A day nobody was scanned on is not a column at all: it was a day
 * off, and nobody is absent on a day off.
 *
 * The matrix scrolls inside its own box, both ways, with the name column and
 * the date row pinned — twelve weeks of Saturdays is wider than any phone, and
 * the page itself must never scroll sideways.
 */
export default async function AttendanceSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slotId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slotId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(slotId).success) notFound();

  const one = (key: string): string | undefined => {
    const value = query[key];
    return typeof value === 'string' && isDateKey(value) ? value : undefined;
  };
  let from = one('from');
  let to = one('to');
  // Swapped rather than refused: «من ١٠ لحد ١» is a slip, and an empty sheet
  // would read as «مفيش حضور» instead.
  if (from && to && from > to) [from, to] = [to, from];

  const search = new URLSearchParams();
  if (from) search.set('from', from);
  if (to) search.set('to', to);
  const qs = search.toString();

  const [session, sheet] = await Promise.all([
    getSession(),
    adminGetOrNotFound(
      `/api/admin/centers/slots/${slotId}/attendance${qs ? `?${qs}` : ''}`,
      AttendanceSheetSchema,
    ),
  ]);
  const canScan = can(session, 'center:attendance');

  const shownTo = to ?? cairoTodayKey();
  const shownFrom = from ?? addDaysKey(shownTo, -DEFAULT_WINDOW_DAYS);
  const { slot, sessions, rows } = sheet;

  const present = sessions.reduce((sum, day) => sum + day.present, 0);
  const absences = sessions.reduce((sum, day) => sum + day.absent, 0);
  const totalAttended = rows.reduce((sum, row) => sum + row.attended, 0);
  const totalAbsent = rows.reduce((sum, row) => sum + row.absent, 0);
  const overallRate = percent(totalAttended, totalAttended + totalAbsent);
  const average = sessions.length > 0 ? Math.round((present / sessions.length) * 10) / 10 : null;
  const title = slot.label ? `${slot.label} — ${formatSlotTime(slot)}` : formatSlotTime(slot);
  const filename = `${s.eyebrow} - ${sheet.centerName} - ${slot.label ?? formatSlotTime(slot)} - ${shownFrom} - ${shownTo}.csv`
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ');

  return (
    <>
      <Link
        href={`/admin/centers/slots/${slot.id}`}
        className="mb-4 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
        {c.students}
      </Link>

      <SlotHeader
        eyebrow={`${s.eyebrow} · ${sheet.centerName}`}
        title={title}
        year={slot.year}
        full={slot.isFull}
        active={slot.isActive}
        priceCents={slot.priceCents}
      />

      <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <StatTile color="var(--viz-3)" icon={CalendarCheck2} value={sessions.length} label={s.tiles.sessions} />
        <StatTile
          color="var(--ok)"
          icon={UserCheck}
          value={average === null ? '—' : average}
          label={s.tiles.avgPresent}
        />
        <StatTile color="var(--err)" icon={UserX} value={absences} label={s.tiles.absences} />
        <StatTile color="var(--viz-1)" icon={UserPlus} value={sheet.guests} label={s.tiles.guests} />
      </div>

      {/* ── The window, and the two ways out of the page ─────────────────── */}
      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3 xl:flex-row xl:items-end xl:justify-between">
        <Form
          action={`/admin/centers/slots/${slot.id}/attendance`}
          scroll={false}
          className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
        >
          <label className="flex min-w-0 flex-col gap-1 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
            {s.from}
            <input
              type="date"
              name="from"
              defaultValue={shownFrom}
              dir="ltr"
              className="h-10 min-w-0 rounded-md border border-line bg-surface-1 px-2 text-[1rem] text-fg focus:border-accent focus:outline-none md:text-[length:var(--fs-text-sm)]"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
            {s.to}
            <input
              type="date"
              name="to"
              defaultValue={shownTo}
              dir="ltr"
              className="h-10 min-w-0 rounded-md border border-line bg-surface-1 px-2 text-[1rem] text-fg focus:border-accent focus:outline-none md:text-[length:var(--fs-text-sm)]"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-accent px-4 text-[length:var(--fs-text-sm)] font-semibold text-[#1A1206] transition-colors hover:bg-accent-hover"
          >
            <Filter className="size-4" aria-hidden="true" />
            {s.apply}
          </button>
          {from || to ? (
            <Link
              href={`/admin/centers/slots/${slot.id}/attendance`}
              scroll={false}
              className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-surface-1 px-3 text-[length:var(--fs-text-sm)] font-medium text-fg-muted hover:text-fg"
            >
              {s.reset}
            </Link>
          ) : null}
        </Form>

        <div className="flex flex-wrap gap-2">
          <ExportSheetButton csv={buildCsv(sheet)} filename={filename} />
          {canScan && slot.isActive ? (
            <Link
              href={`/admin/centers/scan?slot=${slot.id}`}
              style={tone('var(--info)')}
              className={cn(ROW_BUTTON, ROW_BUTTON_TONE, 'md:h-10')}
            >
              <ScanLine className="size-4" aria-hidden="true" />
              {c.scanHere}
            </Link>
          ) : null}
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
        <span className="font-medium">{s.legendTitle}:</span>
        <span className="inline-flex items-center gap-1.5">
          <SheetCell cell="present" />
          {s.present}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SheetCell cell="absent" />
          {s.absentCell}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SheetCell cell="not_booked" />
          {s.notBooked}
        </span>
      </div>

      {sessions.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <CalendarCheck2 className="size-8 text-[color:var(--viz-3)]" aria-hidden="true" />
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{s.noSessions}</p>
          <p className="max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">{s.noSessionsHint}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <Users className="size-8 text-info" aria-hidden="true" />
          <p className="text-[length:var(--fs-title-4)] font-semibold text-fg">{s.noRows}</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-[length:var(--fs-text-xs)] text-fg-muted sm:hidden">{s.scrollHint}</p>
          <div className="mt-2 max-h-[75vh] overflow-auto rounded-lg border border-line bg-surface-2">
            <table className="border-separate border-spacing-0 text-[length:var(--fs-text-sm)]">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky start-0 top-0 z-30 w-36 min-w-36 border-b border-e border-line bg-surface-3 px-3 py-2 text-start font-semibold text-fg sm:w-56 sm:min-w-56"
                  >
                    {s.student}
                  </th>
                  {sessions.map((day) => (
                    <th
                      key={day.date}
                      scope="col"
                      className="sticky top-0 z-20 min-w-14 border-b border-line bg-surface-3 px-1.5 py-2 text-center font-medium text-fg-muted"
                    >
                      <span className="block text-[length:var(--fs-mono-label)]">{weekday(day.date)}</span>
                      <span className="block whitespace-nowrap font-semibold text-fg">{shortDate(day.date)}</span>
                    </th>
                  ))}
                  <TotalHead className="border-s text-ok">{s.attended}</TotalHead>
                  <TotalHead className="text-err">{s.absent}</TotalHead>
                  <TotalHead className="text-fg">{s.rate}</TotalHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rate = percent(row.attended, row.attended + row.absent);
                  return (
                    <tr key={row.userId}>
                      <th
                        scope="row"
                        className="sticky start-0 z-10 w-36 min-w-36 max-w-36 border-b border-e border-line-subtle bg-surface-2 px-3 py-2 text-start font-normal sm:w-56 sm:min-w-56 sm:max-w-56"
                      >
                        <Link
                          href={`/admin/students/${row.userId}`}
                          className="block truncate font-semibold text-fg hover:text-accent-text"
                        >
                          {row.fullName}
                        </Link>
                        <span className="block text-[length:var(--fs-mono-label)] text-fg-muted">
                          {s.number} <Ltr>{row.studentNumber}</Ltr>
                        </span>
                      </th>
                      {row.cells.map((cell, index) => (
                        <td
                          key={sessions[index]?.date ?? index}
                          className="border-b border-line-subtle px-1.5 py-2 text-center"
                        >
                          <SheetCell cell={cell} />
                        </td>
                      ))}
                      <td className="border-b border-s border-line-subtle px-3 py-2 text-center font-semibold tabular-nums text-ok">
                        {row.attended}
                      </td>
                      <td className="border-b border-line-subtle px-3 py-2 text-center font-semibold tabular-nums text-err">
                        {row.absent}
                      </td>
                      <td className="border-b border-line-subtle px-3 py-2 text-center">
                        {rate === null ? (
                          <span className="text-fg-faint">—</span>
                        ) : (
                          <span
                            style={tone(rateHue(rate))}
                            className="inline-block min-w-12 rounded-full bg-[color-mix(in_oklab,var(--ct-tone)_16%,var(--n-2))] px-2 py-0.5 font-semibold tabular-nums text-[color:color-mix(in_oklab,var(--ct-tone)_78%,var(--n-12))]"
                          >
                            {rate}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th
                    scope="row"
                    className="sticky start-0 z-10 border-e border-line bg-surface-3 px-3 py-2 text-start font-semibold text-fg"
                  >
                    {s.total}
                  </th>
                  {sessions.map((day) => (
                    <td key={day.date} className="bg-surface-3 px-1 py-2 text-center text-[length:var(--fs-mono-label)] tabular-nums">
                      <span className="block font-semibold text-ok">{day.present}</span>
                      <span className="block text-err">{day.absent}</span>
                    </td>
                  ))}
                  <td className="border-s border-line bg-surface-3 px-3 py-2 text-center font-bold tabular-nums text-ok">
                    {totalAttended}
                  </td>
                  <td className="bg-surface-3 px-3 py-2 text-center font-bold tabular-nums text-err">
                    {totalAbsent}
                  </td>
                  <td className="bg-surface-3 px-3 py-2 text-center font-bold tabular-nums text-fg">
                    {overallRate === null ? '—' : `${overallRate}%`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {sheet.guests > 0 ? (
        <p className="mt-3 flex items-start gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted">
          <UserPlus className="mt-0.5 size-4 shrink-0 text-[color:var(--viz-1)]" aria-hidden="true" />
          {formatCopy(s.guestsNote, { count: sheet.guests })}
        </p>
      ) : null}
    </>
  );
}

function TotalHead({ children, className }: { children: string; className: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-20 border-b border-line bg-surface-3 px-3 py-2 text-center font-semibold',
        className,
      )}
    >
      {children}
    </th>
  );
}

/** ✓ / ✗ / — as a tinted square. The word rides in `title` and for screen
 *  readers; a column of words would be three times as wide. */
function SheetCell({ cell }: { cell: Cell }) {
  if (cell === 'not_booked') {
    return (
      <span
        title={s.notBooked}
        className="inline-grid size-7 place-items-center rounded-md bg-surface-3 text-fg-faint"
      >
        <Minus className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{s.notBooked}</span>
      </span>
    );
  }
  const presentCell = cell === 'present';
  const Icon = presentCell ? Check : X;
  return (
    <Chip
      color={presentCell ? 'var(--ok)' : 'var(--err)'}
      className="inline-grid size-7 place-items-center rounded-md p-0"
    >
      <Icon className="size-4" strokeWidth={3} aria-hidden="true" />
      <span className="sr-only">{presentCell ? s.present : s.absentCell}</span>
    </Chip>
  );
}
