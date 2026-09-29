import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';

const c = copy.admin.settings;

/**
 * «جهاز واحد» · «جهازين» · «٣ أجهزة».
 *
 * Arabic counts in three shapes and none of them is «{n} جهاز»: one takes no
 * number, two is a dual, three to ten take the plural. The limit tops out at
 * ten (`DEVICE_LIMIT_CEILING`), so the eleven-and-up singular never arises.
 *
 * Its own module because the card's server half (the sentence) and its client
 * half (the select's options) both spell the number, and must spell it alike.
 */
export function devicesLabel(count: number): string {
  if (count === 1) return c.studentDevicesOne;
  if (count === 2) return c.studentDevicesTwo;
  return formatCopy(c.studentDevicesMany, { n: count.toLocaleString('ar-EG') });
}
