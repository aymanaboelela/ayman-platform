import { z } from 'zod';

/**
 * Per-variant rules live INSIDE each member, never as a `.refine()` on the
 * union. `@hookform/resolvers` drops refinements applied on top of a
 * `z.discriminatedUnion` (resolvers issue #817) — the form would submit with
 * the rule silently unenforced on the client while the server rejected it.
 */
export const HeroPropsSchema = z.object({
  type: z.literal('hero'),
  headlineAr: z.string().min(4).max(120),
  subheadlineAr: z.string().max(240).default(''),
  ctaLabelAr: z.string().max(40).default(''),
  ctaHref: z
    .string()
    .regex(/^\/[^\s]*$/)
    .default('/courses'),
  imageAssetId: z.string().uuid().nullable().default(null),
});

export const CourseGridPropsSchema = z.object({
  type: z.literal('courseGrid'),
  titleAr: z.string().min(2).max(80),
  /** Empty = "latest N"; explicit ids = a curated row. */
  courseIds: z.array(z.string().uuid()).max(12).default([]),
  limit: z.number().int().min(1).max(12).default(6),
});

export const StatsPropsSchema = z.object({
  type: z.literal('stats'),
  titleAr: z.string().max(80).default(''),
  items: z
    .array(z.object({ labelAr: z.string().min(1).max(40), value: z.string().min(1).max(20) }))
    .min(1)
    .max(4),
});

export const TestimonialsPropsSchema = z.object({
  type: z.literal('testimonials'),
  titleAr: z.string().max(80).default(''),
  items: z
    .array(
      z.object({
        nameAr: z.string().min(2).max(60),
        bodyAr: z.string().min(4).max(400),
        avatarAssetId: z.string().uuid().nullable().default(null),
      }),
    )
    .min(1)
    .max(12),
});

export const FaqPropsSchema = z.object({
  type: z.literal('faq'),
  titleAr: z.string().max(80).default(''),
  items: z
    .array(z.object({ questionAr: z.string().min(4).max(200), answerAr: z.string().min(4).max(1200) }))
    .min(1)
    .max(20),
});

export const CtaPropsSchema = z.object({
  type: z.literal('cta'),
  headlineAr: z.string().min(4).max(120),
  ctaLabelAr: z.string().min(2).max(40),
  ctaHref: z.string().regex(/^\/[^\s]*$/),
});

export const HomeBlockPropsSchema = z.discriminatedUnion('type', [
  HeroPropsSchema,
  CourseGridPropsSchema,
  StatsPropsSchema,
  TestimonialsPropsSchema,
  FaqPropsSchema,
  CtaPropsSchema,
]);

export type HomeBlockProps = z.infer<typeof HomeBlockPropsSchema>;
export const HOME_BLOCK_TYPES = ['hero', 'courseGrid', 'stats', 'testimonials', 'faq', 'cta'] as const;

export const HomeBlockSchema = z.object({
  id: z.string(),
  key: z.string(),
  position: z.number().int(),
  isPublished: z.boolean(),
  props: HomeBlockPropsSchema,
});

export const HomeBlockListSchema = z.array(HomeBlockSchema);
export type HomeBlock = z.infer<typeof HomeBlockSchema>;
export type HomeBlockList = z.infer<typeof HomeBlockListSchema>;

/** `key`/`isPublished` travel alongside the props on create; patch never
 *  changes `key` (identity) or `type` (that would be a different block). */
export const HomeBlockCreateSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase latin, digits and - only'),
  isPublished: z.boolean().default(false),
  props: HomeBlockPropsSchema,
});
export type HomeBlockCreate = z.infer<typeof HomeBlockCreateSchema>;

export const HomeBlockPatchSchema = z.object({
  isPublished: z.boolean().optional(),
  props: HomeBlockPropsSchema.optional(),
});
export type HomeBlockPatch = z.infer<typeof HomeBlockPatchSchema>;

export const HomeBlockReorderSchema = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(50) })
  .strict()
  .refine((value) => new Set(value.ids).size === value.ids.length, {
    message: 'ids must be unique',
    path: ['ids'],
  });
export type HomeBlockReorder = z.infer<typeof HomeBlockReorderSchema>;
