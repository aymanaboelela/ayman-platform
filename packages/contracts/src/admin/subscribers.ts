import { z } from '@ayman/contracts/zod';
import { PAGE_SIZES } from '@ayman/contracts/admin/list';

/**
 * `/admin/subscribers` — «مين مشترك ومين لأ»، على مستوى المنصة، وكل كورس،
 * وكل شهر في الكورس.
 *
 * ## «مشترك» يعني إيه هنا
 *
 * جرانت **حي** دلوقتي على كورس مدفوع (`requires_grant`) — `course` أو `term`
 * أو `course_month` — بنفس القايمة اللي `CourseHeadcountService` بيعدّ بيها،
 * عشان رقم الكورس هنا يبقى نفس الرقم اللي في الأوفرفيو. الـ`source` مش
 * فارق: جرانت فتحه أدمن بإيده وصول حقيقي لطالب حقيقي (شوف
 * `money-screens-hide-admin-grants`). `platform` و`subject_teacher` برّه
 * لنفس سبب الهيدكاونت: الـplatform كان هيخلّي كل حساب «مشترك» في كل كورس.
 *
 * ## الشهر: مين «مغطّى»
 *
 * نفس قاعدة `monthSliceOf`: أي جرانت حي على الكورس مش `course_month` (ترم،
 * كورس كامل) بيفتح **كل** الشهور، وجرانت `course_month` بيفتح شهره بس. فـ
 * «مشترك في شهر ٢» = اشترى شهر ٢، أو ماسك الترم/الكورس كله. الشاشة بتفرّق
 * بين الاتنين في الصف (`wide`) عشان «اشترى الشهر» و«معاه الترم» سؤالين
 * مختلفين للمتابعة، بس الاتنين مشتركين.
 *
 * ## التأسيسي برّه
 *
 * طلب أيمن بالنص: «سيبك من التأسيس». نفس مطابقة الاسم اللي
 * `quiz/challenges.ts` و`lib/foundation-courses.ts` بيعملوها — «تأسيس» في
 * العنوان أو تحته. والكورسات المجانية (`requires_grant = false`) برّه كمان:
 * مفيش فيها اشتراك أصلًا، فـ«مش مشترك فيها» جملة مالهاش معنى.
 *
 * ## «مش مشترك» من مين؟ — `audience`
 *
 * سؤالين مختلفين، والشاشة بتسأل الاتنين:
 *
 *   · `all` — **كل اللي ممكن يشترك**. على مستوى المنصة: كل حساب طالب (حتى
 *     اللي ماكملش بياناته — رقمه اتسجّل وهو بيعمل الحساب، وده اللي الإعلانات
 *     محتاجاه). على مستوى الكورس: طلاب سنة الكورس وشعبته، زائد أي حد اشترك
 *     فيه قبل كده.
 *   · `past` — **اللي اشترك قبل كده** وبس. على الكورس: «اشترك في شهر ١
 *     ومكمّلش شهر ٢». على المنصة: اللي كان مشترك وخلص اشتراكه.
 *
 * طالب سنته مش متسجّلة مش في `all` بتاع أي كورس — المنصة عمرها ما سألته،
 * وحطّه في «طلاب أولى مش مشتركين» هيبقى تخمين. هو موجود في قايمة المنصة.
 */

export const SubscriberStatusSchema = z.enum(['in', 'out']);
export type SubscriberStatus = z.infer<typeof SubscriberStatusSchema>;

export const SubscriberAudienceSchema = z.enum(['all', 'past']);
export type SubscriberAudience = z.infer<typeof SubscriberAudienceSchema>;

/** One month of one course, counted. */
export const SubscriberMonthSchema = z.object({
  monthId: z.uuid(),
  monthIndex: z.number().int(),
  title: z.string(),
  isOpen: z.boolean(),
  /** Covered right now — bought this month, or holds the term / whole course. */
  subscribed: z.number().int().min(0),
  /** Of `subscribed`, how many bought THIS month itself. */
  boughtMonth: z.number().int().min(0),
  /** The course's `all` audience minus `subscribed`. */
  notSubscribed: z.number().int().min(0),
  /** Subscribed to the course before and not covered for this month. */
  droppedOut: z.number().int().min(0),
});
export type SubscriberMonth = z.infer<typeof SubscriberMonthSchema>;

export const SubscriberCourseSchema = z.object({
  courseId: z.uuid(),
  title: z.string(),
  year: z.number().int(),
  coverKey: z.string().nullable(),
  subjectNameAr: z.string(),
  /** Any live paid grant on the course. */
  subscribed: z.number().int().min(0),
  /** The `all` audience: the course's year and stream, plus anyone who ever held a grant on it. */
  audience: z.number().int().min(0),
  notSubscribed: z.number().int().min(0),
  /** Held a grant on this course once and holds none now. */
  lapsed: z.number().int().min(0),
  months: z.array(SubscriberMonthSchema),
});
export type SubscriberCourse = z.infer<typeof SubscriberCourseSchema>;

export const SubscribersOverviewSchema = z.object({
  totals: z.object({
    /** Every student account that is not banned — profile or not. */
    students: z.number().int().min(0),
    subscribed: z.number().int().min(0),
    notSubscribed: z.number().int().min(0),
    /** Of `notSubscribed`: held a paid grant once. The rest never paid. */
    lapsed: z.number().int().min(0),
    /** Of `notSubscribed`: carries a phone number — what an ads list can use. */
    withPhone: z.number().int().min(0),
  }),
  courses: z.array(SubscriberCourseSchema),
});
export type SubscribersOverview = z.infer<typeof SubscribersOverviewSchema>;

/** What a student holds on one course, for the chips on their row. */
export const SubscriberHoldingSchema = z.object({
  courseId: z.uuid(),
  title: z.string(),
  /** A term or whole-course grant — every month is covered. */
  wide: z.boolean(),
  /** Month numbers bought one by one, ascending. Empty when only `wide`. */
  monthIndexes: z.array(z.number().int()),
});
export type SubscriberHolding = z.infer<typeof SubscriberHoldingSchema>;

export const SubscriberRowSchema = z.object({
  userId: z.string(),
  name: z.string(),
  /** E.164 as stored. `null` for an account that never gave one. */
  phone: z.string().nullable(),
  /** Whether `/admin/students/{userId}` opens — it 404s without a profile. */
  hasProfile: z.boolean(),
  year: z.number().int().nullable(),
  /** Live paid holdings — only the selected course's when a course is picked. */
  holdings: z.array(SubscriberHoldingSchema),
  /** Held a paid grant (in scope) at any point, live or not. */
  everSubscribed: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type SubscriberRow = z.infer<typeof SubscriberRowSchema>;

/**
 * The list's filter — the URL's, the API's and the export's, one schema so
 * the file is always the table on the screen.
 *
 * `monthId` without `courseId` is refused rather than guessed: a month id
 * already names its course, but a URL carrying one and not the other is a
 * hand-edited URL and the honest answer is a 400.
 */
export const SubscribersQuerySchema = z
  .object({
    status: SubscriberStatusSchema.default('out'),
    audience: SubscriberAudienceSchema.default('all'),
    courseId: z.uuid().optional(),
    monthId: z.uuid().optional(),
    year: z.coerce.number().int().min(1).max(3).optional(),
    /** Only rows with a phone — the ads list. */
    withPhone: z
      .enum(['1', '0'])
      .optional()
      .transform((v) => v === '1'),
    q: z.string().trim().max(120).default(''),
  })
  .refine((query) => query.monthId === undefined || query.courseId !== undefined, {
    message: 'monthId needs courseId',
    path: ['monthId'],
  });
export type SubscribersQuery = z.infer<typeof SubscribersQuerySchema>;

/** One of `PAGE_SIZES` — anything else is a 400 from `ListQuerySchema`. */
export const SUBSCRIBERS_PER_PAGE = 50 satisfies (typeof PAGE_SIZES)[number];

/** An export is the whole selection, not page one — bounded so a mistake is a file, not an outage. */
export const SUBSCRIBERS_EXPORT_MAX = 50_000;

/**
 * The phone as Meta's customer-list upload matches it: country code and
 * digits, no `+`, no spaces — `201012345678`. Meta hashes it on their side
 * either way; the format is what decides the match rate.
 *
 * A local `01…` number (an old row written before E.164 normalisation) gets
 * Egypt's code. Anything that is not 8–15 digits afterwards is not a phone
 * and becomes `null` rather than a row Meta will silently fail to match.
 */
export function metaPhone(phone: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `20${digits.slice(1)}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** First name, rest of the name — Meta's `fn` / `ln` columns. */
export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}
