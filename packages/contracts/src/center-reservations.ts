import { z } from '@ayman/contracts/zod';
import { normalizeEgyptianPhone } from '@ayman/contracts/phone';
import { GRADES } from '@ayman/contracts/grades';

/**
 * «حجز السناتر» — the public reservation page (`/reserve`), the dashboard's
 * view of it, and the read-only panel a centre's owner signs into.
 *
 * ## The shape of one reservation
 *
 * The form is saved BEFORE any money moves (`started`), then the transfer
 * screenshot moves it to `submitted`, and a review moves it to `confirmed` or
 * `rejected`. The early row is the point: «ناس دخلت ومكمّلتش» is a list a
 * centre calls, and it only exists if the form is written on its own.
 */

export const RESERVATION_STATUSES = ['started', 'submitted', 'confirmed', 'rejected', 'cancelled'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_TRACKS = ['arabic', 'languages'] as const;
export type ReservationTrack = (typeof RESERVATION_TRACKS)[number];

export const RESERVATION_SYSTEMS = ['general', 'azhar'] as const;
export type ReservationSystem = (typeof RESERVATION_SYSTEMS)[number];

export const RESERVATION_GENDERS = ['male', 'female'] as const;
export type ReservationGender = (typeof RESERVATION_GENDERS)[number];

export const RESERVATION_RAILS = ['instapay', 'vodafoneCash'] as const;
export type ReservationRail = (typeof RESERVATION_RAILS)[number];

const GRADE_SLUGS = GRADES.map((grade) => grade.slug) as [string, ...string[]];

/** Typed the way people type it (`010…`); stored E.164. */
const egPhone = (message: string) =>
  z
    .string()
    .trim()
    .min(1, message)
    .transform((value, ctx) => {
      const normalized = normalizeEgyptianPhone(value);
      if (normalized === null) {
        ctx.addIssue({ code: 'custom', message: 'رقم موبايل مصري صحيح، ١١ رقم يبدأ بـ 01' });
        return z.NEVER;
      }
      return normalized;
    });

/** A wallet number the admin types into a centre — empty clears it. */
const optionalWallet = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .transform((value, ctx) => {
    if (value === null || value === '') return null;
    const normalized = normalizeEgyptianPhone(value);
    if (normalized === null) {
      ctx.addIssue({ code: 'custom', message: 'رقم موبايل مصري صحيح' });
      return z.NEVER;
    }
    return normalized;
  });

/* ── Public page ─────────────────────────────────────────────────────────── */

/** A weekly group («مجموعة») — a `CenterSlot` as the public page shows it. */
export const PublicReservationSlotSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
  /** The grade year it is for (`GRADES[].year`); null = every year. */
  year: z.number().int().nullable(),
  /** عربي / لغات; null = both. */
  track: z.enum(RESERVATION_TRACKS).nullable(),
  /** One session. Null = no price set. */
  priceCents: z.number().int().nonnegative().nullable(),
  /** What booking it costs now — `payPercent` of the session. */
  amountCents: z.number().int().nonnegative(),
  full: z.boolean(),
});
export type PublicReservationSlot = z.infer<typeof PublicReservationSlotSchema>;

export const PublicReservationCenterSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  mapUrl: z.string().nullable(),
  slots: z.array(PublicReservationSlotSchema),
  /** Already resolved: the centre's own number, else the platform's. */
  payment: z.object({ instapay: z.string().nullable(), vodafoneCash: z.string().nullable() }),
});
export type PublicReservationCenter = z.infer<typeof PublicReservationCenterSchema>;

/** `GET /api/center-reservations/config`. */
export const ReservationConfigSchema = z.object({
  /** The page is taking reservations: switched on AND at least one centre open. */
  open: z.boolean(),
  headline: z.string().nullable(),
  note: z.string().nullable(),
  grades: z.array(z.object({ slug: z.string(), label: z.string(), year: z.number().int() })),
  /** The share of one session paid to book (50 = «نص الحصة»). */
  payPercent: z.number().int(),
  askTrack: z.boolean(),
  askSystem: z.boolean(),
  askGender: z.boolean(),
  centers: z.array(PublicReservationCenterSchema),
});
export type ReservationConfig = z.infer<typeof ReservationConfigSchema>;

/** `POST /api/center-reservations` — the form, saved before any payment. */
export const ReservationCreateSchema = z
  .object({
    centerId: z.uuid(),
    slotId: z.uuid(),
    fullName: z.string().trim().min(5, 'الاسم بالكامل، تلات كلمات على الأقل').max(120),
    phone: egPhone('رقم الموبايل مطلوب'),
    gradeSlug: z.enum(GRADE_SLUGS),
    track: z.enum(RESERVATION_TRACKS).nullable(),
    system: z.enum(RESERVATION_SYSTEMS).nullable(),
    gender: z.enum(RESERVATION_GENDERS).nullable(),
    /**
     * The reservation this browser already holds, if any. The ONLY way to get
     * an existing row back: a phone number is not a secret, so knowing one
     * must never hand over somebody's reservation id (the bearer).
     */
    resumeId: z.uuid().optional(),
  })
  .strict();
export type ReservationCreate = z.input<typeof ReservationCreateSchema>;

/** `POST /api/center-reservations/:id/payment`. */
export const ReservationPaymentSchema = z
  .object({
    method: z.enum(RESERVATION_RAILS),
    senderPhone: egPhone('الرقم اللي اتحوّل منه مطلوب'),
    screenshotKey: z.string().min(1).max(300),
  })
  .strict();
export type ReservationPayment = z.input<typeof ReservationPaymentSchema>;

/** The group a reservation is in, for display. */
export const ReservationSlotInfoSchema = z
  .object({
    label: z.string().nullable(),
    dayOfWeek: z.number().int(),
    startMinute: z.number().int(),
    endMinute: z.number().int(),
  })
  .nullable();
export type ReservationSlotInfo = z.infer<typeof ReservationSlotInfoSchema>;

/** What the student's own browser reads back — by id, which is the bearer. */
export const PublicReservationSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  status: z.enum(RESERVATION_STATUSES),
  fullName: z.string(),
  phone: z.string(),
  centerId: z.string(),
  centerName: z.string(),
  slot: ReservationSlotInfoSchema,
  sessionPriceCents: z.number().int().nullable(),
  amountCents: z.number().int().nonnegative(),
  payment: z.object({ instapay: z.string().nullable(), vodafoneCash: z.string().nullable() }),
  rejectionReason: z.string().nullable(),
});
export type PublicReservation = z.infer<typeof PublicReservationSchema>;

/* ── Dashboard ───────────────────────────────────────────────────────────── */

export const AdminReservationSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  centerId: z.string(),
  centerName: z.string(),
  fullName: z.string(),
  phone: z.string(),
  gradeSlug: z.string(),
  track: z.enum(RESERVATION_TRACKS).nullable(),
  system: z.enum(RESERVATION_SYSTEMS).nullable(),
  gender: z.enum(RESERVATION_GENDERS).nullable(),
  status: z.enum(RESERVATION_STATUSES),
  slot: ReservationSlotInfoSchema,
  sessionPriceCents: z.number().int().nullable(),
  amountCents: z.number().int().nonnegative(),
  paymentMethod: z.enum(RESERVATION_RAILS).nullable(),
  senderPhone: z.string().nullable(),
  hasScreenshot: z.boolean(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminReservation = z.infer<typeof AdminReservationSchema>;

/** Counts and money for one slice (one centre, or all of them). */
export const ReservationStatsSchema = z.object({
  total: z.number().int(),
  started: z.number().int(),
  submitted: z.number().int(),
  confirmed: z.number().int(),
  rejected: z.number().int(),
  cancelled: z.number().int(),
  /** Paid amounts on confirmed reservations — money that is in. */
  confirmedCents: z.number().int(),
  /** Paid amounts on submitted reservations — sent, not yet checked. */
  submittedCents: z.number().int(),
});
export type ReservationStats = z.infer<typeof ReservationStatsSchema>;

export const ReservationCenterStatsSchema = ReservationStatsSchema.extend({
  centerId: z.string(),
  centerName: z.string(),
});
export type ReservationCenterStats = z.infer<typeof ReservationCenterStatsSchema>;

export const RESERVATION_PAGE_SIZE = 50;

export const AdminReservationsQuerySchema = z.object({
  centerId: z.uuid().optional(),
  status: z.enum(RESERVATION_STATUSES).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type AdminReservationsQuery = z.input<typeof AdminReservationsQuerySchema>;

/** `GET /api/admin/center-reservations`. */
export const AdminReservationsSchema = z.object({
  items: z.array(AdminReservationSchema),
  /** Rows matching the filter — for paging. */
  matching: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totals: ReservationStatsSchema,
  byCenter: z.array(ReservationCenterStatsSchema),
});
export type AdminReservations = z.infer<typeof AdminReservationsSchema>;

export const REVIEW_ACTIONS = ['confirm', 'reject', 'cancel', 'reopen'] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** `POST /api/admin/center-reservations/:id/review`. */
export const ReservationReviewSchema = z
  .object({
    action: z.enum(REVIEW_ACTIONS),
    reason: z.string().trim().max(300).optional(),
  })
  .strict();
export type ReservationReview = z.infer<typeof ReservationReviewSchema>;

/** The page's switches — `GET`/`PUT /api/admin/center-reservations/settings`. */
export const ReservationSettingsSchema = z.object({
  isOpen: z.boolean(),
  headline: z.string().trim().max(120).nullable(),
  note: z.string().trim().max(600).nullable(),
  grades: z.array(z.enum(GRADE_SLUGS)).min(1, 'سنة واحدة على الأقل').max(GRADES.length),
  askTrack: z.boolean(),
  askSystem: z.boolean(),
  askGender: z.boolean(),
  payPercent: z.number().int().min(0).max(100),
});
export type ReservationSettings = z.infer<typeof ReservationSettingsSchema>;

/** One centre's reservation set-up. */
export const ReservationCenterSetupSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  reservationsOpen: z.boolean(),
  /** Active groups, and how many of them have a session price. */
  slots: z.number().int(),
  pricedSlots: z.number().int(),
  instapay: z.string().nullable(),
  vodafoneCash: z.string().nullable(),
});
export type ReservationCenterSetup = z.infer<typeof ReservationCenterSetupSchema>;

/** `PATCH /api/admin/center-reservations/centers/:id`. */
export const ReservationCenterPatchSchema = z
  .object({
    reservationsOpen: z.boolean().optional(),
    instapay: optionalWallet.optional(),
    vodafoneCash: optionalWallet.optional(),
  })
  .strict();
export type ReservationCenterPatch = z.input<typeof ReservationCenterPatchSchema>;

/** A centre owner's login. */
export const CenterManagerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  centerId: z.string(),
  centerName: z.string(),
  disabled: z.boolean(),
  createdAt: z.string(),
});
export type CenterManager = z.infer<typeof CenterManagerSchema>;

/** `GET /api/admin/center-reservations/setup` — everything the settings screen needs. */
export const ReservationSetupSchema = z.object({
  settings: ReservationSettingsSchema,
  centers: z.array(ReservationCenterSetupSchema),
  managers: z.array(CenterManagerSchema),
  /** The platform's own numbers, shown as the fallback under each centre. */
  platformPayment: z.object({ instapay: z.string().nullable(), vodafoneCash: z.string().nullable() }),
});
export type ReservationSetup = z.infer<typeof ReservationSetupSchema>;

export const CENTER_MANAGER_PASSWORD_MIN = 8;

const ManagerPassword = z
  .string()
  .min(CENTER_MANAGER_PASSWORD_MIN, 'كلمة السر ٨ حروف أو أرقام على الأقل')
  .max(128);

/** `POST /api/admin/center-reservations/managers`. */
export const CenterManagerCreateSchema = z
  .object({
    centerId: z.uuid(),
    name: z.string().trim().min(2, 'اسم صاحب الحساب مطلوب').max(80),
    phone: egPhone('رقم الموبايل مطلوب — بيه بيدخل'),
    password: ManagerPassword,
  })
  .strict();
export type CenterManagerCreate = z.input<typeof CenterManagerCreateSchema>;

/** `POST /api/admin/center-reservations/managers/:userId/password`. */
export const CenterManagerPasswordSchema = z.object({ password: ManagerPassword }).strict();

/* ── The centre owner's panel ────────────────────────────────────────────── */

/** `GET /api/center-portal`. */
export const CenterPortalSchema = z.object({
  center: z.object({ id: z.string(), name: z.string(), address: z.string().nullable() }),
  stats: ReservationStatsSchema,
  reservations: z.array(AdminReservationSchema),
});
export type CenterPortal = z.infer<typeof CenterPortalSchema>;

/** Grade slug → its label, for any surface that shows a reservation. */
export function reservationGradeLabel(slug: string): string {
  return GRADES.find((grade) => grade.slug === slug)?.labelAr ?? slug;
}

/** `percent` of a session, in whole pounds — nobody is quoted «٧٢٫٥٠». */
export function bookingAmountCents(priceCents: number | null, percent: number): number {
  if (priceCents === null || priceCents <= 0 || percent <= 0) return 0;
  return Math.round((priceCents * percent) / 100 / 100) * 100;
}
