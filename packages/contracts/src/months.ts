import { z } from '@ayman/contracts/zod';

/**
 * «شهر المنهج» — the curriculum month a lecture belongs to, and the slice a
 * monthly subscriber buys.
 *
 * ## Why this is a module of its own and not more of `payments.ts`
 *
 * `SellablePaymentPlanSchema` below is a NEW export, and `payments.ts` is an
 * EXISTING module that client components import. Turbopack pins a module's id
 * to its file path and keeps the first factory it saw, so adding an export to
 * a module a previous build already shipped breaks every tab still open on
 * that build — `partial.ts`'s own header carries the full account. A new file
 * has a new id and cannot collide with anything already in a browser.
 *
 * No relative imports — same rule as every other leaf module in this package.
 */

/**
 * The plans a student may BUY today, as opposed to the plans that exist.
 *
 * `quarterly` is deliberately absent. «٣ شهور» is off the shelf — the
 * instructor took it off — but it is NOT gone: hundreds of rows in
 * `payment_submissions` and `access_grants` carry it, the finance screens
 * report on it, and a student who bought one still has it. So the DATABASE
 * enum keeps the value and `PaymentPlanSchema` keeps parsing it, while THIS
 * schema — the one every buy path validates against — refuses to create a new
 * one.
 *
 * Narrowing the reading schema instead would have been the tempting version
 * and the wrong one: every admin payments row, every finance report and every
 * «اشتراكاتي» card would have started throwing on data that is perfectly
 * valid history.
 */
export const SellablePaymentPlanSchema = z.enum(['monthly', 'term', 'yearly']);
export type SellablePaymentPlan = z.infer<typeof SellablePaymentPlanSchema>;

/** 1..12. Nine is the school year; a revision or summer month is a real thing
 *  the instructor asks for, and the DB CHECK agrees. */
export const MonthIndexSchema = z.number().int().min(1).max(12);

/**
 * One curriculum month as the STUDENT sees it, on the course page and in the
 * checkout picker.
 *
 * `lessonCount` is what makes the picker honest: «شهر ٢ — ٥ محاضرات» is the
 * only thing on that card that tells a student what the money buys. A month
 * with no lectures in it yet still appears when the instructor has opened it
 * for sale, and the count reads ٠ rather than being hidden — pre-selling a
 * month is his decision to make, and a card that silently disappears is not a
 * decision anyone can see.
 */
export const CourseMonthSchema = z.object({
  id: z.uuid(),
  monthIndex: MonthIndexSchema,
  title: z.string(),
  /** How many PUBLISHED lectures this month opens — quizzes excluded, the
   *  same `isLecture` definition every other count on the platform uses. */
  lessonCount: z.number().int().min(0),
  /** EGP cents. Always the course's own `monthlyPriceCents` today: the
   *  instructor's decision was one price for any month. Carried per month
   *  anyway so a later per-month price is a data change and not a contract
   *  change — see `CourseMonth.priceCents` in schema.prisma. */
  priceCents: z.number().int().min(0),
});
export type CourseMonth = z.infer<typeof CourseMonthSchema>;

/**
 * The same month for the ADMIN, with the two numbers he asked to see while he
 * is writing a lecture: «دي المشتركين مين؟ المشتركين شهري كام؟»
 *
 * `subscriberCount` counts LIVE, unrevoked `scope: course_month` grants. It is
 * deliberately not «كام واحد دفع»: a refunded or cancelled subscription is
 * money that happened and access that did not, and this number is the second
 * one — who is reading the lecture he is about to publish.
 */
export const AdminCourseMonthSchema = CourseMonthSchema.extend({
  isOpen: z.boolean(),
  /** ISO date (no time). `null` on most months — see `CourseMonth.startsOn`. */
  startsOn: z.string().nullable(),
  subscriberCount: z.number().int().min(0),
  /** Published lectures carrying no month at all. Repeated on every month row
   *  because it is what blocks opening ANY of them for sale, and the admin
   *  needs the number where the refusal happens rather than on another screen. */
  untaggedLessonCount: z.number().int().min(0),
});
export type AdminCourseMonth = z.infer<typeof AdminCourseMonthSchema>;

/** Create or rename a month. `monthIndex` is unique per course (DB unique),
 *  so re-using one is a 409 and not a silent overwrite. */
export const CourseMonthWriteSchema = z
  .object({
    monthIndex: MonthIndexSchema,
    title: z.string().trim().min(1).max(60),
    isOpen: z.boolean().default(true),
    /** `YYYY-MM-DD` or null. Never an access decision — see the model doc. */
    startsOn: z.iso.date().nullable().default(null),
  })
  .strict();
export type CourseMonthWriteInput = z.infer<typeof CourseMonthWriteSchema>;

/**
 * Which months open one lecture — the whole set, rewritten at once.
 *
 * A PUT of the full set rather than add/remove calls: the admin edits this as
 * one control («الشهر: ٢» plus «كمان لشهر: ٣، ٤»), and two endpoints would mean
 * a half-applied state is reachable by closing a tab between them.
 *
 * `primaryMonthId: null` means «مش متحطلها شهر» and is a real, legal state —
 * the lecture then reaches term and yearly subscribers and no monthly one.
 * `extraMonthIds` may not contain the primary: it is «كمان», not «و».
 */
export const LessonMonthsWriteSchema = z
  .object({
    primaryMonthId: z.uuid().nullable().default(null),
    extraMonthIds: z.uuid().array().max(12).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.primaryMonthId === null || !value.extraMonthIds.includes(value.primaryMonthId),
    { message: 'الشهر الأساسي مايتكررش في الشهور الزيادة', path: ['extraMonthIds'] },
  )
  .refine((value) => new Set(value.extraMonthIds).size === value.extraMonthIds.length, {
    message: 'فيه شهر مكرر',
    path: ['extraMonthIds'],
  })
  .refine((value) => value.primaryMonthId !== null || value.extraMonthIds.length === 0, {
    // «كمان لشهر ٣» with no month of its own is a state the admin UI cannot
    // produce and the reader cannot explain: the lecture would belong nowhere
    // and still be sold in month 3. Refused at the contract so no client has
    // to remember it.
    message: 'اختار الشهر الأساسي الأول',
    path: ['primaryMonthId'],
  });
export type LessonMonthsWriteInput = z.infer<typeof LessonMonthsWriteSchema>;

/** What a lecture currently carries, for the admin editor to render. */
export const LessonMonthsSchema = z.object({
  primaryMonthId: z.uuid().nullable(),
  extraMonthIds: z.uuid().array(),
});
export type LessonMonths = z.infer<typeof LessonMonthsSchema>;
