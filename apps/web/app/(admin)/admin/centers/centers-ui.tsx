import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.admin.centers;

/**
 * The «السناتر» screens' colour vocabulary, shared by the Server Components
 * and the client controls so a centre is the same hue on its card, its
 * bookings page and its row in the money screen.
 *
 * ONE custom property, `--ct-tone`, set per element and read by a handful of
 * fixed class strings — the same shape `unlock-ui.tsx` uses, for the same
 * reason: a class string per colour per shape drifts the first time one of
 * them is tuned.
 *
 * Every wash mixes in `oklab`, never `oklch`: the dark neutrals are navy, and
 * an `oklch` mix with them rotates red and green toward violet — see
 * `lib/neutral-mix-space.test.ts`.
 */
export function tone(color: string): CSSProperties {
  return { '--ct-tone': color } as CSSProperties;
}

/** A tinted surface — tiles, chips, the picked state. */
export const TINT_CARD =
  'border border-[color-mix(in_oklab,var(--ct-tone)_32%,var(--border))] bg-[color-mix(in_oklab,var(--ct-tone)_9%,var(--n-2))]';
/** The icon well inside a tinted surface. */
export const TINT_WELL =
  'bg-[color-mix(in_oklab,var(--ct-tone)_18%,var(--n-2))] text-[color:var(--ct-tone)]';
/** Text in the tone, pulled toward the foreground so it clears contrast on
 *  both themes — the raw chart hues are only guaranteed 3:1. */
export const TONE_TEXT = 'text-[color:color-mix(in_oklab,var(--ct-tone)_78%,var(--n-12))]';

/**
 * A centre's identity colour, by its position on the page. Teal and violet
 * first: amber is the brand's action colour, and the first centre — often the
 * only one — should not read as a button.
 */
const CENTER_HUES = [
  'var(--viz-2)',
  'var(--viz-3)',
  'var(--viz-5)',
  'var(--viz-4)',
  'var(--viz-6)',
  'var(--viz-1)',
] as const;
export function centerHue(index: number): string {
  return CENTER_HUES[index % CENTER_HUES.length]!;
}

/** A weekday's colour — the same Saturday is the same violet on every card,
 *  so a column of slots reads as a week at a glance. */
const DAY_HUES = [
  'var(--viz-5)', // الأحد
  'var(--viz-2)', // الاثنين
  'var(--viz-6)', // الثلاثاء
  'var(--viz-1)', // الأربعاء
  'var(--viz-4)', // الخميس
  'var(--info)', // الجمعة
  'var(--viz-3)', // السبت
] as const;
export function dayHue(dayOfWeek: number): string {
  return DAY_HUES[dayOfWeek] ?? 'var(--viz-5)';
}

/** «أولى» / «تانية» / «تالتة», or «كل الصفوف» for a slot open to every year. */
export function yearLabel(year: number | null): string {
  if (year === null) return c.allYears;
  return c.yearNames[year - 1] ?? String(year);
}

/** `YYYY-MM-DD` (a Cairo calendar day) → «3 أكتوبر». The month as a WORD:
 *  `ar-EG`'s numeric «3/10» carries RTL marks that turned into «/310» inside
 *  an LTR cell (measured). Formatted in UTC because the string IS the day; a
 *  zone would move it across midnight. */
const dayMonth = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const weekdayName = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function utcOf(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}
export const shortDate = (isoDate: string) => dayMonth.format(utcOf(isoDate));
export const weekday = (isoDate: string) => weekdayName.format(utcOf(isoDate));
export const fullDate = (isoDate: string) => longDate.format(utcOf(isoDate));

/** Today as `YYYY-MM-DD` on Cairo's calendar — the day the API files a scan
 *  under, whatever zone the server or the phone is in. `en-CA` because it is
 *  the one locale whose date format IS the ISO shape. */
const cairoKey = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Africa/Cairo',
});
export function cairoTodayKey(): string {
  return cairoKey.format(new Date());
}
export function addDaysKey(isoDate: string, days: number): string {
  const date = utcOf(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
/** The weekday (٠ = الأحد, like `DayOfWeekSchema`) and minute of the day, on
 *  Cairo's clock — what «the slot happening now» is measured against. */
const cairoClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function cairoNow(): { dayOfWeek: number; minute: number } {
  const parts = cairoClock.formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    dayOfWeek: WEEKDAYS.indexOf(part('weekday')),
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

/** A real calendar day in the `YYYY-MM-DD` shape — `2026-02-31` is not. */
export function isDateKey(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return utcOf(value).toISOString().slice(0, 10) === value;
}

/** A timestamp, in Cairo — a booking made at 11pm must not read as the next day. */
const cairoDate = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeZone: 'Africa/Cairo',
});
export const dateOfIso = (iso: string) => cairoDate.format(new Date(iso));

/** Share as a whole percent, `null` when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** Green from 75%, amber from 50%, red under — the same three steps on every
 *  attendance number, so «٦٠٪» means the same thing on every screen. */
export function rateHue(rate: number | null): string {
  if (rate === null) return 'var(--n-9)';
  if (rate >= 75) return 'var(--ok)';
  if (rate >= 50) return 'var(--warn)';
  return 'var(--err)';
}

/** A number or an ID inside an Arabic line — isolated LTR so the bidi
 *  algorithm cannot move its digits around the words beside it. */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={cn('tabular-nums [unicode-bidi:isolate]', className)}>
      {children}
    </span>
  );
}

/** A small tinted pill with an icon — day, year, «فل», «موقوف». */
export function Chip({
  color,
  icon: Icon,
  children,
  className,
}: {
  color: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      style={tone(color)}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1',
        'text-[length:var(--fs-text-xs)] font-semibold',
        TINT_CARD,
        TONE_TEXT,
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * One headline number in a coloured tile. `wide` spans two columns on the
 * two-column phone grid — for the odd tile out, so the last row is not a
 * lone half-width card.
 */
export function StatTile({
  color,
  icon: Icon,
  value,
  label,
  wide = false,
}: {
  color: string;
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  wide?: boolean;
}) {
  return (
    <div
      style={tone(color)}
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-lg p-3 sm:p-4',
        TINT_CARD,
        wide && 'col-span-2 sm:col-span-1',
      )}
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg sm:size-11', TINT_WELL)}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate text-[length:var(--fs-title-3)] font-semibold leading-tight tabular-nums sm:text-[length:var(--fs-title-2)]',
            TONE_TEXT,
          )}
        >
          {value}
        </span>
        <span className="mt-0.5 block truncate text-[length:var(--fs-text-xs)] font-medium text-fg-muted sm:text-[length:var(--fs-text-sm)]">
          {label}
        </span>
      </span>
    </div>
  );
}

/** A horizontal bar, `value` of `max`, in the tone. Decorative — every bar
 *  on these screens sits beside the numbers it draws. */
export function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <span
      aria-hidden="true"
      style={tone(color)}
      className="block h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ct-tone)_14%,var(--n-3))]"
    >
      <span
        className="block h-full rounded-full bg-[color:var(--ct-tone)]"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

/** The link-shaped buttons on every row — a coloured outline in the tone. */
export const ROW_BUTTON =
  'inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms] ease-out md:h-8';
export const ROW_BUTTON_TONE =
  'border-[color-mix(in_oklab,var(--ct-tone)_40%,var(--border))] bg-[color-mix(in_oklab,var(--ct-tone)_9%,var(--n-2))] text-[color:color-mix(in_oklab,var(--ct-tone)_78%,var(--n-12))] hover:bg-[color-mix(in_oklab,var(--ct-tone)_17%,var(--n-2))]';
