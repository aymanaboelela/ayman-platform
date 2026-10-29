import { z } from '@ayman/contracts/zod';
import { STORAGE_KEY_PATTERN } from '@ayman/contracts/admin/media';

/**
 * «البانرات الترويجية» — pictures the instructor puts on top of every
 * student's dashboard: a new course, a discount week, the book being back in
 * stock.
 *
 * ## Why this is not a home block
 *
 * `home_blocks` is the PUBLIC landing page — what a visitor reads before
 * signing in, composed section by section. These are the opposite audience:
 * students already inside, on `/dashboard`, and a banner is a dated thing
 * (a week's offer) where a landing section is standing copy. One table for
 * both would have meant a block type that renders on one page and a page that
 * ignores every other type.
 *
 * ## Dates are days, on the Cairo calendar
 *
 * «من الخميس للحد» is how an offer is described, so that is what is stored:
 * `YYYY-MM-DD`, both ends INCLUSIVE, either end open. A banner ending
 * `2026-11-05` is still up at 23:59 Cairo time on the fifth.
 */

/** The most a stack keeps at once. The public read sends them all, so this
 *  is also the bound on that payload. */
export const PROMO_BANNER_MAX = 20;

/**
 * The years a banner can be aimed at. A profile stores `year` 1–3 (see
 * `taxonomy.ts`); an empty list means every student, including the ones who
 * never chose a year.
 *
 * ⚠️ The year alone, not `(system, year)`: on a stack that teaches
 * «تالتة إعدادي» beside «تالتة ثانوي», a year-3 banner reaches both. Every
 * stack this ships to today teaches one stage, and the day one does not, the
 * fix is a `systemId` beside this list — not a different meaning for it.
 */
export const PROMO_BANNER_YEARS = [1, 2, 3] as const;

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ لازم يكون YYYY-MM-DD');

/**
 * Where a press on the banner goes: a path on this site, or an https page
 * somewhere else. `null` when the banner is a picture and nothing more.
 *
 * Classified rather than merely validated, because the two render
 * differently — an internal path is a client-side `<Link>`, an outside page
 * opens in a new tab with `noopener`.
 */
export function promoBannerLinkKind(href: string): 'internal' | 'external' | null {
  if (/\s|\\/.test(href)) return null;
  // `//evil.example` is a protocol-relative URL, i.e. ANOTHER origin dressed
  // as a path. Refused rather than classified as external: nobody types it
  // on purpose, and an https link says the same thing honestly.
  if (href.startsWith('/')) return href.startsWith('//') ? null : 'internal';
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && url.hostname.includes('.') ? 'external' : null;
  } catch {
    return null;
  }
}

const linkSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => promoBannerLinkKind(value) !== null, 'اللينك لازم يبدأ بـ / أو https://');

const titleSchema = z.string().trim().min(1).max(80);

const imageKeySchema = z.string().regex(STORAGE_KEY_PATTERN, 'ارفع صورة البانر');

const yearsSchema = z
  .array(z.number().int().min(1).max(3))
  .max(PROMO_BANNER_YEARS.length)
  .refine((years) => new Set(years).size === years.length, 'سنة متكررة');

/** `endsOn` before `startsOn` is a banner that can never show. */
function windowIsOrdered(value: { startsOn?: string | null; endsOn?: string | null }): boolean {
  return !value.startsOn || !value.endsOn || value.endsOn >= value.startsOn;
}

const WINDOW_MESSAGE = 'تاريخ النهاية قبل تاريخ البداية';

/** One banner, as the admin screen sees it — inactive and expired included. */
export const PromoBannerSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  imageKey: z.string(),
  linkUrl: z.string().nullable(),
  years: z.array(z.number().int()),
  isActive: z.boolean(),
  startsOn: dayString.nullable(),
  endsOn: dayString.nullable(),
  position: z.number().int(),
  createdAt: z.string(),
});
export type PromoBanner = z.infer<typeof PromoBannerSchema>;

export const PromoBannerListSchema = z.array(PromoBannerSchema);

/**
 * What the dashboard receives: active rows that have not ended, in order.
 *
 * `startsOn` and `endsOn` still travel, and the web checks them AGAIN at
 * render: the list is cached for minutes, so a banner starting at midnight
 * must already be in the cached copy and appear on its own when the day
 * turns — and one ending at midnight must disappear without waiting for the
 * cache to expire.
 */
export const PublicPromoBannerSchema = PromoBannerSchema.pick({
  id: true,
  title: true,
  imageKey: true,
  linkUrl: true,
  years: true,
  startsOn: true,
  endsOn: true,
});
export type PublicPromoBanner = z.infer<typeof PublicPromoBannerSchema>;

export const PublicPromoBannerListSchema = z.array(PublicPromoBannerSchema);

export const PromoBannerCreateSchema = z
  .object({
    title: titleSchema.nullable().default(null),
    imageKey: imageKeySchema,
    linkUrl: linkSchema.nullable().default(null),
    years: yearsSchema.default([]),
    isActive: z.boolean().default(true),
    startsOn: dayString.nullable().default(null),
    endsOn: dayString.nullable().default(null),
  })
  .strict()
  .refine(windowIsOrdered, { message: WINDOW_MESSAGE, path: ['endsOn'] });
export type PromoBannerCreate = z.input<typeof PromoBannerCreateSchema>;

/**
 * Every field optional and NONE defaulted — written out rather than derived
 * with `.partial()` from the create schema, which keeps each `.default()` and
 * would quietly reset `isActive` to `true` on a patch that only renamed the
 * banner.
 *
 * The window check here sees only the fields that were sent; a patch moving
 * `endsOn` before a stored `startsOn` is refused by the service, which has
 * the stored row, and by the table's CHECK.
 */
export const PromoBannerPatchSchema = z
  .object({
    title: titleSchema.nullable().optional(),
    imageKey: imageKeySchema.optional(),
    linkUrl: linkSchema.nullable().optional(),
    years: yearsSchema.optional(),
    isActive: z.boolean().optional(),
    startsOn: dayString.nullable().optional(),
    endsOn: dayString.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'nothing to change')
  .refine(windowIsOrdered, { message: WINDOW_MESSAGE, path: ['endsOn'] });
export type PromoBannerPatch = z.input<typeof PromoBannerPatchSchema>;

export const PromoBannerReorderSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(PROMO_BANNER_MAX) })
  .strict();
export type PromoBannerReorder = z.infer<typeof PromoBannerReorderSchema>;

const cairoDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** `YYYY-MM-DD` on the Cairo calendar — `en-CA` is the locale whose short
 *  date is literally that shape. */
export function cairoDayKey(at: Date): string {
  return cairoDay.format(at);
}

/** Inside its window today. `isActive` is the caller's to check — the public
 *  list only carries active rows, the admin list carries both. */
export function promoBannerInWindow(
  banner: Pick<PromoBanner, 'startsOn' | 'endsOn'>,
  today: string,
): boolean {
  return (!banner.startsOn || banner.startsOn <= today) && (!banner.endsOn || banner.endsOn >= today);
}

/** For this student: no audience means everyone, and a student with no year
 *  sees only the banners aimed at everyone. */
export function promoBannerForYear(banner: Pick<PromoBanner, 'years'>, year: number | null): boolean {
  return banner.years.length === 0 || (year !== null && banner.years.includes(year));
}
