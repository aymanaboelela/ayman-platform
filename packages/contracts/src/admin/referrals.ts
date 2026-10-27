import { z } from '@ayman/contracts/zod';
import { PAGE_SIZES } from '@ayman/contracts/admin/list';

/**
 * «التسويق ← ادعي صاحبك» — the admin's half: the program's settings, every
 * referral with its state, the students who brought the most friends, and
 * «إلغاء» on one that should not have paid.
 */

/** 1,000 EGP — one reward larger than this is a typed extra zero. */
export const REFERRAL_MAX_REWARD_CENTS = 100_000;

export const ReferralProgramSchema = z
  .object({
    enabled: z.boolean(),
    referrerRewardCents: z.number().int().min(0).max(REFERRAL_MAX_REWARD_CENTS),
    friendRewardCents: z.number().int().min(0).max(REFERRAL_MAX_REWARD_CENTS),
    /** Rewards one student may earn per Cairo calendar month. */
    monthlyCap: z.number().int().min(1).max(1000),
    /** Days a click on the link still attributes a sign-up. */
    windowDays: z.number().int().min(1).max(90),
    /** «وصلتلك مكافأة» on the referrer's WhatsApp. Never decides the credit. */
    whatsappNotice: z.boolean(),
  })
  .strict();
export type ReferralProgram = z.infer<typeof ReferralProgramSchema>;

/** What the program reads as before an admin ever saves — OFF. */
export const REFERRAL_PROGRAM_DEFAULTS: ReferralProgram = {
  enabled: false,
  referrerRewardCents: 5000,
  friendRewardCents: 2500,
  monthlyCap: 10,
  windowDays: 30,
  whatsappNotice: true,
};

export const ReferralStatusSchema = z.enum(['joined', 'credited', 'reversed', 'blocked', 'voided']);
export type ReferralStatus = z.infer<typeof ReferralStatusSchema>;

/** The abuse rules a `blocked` row names. Anything else is printed verbatim. */
export const REFERRAL_BLOCK_REASONS = ['self', 'same_phone', 'guardian_phone', 'monthly_cap', 'banned'] as const;

const PersonSchema = z.object({
  /** better-auth nanoid — never `z.uuid()`. */
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
});

export const AdminReferralRowSchema = z.object({
  id: z.uuid(),
  referrer: PersonSchema,
  referred: PersonSchema,
  status: ReferralStatusSchema,
  blockReason: z.string().nullable(),
  referrerRewardCents: z.number().int().nullable(),
  friendRewardCents: z.number().int().nullable(),
  reversedCents: z.number().int().nullable(),
  voidReason: z.string().nullable(),
  noticeOutcome: z.string().nullable(),
  createdAt: z.iso.datetime(),
  creditedAt: z.iso.datetime().nullable(),
  reversedAt: z.iso.datetime().nullable(),
});
export type AdminReferralRow = z.infer<typeof AdminReferralRowSchema>;

export const AdminReferralQuerySchema = z.object({
  status: ReferralStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce
    .number()
    .int()
    .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
    .default(20),
});
export type AdminReferralQuery = z.infer<typeof AdminReferralQuerySchema>;

export const AdminReferralListSchema = z.object({
  rows: z.array(AdminReferralRowSchema),
  rowCount: z.number().int().min(0),
  /** Per status, over the whole table — the tiles above the list. */
  totals: z.object({
    joined: z.number().int().min(0),
    credited: z.number().int().min(0),
    reversed: z.number().int().min(0),
    blocked: z.number().int().min(0),
    voided: z.number().int().min(0),
    /** Both sides' rewards on rows still `credited`, in piastres. */
    creditedCents: z.number().int().min(0),
  }),
});
export type AdminReferralList = z.infer<typeof AdminReferralListSchema>;

export const TopReferrerSchema = z.object({
  student: PersonSchema,
  /** Friends who signed up through the link, any status. */
  joined: z.number().int().min(0),
  /** Rewards credited and still standing. */
  credited: z.number().int().min(0),
  earnedCents: z.number().int().min(0),
});
export type TopReferrer = z.infer<typeof TopReferrerSchema>;

export const TopReferrersSchema = z.array(TopReferrerSchema);

export const VoidReferralSchema = z
  .object({
    reason: z.string().trim().min(3).max(300),
  })
  .strict();
export type VoidReferralInput = z.infer<typeof VoidReferralSchema>;
