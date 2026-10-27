import { cairoParts, fromCairoWall } from '@ayman/contracts/marketing/pacing';

/**
 * The studio's calendar, in CAIRO days, weeks starting Saturday — the
 * Egyptian school week, and the order the API buckets the weekly digest in.
 *
 * Isomorphic and pure: the server page computes the `from`/`to` it asks the
 * API for with the same functions the client grid draws its cells with, so a
 * post near midnight never lands in a cell the request did not cover.
 *
 * Days are `YYYY-MM-DD` strings throughout. A JS `Date` for «a day» would be
 * an instant in the BROWSER's zone, and the admin's laptop is not always in
 * Cairo.
 */

export type CalendarView = 'week' | 'month';

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(day: string): { y: number; m: number; d: number } {
  const match = DAY.exec(day);
  if (!match) throw new Error(`not a day: ${day}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar arithmetic on the date alone, through UTC so month ends are the platform's problem. */
export function addDays(day: string, n: number): string {
  const { y, m, d } = parts(day);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 0 = Saturday … 6 = Friday. */
export function weekdayIndex(day: string): number {
  const { y, m, d } = parts(day);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1) % 7;
}

export function isDay(value: string | undefined): value is string {
  if (!value || !DAY.test(value)) return false;
  const { y, m, d } = parts(value);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function cairoDay(at: Date | string): string {
  return cairoParts(typeof at === 'string' ? new Date(at) : at).day;
}

export function todayInCairo(now: Date = new Date()): string {
  return cairoDay(now);
}

/** The instant Cairo's day starts — what the API's `from`/`to` are made of. */
export function startOfCairoDay(day: string): Date {
  const { y, m, d } = parts(day);
  return fromCairoWall(y, m, d, 0);
}

export interface CalendarRange {
  view: CalendarView;
  anchor: string;
  /** Every cell, in order: 7 for a week, whole weeks covering the month. */
  days: string[];
  /** `YYYY-MM` of the month a month view is about; cells outside it are dimmed. */
  month: string;
  from: Date;
  to: Date;
}

export function calendarRange(view: CalendarView, anchor: string): CalendarRange {
  if (view === 'week') {
    const first = addDays(anchor, -weekdayIndex(anchor));
    const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
    return { view, anchor, days, month: anchor.slice(0, 7), from: startOfCairoDay(first), to: startOfCairoDay(addDays(first, 7)) };
  }
  const { y, m } = parts(anchor);
  const firstOfMonth = `${y}-${pad(m)}-01`;
  const first = addDays(firstOfMonth, -weekdayIndex(firstOfMonth));
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const days: string[] = [];
  for (let day = first; day < nextMonth || weekdayIndex(day) !== 0; day = addDays(day, 1)) days.push(day);
  return {
    view,
    anchor,
    days,
    month: `${y}-${pad(m)}`,
    from: startOfCairoDay(first),
    to: startOfCairoDay(addDays(first, days.length)),
  };
}

/** The anchor one page earlier or later. A month moves to the 1st, so a 31st never skips February. */
export function shiftAnchor(view: CalendarView, anchor: string, direction: -1 | 1): string {
  if (view === 'week') return addDays(anchor, 7 * direction);
  const { y, m } = parts(anchor);
  const index = y * 12 + (m - 1) + direction;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
}

/** `<input type="datetime-local">` value for an instant, in Cairo. */
export function toCairoInput(iso: string): string {
  const p = cairoParts(new Date(iso));
  return `${p.day}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The instant a Cairo wall-clock input names, or null for an unreadable value. */
export function fromCairoInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match.map(Number) as [number, number, number, number, number, number];
  return fromCairoWall(y, m, d, hh, mm);
}

/** A sensible default slot: the next round hour at least an hour away, but never before 10:00 or after 22:00. */
export function suggestedSlot(now: Date = new Date()): string {
  const p = cairoParts(new Date(now.getTime() + 60 * 60_000));
  let day = p.day;
  let hour = p.minute > 0 ? p.hour + 1 : p.hour;
  if (hour < 10) hour = 10;
  if (hour > 22) {
    day = addDays(day, 1);
    hour = 10;
  }
  return `${day}T${pad(hour)}:00`;
}

/** `٢٨ أكتوبر` — the cell and editor date label. */
export function dayLabel(day: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', ...options }).format(
    new Date(startOfCairoDay(day).getTime() + 12 * 3_600_000),
  );
}

export function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
