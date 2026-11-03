import { z } from '@ayman/contracts/zod';
import { CouponPlanAmountsSchema, hasAnyPlanAmount } from '@ayman/contracts/coupons';

/**
 * «كود خصم لكل يوم» — the campaign half of a coupon.
 *
 * ## Why one code per Cairo send-day, and not one per campaign or per student
 *
 * The number sends ~40 messages a day while it warms up, so a 1,900-recipient
 * campaign takes weeks. A single campaign-wide code «valid for 3 days» would be
 * dead before most of the audience received it; a code per student would be
 * 1,900 coupon rows nobody can read on `/admin/coupons`. One code per day the
 * campaign actually sends is the shape that makes «valid N days from the day
 * it reached you» true for everybody: every recipient of a day's batch got it
 * that day, so its window starts that day.
 *
 * The code is created LAZILY by the runner, the first time it sends on a Cairo
 * day — a paused day, a capped day or a day outside the window creates
 * nothing. It is the ordinary coupon the checkout already prices (server-side,
 * under the row lock): `per_plan`, one use per student, scoped to `courseIds`.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/** The code itself — `WELCOME0311-K7QM` for 3 November. */
export const COUPON_TOKEN = '{{الكود}}';
/** The Cairo date the code stops working, written out in Arabic. */
export const LAST_DAY_TOKEN = '{{آخر_يوم}}';

/**
 * A code is `PREFIX` + `DDMM` + `-` + four random characters — at most 32 with
 * the stored pattern `[A-Z0-9_-]`, so the prefix stops at 23. Letters and
 * digits only in the prefix: a `-` there would read as the separator.
 *
 * ## Why the random tail
 *
 * `PREFIX + DDMM` alone is guessable: anybody who got Tuesday's code can
 * type Wednesday's before it reaches them, and one student could redeem a
 * fresh code every day of the campaign. The tail makes a day's code
 * knowable only from that day's message; once-per-student across the WHOLE
 * campaign is enforced in the ledger (`perStudentRefusal`, `campaign_used`).
 */
export const DAILY_COUPON_PREFIX_MAX = 23;
/** No 0/1 — a code read off a phone screen and typed by hand. */
export const DAILY_COUPON_SUFFIX_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789';
export const DAILY_COUPON_SUFFIX_LENGTH = 4;
/** What a preview shows in place of the tail it cannot know yet. */
export const SAMPLE_DAILY_SUFFIX = 'K7QM';

const PrefixSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{2,23}$/, 'البادئة حروف إنجليزي وأرقام بس، من ٢ لـ ٢٣')
  .transform((raw) => raw.toUpperCase());

export const DailyCouponSchema = z
  .object({
    prefix: PrefixSchema,
    /** Counted from the day the message left — see `dailyCouponLastDay`. */
    validDays: z.number().int().min(1).max(14),
    /** The courses the code applies to. Never «every course» — a campaign
     *  code that also discounts the other years is a leak, not a convenience. */
    courseIds: z.uuid().array().min(1, 'اختار كورس واحد على الأقل للكود').max(20),
    planAmounts: CouponPlanAmountsSchema,
  })
  .refine((value) => hasAnyPlanAmount(value.planAmounts), {
    message: 'حدد خصم لنوع اشتراك واحد على الأقل',
    path: ['planAmounts'],
  });
export type DailyCoupon = z.infer<typeof DailyCouponSchema>;

/** `YYYY-MM-DD` (the pacing's Cairo day key) + tail → `PREFIXDDMM-TAIL`. */
export function dailyCouponCode(prefix: string, cairoDay: string, suffix: string): string {
  const [, month, date] = cairoDay.split('-');
  return `${prefix.toUpperCase()}${date}${month}-${suffix.toUpperCase()}`;
}

/** Calendar arithmetic on a `YYYY-MM-DD`, in UTC so no offset can shift it. */
export function addCairoDays(cairoDay: string, days: number): string {
  const [year, month, date] = cairoDay.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The last Cairo day the code works on: the send day plus `validDays`.
 *
 * Counted generously on purpose. The coupon is created at the first send of
 * the day and the window runs to 22:00, so a student who received it at
 * 21:50 would get two days and two hours under «ends N days after creation».
 * Ending at the close of `day + N` gives every recipient of the day at least
 * N full days, and the message can name a whole day («لحد يوم الخميس») that is
 * true for all of them.
 */
export function dailyCouponLastDay(cairoDay: string, validDays: number): string {
  return addCairoDays(cairoDay, validDays);
}

/** «الخميس ٦ نوفمبر» — how `{{آخر_يوم}}` reads in the message. */
export function formatArabicDay(cairoDay: string): string {
  const [year, month, date] = cairoDay.split('-').map(Number) as [number, number, number];
  // Noon UTC of that date, formatted in UTC: the calendar day cannot move.
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}
