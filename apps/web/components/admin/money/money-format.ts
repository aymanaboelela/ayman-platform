import { copy } from '@ayman/contracts/copy/admin';
import { formatEGPExact } from '@/lib/price';

const c = copy.admin.money;

/**
 * Formatting for the money screens — Western digits throughout, the same
 * `-u-nu-latn` rule `/admin/finance` follows, so «١٬٢٠٠» on the analytics
 * overview and «1,200» here are never the same amount in two scripts on
 * adjacent tabs of the money story.
 */
const COUNT = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 0 });

/**
 * Piastres → «1,250 ج», sign kept. `formatEGPExact`, never the rounding one:
 * this screen prints figures that are meant to add up.
 *
 * A negative is wrapped in a left-to-right isolate (LRI … PDI). Bare, the
 * minus is a neutral in an Arabic paragraph and bidi moves it to the far side
 * of the digits — «100−» — which is how a refund reads as a hundred. The
 * isolate is inside the STRING because this value also lands in tooltips and
 * the table view, where no wrapping element exists to carry `dir`.
 */
export function formatAmount(cents: number): string {
  const figure = formatEGPExact(Math.abs(cents));
  return cents < 0 ? `\u2066−${figure}\u2069 ${c.currency}` : `${figure} ${c.currency}`;
}

export function formatCount(n: number): string {
  return COUNT.format(n);
}

export function formatShare(fraction: number): string {
  return new Intl.NumberFormat('ar-EG-u-nu-latn', {
    style: 'percent',
    maximumFractionDigits: fraction > 0 && fraction < 0.01 ? 1 : 0,
  }).format(fraction);
}

const SHORT = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const LONG = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * A `YYYY-MM-DD` Cairo day key, rendered. The key is already the Cairo date,
 * so it is formatted AS a UTC midnight — formatting it in the browser's own
 * zone could move it a day.
 */
function keyDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** «28 سبتمبر» — the axis ticks. */
export function shortDay(key: string): string {
  return SHORT.format(keyDate(key));
}

/** «الإتنين 28 سبتمبر», or «النهارده» / «امبارح» for the two days he reads
 *  first. `today` is the window's own last key, from the API — never the
 *  browser's clock, which may be in another zone or wrong. */
export function dayTitle(key: string, today: string, yesterday: string | undefined): string {
  if (key === today) return `${c.today} — ${LONG.format(keyDate(key))}`;
  if (key === yesterday) return `${c.yesterday} — ${LONG.format(keyDate(key))}`;
  return LONG.format(keyDate(key));
}
