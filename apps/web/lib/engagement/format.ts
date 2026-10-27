import { engagementCopy } from '@ayman/contracts/copy/engagement';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { formatCopy } from '@ayman/contracts/format';

const c = engagementCopy.recap;

/** «أكتوبر ٢٠٢٦» — from a `YYYY-MM` key, read as a UTC date so no zone moves it. */
const monthName = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthOnly = new Intl.DateTimeFormat('ar-EG', { month: 'long', timeZone: 'UTC' });

export function recapMonthLabel(month: string, withYear = true): string {
  return (withYear ? monthName : monthOnly).format(new Date(`${month}-01T00:00:00Z`));
}

/** «12 س 30 د», or «45 دقيقة» / «3 دقايق» under an hour. */
export function watchText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return formatCopy(c.hoursMinutes, { h, m });
  // «0 دقيقة», not the bare word the `many` row would give a zero.
  return m === 0 ? `0 ${c.minutesOnly.one}` : arabicCount(m, c.minutesOnly);
}
