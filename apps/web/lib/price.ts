/**
 * EGP cents → a whole-pound Arabic string with Western digits — the same
 * `-u-nu-latn` convention `formatNotificationTime` and `devices-list.tsx` use
 * for every other number on the platform, so a price does not read in a
 * different digit system from the timestamp next to it.
 */
const formatter = new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 0 });

export function formatEGP(cents: number): string {
  return formatter.format(cents / 100);
}
