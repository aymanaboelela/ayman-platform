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

/**
 * The shipping fee as it appears in a price BREAKDOWN — the basket's «الشحن»
 * row, and the identical row in the course page's «اطلب الكتاب» summary.
 *
 * A zero fee is a real, chosen configuration («مصاريف الشحن ملهاش دعوة… السعر
 * ٢٥٠»), not an empty value, and `formatEGP(0)` renders it as a bare «0» next
 * to a «جنيه» — which reads as a number that failed to load rather than as
 * free delivery. So zero gets a word.
 *
 * A function rather than a ternary at each call site because there are three of
 * them and they must not disagree: a basket that says «مجانًا» beside a
 * checkout summary that says «0» is the kind of mismatch that makes a reader
 * stop trusting the total.
 */
export function formatShipping(cents: number, freeLabel: string): string {
  return cents === 0 ? freeLabel : formatEGP(cents);
}
