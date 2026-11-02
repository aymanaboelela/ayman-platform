import { copy, formatCopy } from '@ayman/contracts';
import { activeSalePrice } from '@ayman/contracts/sale';
import { formatEGP } from '@/lib/price';

/**
 * «العرض لحد» — the end of an offer is a DAY to the instructor and an instant
 * to the API. The day is Cairo's: «لحد الخميس» means the whole Thursday in
 * Egypt, not until midnight UTC, which would end the offer two or three hours
 * early depending on daylight saving.
 */

const cairoParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function cairoWallClock(date: Date): number {
  const parts = cairoParts.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/** `2026-11-10` → the last second of that day in Cairo, as ISO. `null` for anything else. */
export function saleEndOfDayIso(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59);
  // The offset Cairo had at that moment, so a day across a DST switch lands right.
  const offset = cairoWallClock(new Date(wall)) - wall;
  return new Date(wall - offset).toISOString();
}

/** The reverse, for the date field: an ISO instant → its Cairo day. */
export function saleDayOf(iso: string | null): string {
  if (iso === null) return '';
  return new Date(cairoWallClock(new Date(iso))).toISOString().slice(0, 10);
}

const dayLabel = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** «الخميس ١٠ نوفمبر» with Western digits — how the offer's end is said everywhere. */
export function formatSaleDay(iso: string): string {
  return dayLabel.format(new Date(iso));
}

/**
 * A course's offer as a card states it — the cheapest plan on offer, like
 * `coursePriceBadge` ladders the regular prices: the month first, then the
 * year. `null` when nothing is on offer, and the card keeps its ordinary
 * badge. Reads no clock (`now: null`): the card is server-rendered and the
 * catalog only publishes a live offer — see `activeSalePrice`.
 */
export function courseOffer(course: {
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  saleMonthlyPriceCents?: number | null;
  saleYearlyPriceCents?: number | null;
  saleEndsAt?: string | null;
}): { now: string; was: string } | null {
  const monthly = activeSalePrice(course.monthlyPriceCents, course.saleMonthlyPriceCents, course.saleEndsAt, null);
  if (monthly !== null && course.monthlyPriceCents !== null) {
    return {
      now: formatCopy(copy.course.priceMonthly, { price: formatEGP(monthly) }),
      was: formatEGP(course.monthlyPriceCents),
    };
  }
  const yearly = activeSalePrice(course.yearlyPriceCents, course.saleYearlyPriceCents, course.saleEndsAt, null);
  if (yearly !== null && course.yearlyPriceCents !== null) {
    return {
      now: formatCopy(copy.course.priceYearly, { price: formatEGP(yearly) }),
      was: formatEGP(course.yearlyPriceCents),
    };
  }
  return null;
}
