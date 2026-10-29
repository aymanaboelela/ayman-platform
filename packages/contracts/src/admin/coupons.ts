import { z } from '@ayman/contracts/zod';
import { ListQuerySchema, listResponse } from '@ayman/contracts/admin/list';
import { CouponCodeSchema } from '@ayman/contracts/coupon-code';
import { CouponKindSchema } from '@ayman/contracts/coupons';

/**
 * «كوبونات الخصم» — the admin's half: make a code, see how often it was used
 * and how much it took off, and stop it.
 *
 * ## What can change after a code is made, and what cannot
 *
 * The code, the kind, the amount and the courses are fixed at creation. A
 * redemption is a snapshot of «X off Y», and a coupon whose 10% quietly became
 * 50% would make every earlier row on the payments screen disagree with the
 * coupon it names. A mistake there is a new code. What CAN change is when and
 * how often it may still be used — `isActive`, `endsAt`, `maxUses`,
 * `maxUsesPerStudent` — and the note.
 */

/** «تاريخ» fields arrive as ISO strings or `null` for «من غير ميعاد». */
const optionalInstant = z.iso.datetime({ offset: true }).nullable();

const PercentOffSchema = z.number().int().min(1).max(99);
/** Whole pounds only — see `coupons.ts` on why the amount stays matchable. */
const AmountOffCentsSchema = z
  .number()
  .int()
  .min(100)
  .max(10_000_000)
  .refine((cents) => cents % 100 === 0, { message: 'الخصم بالجنيه من غير قروش' });
const MaxUsesSchema = z.number().int().min(1).max(1_000_000);
const MaxPerStudentSchema = z.number().int().min(1).max(100);

export const AdminCouponCreateSchema = z
  .object({
    code: CouponCodeSchema,
    kind: CouponKindSchema,
    /** Set exactly when `kind = 'percent'`. 100% is not a coupon — see
     *  `CouponRefusalSchema.exceeds_price`. */
    percentOff: PercentOffSchema.nullable().default(null),
    /** Set exactly when `kind = 'fixed'`. */
    amountOffCents: AmountOffCentsSchema.nullable().default(null),
    /** «كل الكورسات» — or only `courseIds`. */
    allCourses: z.boolean().default(true),
    courseIds: z.uuid().array().max(200).default([]),
    startsAt: optionalInstant.default(null),
    endsAt: optionalInstant.default(null),
    /** Every student together. `null` is no ceiling. */
    maxUses: MaxUsesSchema.nullable().default(null),
    /** One student. `null` is no ceiling. */
    maxUsesPerStudent: MaxPerStudentSchema.nullable().default(1),
    isActive: z.boolean().default(true),
    note: z.string().trim().max(300).nullable().default(null),
  })
  .strict()
  .refine(
    (value) =>
      value.kind === 'percent'
        ? value.percentOff !== null && value.amountOffCents === null
        : value.amountOffCents !== null && value.percentOff === null,
    { message: 'حدد الخصم نسبة أو مبلغ', path: ['percentOff'] },
  )
  .refine((value) => value.allCourses || value.courseIds.length > 0, {
    message: 'اختار كورس واحد على الأقل',
    path: ['courseIds'],
  })
  .refine((value) => !value.allCourses || value.courseIds.length === 0, {
    message: 'الكوبون يا على كل الكورسات يا على كورسات بعينها',
    path: ['courseIds'],
  })
  .refine(
    (value) =>
      value.startsAt === null || value.endsAt === null || Date.parse(value.endsAt) > Date.parse(value.startsAt),
    { message: 'النهاية لازم تبقى بعد البداية', path: ['endsAt'] },
  );
export type AdminCouponCreateInput = z.infer<typeof AdminCouponCreateSchema>;

/**
 * The mutable half — see the header. Every key optional and with NO default:
 * a `.default()` inside a partial body writes the default over a field the
 * admin never touched.
 */
export const AdminCouponUpdateSchema = z
  .object({
    isActive: z.boolean().optional(),
    endsAt: optionalInstant.optional(),
    maxUses: MaxUsesSchema.nullable().optional(),
    maxUsesPerStudent: MaxPerStudentSchema.nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
  })
  .strict();
export type AdminCouponUpdateInput = z.infer<typeof AdminCouponUpdateSchema>;

/**
 * Derived on read, never stored. Precedence is the order a student would be
 * refused in: switched off first, then not yet, then over, then used up.
 */
export const AdminCouponStatusSchema = z.enum(['active', 'inactive', 'scheduled', 'expired', 'exhausted']);
export type AdminCouponStatus = z.infer<typeof AdminCouponStatusSchema>;

export const AdminCouponRowSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  kind: CouponKindSchema,
  percentOff: z.number().int().nullable(),
  amountOffCents: z.number().int().nullable(),
  allCourses: z.boolean(),
  courses: z.array(z.object({ id: z.uuid(), title: z.string() })),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  maxUses: z.number().int().nullable(),
  maxUsesPerStudent: z.number().int().nullable(),
  /** Live redemptions — a claim that was rejected gave its use back. */
  usesCount: z.number().int().min(0),
  /** Piastres the live redemptions took off, in total. */
  discountGivenCents: z.number().int().min(0),
  isActive: z.boolean(),
  status: AdminCouponStatusSchema,
  note: z.string().nullable(),
  createdAt: z.iso.datetime(),
  createdBy: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type AdminCouponRow = z.infer<typeof AdminCouponRowSchema>;

export const AdminCouponListSchema = listResponse(AdminCouponRowSchema).extend({
  /** Over the whole table, not the page — the tiles above the list. */
  stats: z.object({
    total: z.number().int(),
    active: z.number().int(),
    expired: z.number().int(),
    uses: z.number().int(),
    discountGivenCents: z.number().int(),
  }),
});
export type AdminCouponList = z.infer<typeof AdminCouponListSchema>;

export const AdminCouponQuerySchema = ListQuerySchema.extend({
  status: z.enum(['all', 'active', 'inactive', 'scheduled', 'expired', 'exhausted']).default('all'),
}).omit({ dir: true });
export type AdminCouponQuery = z.infer<typeof AdminCouponQuerySchema>;

/** One use of one code — the coupon's own history. */
export const AdminCouponRedemptionSchema = z.object({
  id: z.uuid(),
  submissionId: z.uuid(),
  student: z.object({ id: z.string(), name: z.string(), phone: z.string().nullable() }),
  course: z.object({ id: z.uuid(), title: z.string() }),
  originalCents: z.number().int(),
  discountCents: z.number().int(),
  /** The claim's own state: a `rejected` one gave its use back. */
  submissionStatus: z.enum(['pending', 'approved', 'rejected']),
  paidFromWallet: z.boolean(),
  releasedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminCouponRedemption = z.infer<typeof AdminCouponRedemptionSchema>;

export const AdminCouponRedemptionsSchema = z.object({
  items: z.array(AdminCouponRedemptionSchema),
});
export type AdminCouponRedemptions = z.infer<typeof AdminCouponRedemptionsSchema>;
