/**
 * Cairo wall time for the device screens — «٢٨ أكتوبر ٢٠٢٦، ١٠:٠٥ ص» with
 * Latin digits, like the campaign screens beside them. Pinned to Cairo rather
 * than the browser's zone: the whole section (pacing windows, the daily
 * ceiling) is defined in Cairo time, and an admin abroad must read the same
 * clock the sender runs on.
 */
const formatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Cairo',
});

export function cairoWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : formatter.format(at);
}
