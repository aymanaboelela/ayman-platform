import { z } from '@ayman/contracts/zod';
import { PaymentPlanSchema } from '@ayman/contracts/payments';

/**
 * «الفلوس يوم بيوم» — `/admin/analytics/money`, and the payments timeline on
 * `/admin/students/:id`.
 *
 * ## Money here is the SAME money `/admin/finance` counts
 *
 * Subscription income is an APPROVED, non-comped `PaymentSubmission`
 * (`status = approved AND is_free = false`), dated on the day it was approved
 * — the identical predicate and the identical date `FinanceOverviewService`
 * sums, so thirty days of this screen add up to what that one says for the
 * same thirty days. A hand-issued `AccessGrant` (`source: admin`) has no
 * submission behind it and is not income; an `isFree` submission is a
 * subscription nobody paid for, and is counted apart as `freeCount`.
 *
 * Refunds come off on THEIR OWN day (`refunds.occurred_on`), never the sale's
 * — same rule as every other money screen. Book income is
 * `BOOK_REVENUE_WHERE`, dated on `paid_at`.
 *
 * ## Days are Cairo days
 *
 * Every `date` below is `YYYY-MM-DD` in Africa/Cairo, bucketed with
 * `cairoDay()` — a payment approved at 00:30 in Cairo belongs to that day, not
 * to the previous UTC one.
 *
 * ## «جديد» and «تجديد»
 *
 * A paid subscription is a RENEWAL when the same student already had an
 * earlier approved, paid subscription to the SAME course — any time before,
 * inside the window or not. Otherwise it is NEW. «شهر ٢» bought after «شهر ١»
 * is a renewal; a second course is a new subscription; a comped one before the
 * first real payment does not make that payment a renewal. The definition
 * lives in one SQL window in `FinanceDailyService`, shared by both endpoints.
 */

/** The windows the screen offers. A closed list, like the analytics overview's:
 *  `?days=100000` is a scan anybody with the URL bar could trigger. */
export const FINANCE_DAILY_WINDOWS = [7, 30, 90] as const;
export type FinanceDailyWindow = (typeof FINANCE_DAILY_WINDOWS)[number];

export const FinanceDailyQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((n) => (FINANCE_DAILY_WINDOWS as readonly number[]).includes(n))
    .default(30),
});
export type FinanceDailyQuery = z.infer<typeof FinanceDailyQuerySchema>;

const cents = z.number().int();
const count = z.number().int().min(0);
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One course on one day. Only courses that sold something that day appear. */
export const FinanceDayCourseSchema = z.object({
  courseId: z.uuid(),
  count,
  newCount: count,
  renewalCount: count,
  amountCents: cents,
});
export type FinanceDayCourse = z.infer<typeof FinanceDayCourseSchema>;

export const FinanceDaySchema = z.object({
  date: dayKey,
  /** Paid subscriptions approved that day, before refunds. */
  subscriptionCents: cents,
  /** `0` when the reader does not hold `book-order:read` — see `includesBooks`. */
  bookCents: cents,
  /** Money given back THAT day, whichever day the sale was. */
  refundCents: cents,
  /**
   * «شحن المحفظة» — real money that came into wallets that day (net of paid
   * credits taken back). A subscription paid FROM the wallet adds nothing to
   * `subscriptionCents`: its money is counted here, the day it was topped up.
   */
  walletCents: cents,
  /** `subscriptionCents + bookCents + walletCents − refundCents`. Can be negative. */
  netCents: cents,
  /** Every subscription approved that day, wallet-paid ones included — they
   *  are real subscriptions, they are just not new money. */
  subscriptionCount: count,
  newCount: count,
  renewalCount: count,
  /** Of `subscriptionCount`, how many were paid from the wallet. */
  walletPaidCount: count,
  /** Comped subscriptions opened that day — real access, no money. */
  freeCount: count,
  bookCount: count,
  byCourse: z.array(FinanceDayCourseSchema),
});
export type FinanceDay = z.infer<typeof FinanceDaySchema>;

/**
 * What a course sold over the window, split by what was bought.
 *
 * `month` — one entry per curriculum month (a payment for «شهر ٢ و٣» counts
 * once under each). `term` — per term. `plan` — the rolling plans on a course
 * that does not sell by month (`monthly` / `quarterly` / `yearly`).
 */
export const FinanceDailyItemSchema = z.object({
  kind: z.enum(['month', 'term', 'plan']),
  /** The month or term id, or `plan:<plan>`. Stable across renders. */
  key: z.string(),
  /** The month's or term's own title; `null` for a plan (the screen names it). */
  label: z.string().nullable(),
  plan: PaymentPlanSchema.nullable(),
  /** For ordering months by the number the instructor speaks in. */
  monthIndex: z.number().int().nullable(),
  count,
});
export type FinanceDailyItem = z.infer<typeof FinanceDailyItemSchema>;

export const FinanceDailyCourseSchema = z.object({
  courseId: z.uuid(),
  courseTitle: z.string(),
  amountCents: cents,
  count,
  newCount: count,
  renewalCount: count,
  /** Distinct students who paid for this course in the window. */
  studentCount: count,
  freeCount: count,
  items: z.array(FinanceDailyItemSchema),
});
export type FinanceDailyCourse = z.infer<typeof FinanceDailyCourseSchema>;

export const AdminFinanceDailySchema = z.object({
  days: z.number().int(),
  /** First and last Cairo day of the window; `to` is today. */
  from: dayKey,
  to: dayKey,
  /**
   * Whether book income is in the figures. Book money is `book-order:read`'s
   * to see, and this screen is `payment:read` — a role holding only the
   * second gets the subscriptions and an honest «من غير الكتب».
   */
  includesBooks: z.boolean(),
  totals: z.object({
    subscriptionCents: cents,
    bookCents: cents,
    refundCents: cents,
    walletCents: cents,
    netCents: cents,
    subscriptionCount: count,
    newCount: count,
    renewalCount: count,
    walletPaidCount: count,
    /** Distinct students with at least one renewal in the window. */
    renewingStudents: count,
    /** Distinct students with at least one paid subscription in the window. */
    payingStudents: count,
    freeCount: count,
    bookCount: count,
  }),
  /** Biggest earner first. Only courses that sold something in the window. */
  courses: z.array(FinanceDailyCourseSchema),
  /** Every day of the window, oldest first, zeros included — never a hole. */
  daily: z.array(FinanceDaySchema),
});
export type AdminFinanceDaily = z.infer<typeof AdminFinanceDailySchema>;

/* ── One student's payments ─────────────────────────────────────────────── */

/**
 * `new` / `renewal` — see the header. `free` — a comped subscription: it
 * opened the course and moved no money, so it is neither.
 */
export const StudentPaymentKindSchema = z.enum(['new', 'renewal', 'free']);
export type StudentPaymentKind = z.infer<typeof StudentPaymentKindSchema>;

/** How the payment reached the platform. `instapay` — matched to a transfer
 *  and approved with nobody looking; `manual` — recorded by an admin from the
 *  student's page; `review` — a claim an admin approved from the queue;
 *  `wallet` — paid from the student's wallet, so NOT new money (it was counted
 *  when the wallet was topped up). */
export const StudentPaymentViaSchema = z.enum(['instapay', 'manual', 'review', 'wallet']);
export type StudentPaymentVia = z.infer<typeof StudentPaymentViaSchema>;

export const StudentPaymentRowSchema = z.object({
  submissionId: z.uuid(),
  courseId: z.uuid(),
  courseTitle: z.string(),
  plan: PaymentPlanSchema,
  termTitle: z.string().nullable(),
  /** The curriculum months this ONE payment bought, lowest first. */
  months: z.array(z.object({ monthIndex: z.number().int(), title: z.string() })),
  amountCents: cents,
  isFree: z.boolean(),
  kind: StudentPaymentKindSchema,
  /** 1 for the first paid subscription to this course, 2 for the first
   *  renewal, … `null` on a comped row. */
  sequence: z.number().int().min(1).nullable(),
  paidAt: z.iso.datetime(),
  /** Cairo day of `paidAt`, so the screen never re-derives it in the browser. */
  paidOn: dayKey,
  refundedCents: cents,
  via: StudentPaymentViaSchema,
});
export type StudentPaymentRow = z.infer<typeof StudentPaymentRowSchema>;

export const AdminStudentPaymentsSchema = z.object({
  totals: z.object({
    /** Paid in real money, before refunds. Wallet-paid subscriptions are NOT
     *  in here — see `walletPaidCents`. */
    paidCents: cents,
    /** Subscriptions paid from the wallet, at their price. The money itself is
     *  on the wallet's own statement, where it came in. */
    walletPaidCents: cents,
    refundedCents: cents,
    netCents: cents,
    paymentCount: count,
    renewalCount: count,
    freeCount: count,
    courseCount: count,
  }),
  /** Newest first. Approved subscriptions only — a pending claim is
   *  `/admin/payments`'s, and a rejected one never became a subscription. */
  rows: z.array(StudentPaymentRowSchema),
});
export type AdminStudentPayments = z.infer<typeof AdminStudentPaymentsSchema>;
