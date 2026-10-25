import { elMessiri, lalezar, lemonada, marhey, readex, ruqaa } from '@/lib/fonts';
import type { KitPreset } from './kit-preset';

/**
 * The display face each kit preset sets its headings in — applied on the
 * preset's own root (page and footer) so no other page references the family
 * (`lib/fonts.ts`). Its own module so the footer does not pull the sections in.
 */
export const KIT_FONT: Record<KitPreset, string> = {
  ruqaa: ruqaa.variable,
  kurrasa: marhey.variable,
  taif: readex.variable,
  sabboora: lemonada.variable,
  rihla: elMessiri.variable,
  nujoom: lalezar.variable,
};
