import { z } from "zod";

/**
 * The landing page's section list, as data.
 *
 * ## Two kinds of block
 *
 * **Content blocks** carry the words their section renders — `hero`,
 * `whyRail`, `about`, `faq`, `stats`, `testimonials`, `cta`, `courseGrid`.
 * Editing one changes what the page says.
 *
 * **Placement blocks** carry no content at all — `instructor` and
 * `yearTracks`. Those two sections build themselves from the catalogue and
 * the taxonomy (and, for the tracks section, from a motion sequence that is
 * not expressible as form fields), so the only thing an editor can
 * meaningfully decide about them is *whether* they appear and *where*. A
 * block with a `type` and nothing else is exactly that decision, and it is
 * deliberately not padded out with props the section would ignore.
 *
 * Per-variant rules live INSIDE each member, never as a `.refine()` on the
 * union. `@hookform/resolvers` drops refinements applied on top of a
 * `z.discriminatedUnion` (resolvers issue #817) — the form would submit with
 * the rule silently unenforced on the client while the server rejected it.
 *
 * Every field added after a type ships MUST carry a `.default()`. Existing
 * rows are re-parsed by `HomeBlocksService.toDto` on every read, so a new
 * required field turns every stored block of that type into a 500.
 */

/** Shared by the sections whose heading is a plain "eyebrow / title / lead". */
const eyebrow = z.string().max(60).default("");
const lead = z.string().max(400).default("");

export const HeroPropsSchema = z.object({
  type: z.literal("hero"),
  eyebrowAr: eyebrow,
  headlineAr: z.string().min(4).max(120),
  subheadlineAr: z.string().max(240).default(""),
  /**
   * The hero's second line cycles through these. Empty means "no rotation" —
   * the section then renders `subheadlineAr` statically, which is also what
   * everyone sees under `prefers-reduced-motion`.
   */
  rotatingAr: z.array(z.string().min(1).max(120)).max(6).default([]),
  leadAr: lead,
  ctaLabelAr: z.string().max(40).default(""),
  ctaHref: z
    .string()
    .regex(/^\/[^\s]*$/)
    .default("/register"),
  secondaryCtaLabelAr: z.string().max(40).default(""),
  secondaryCtaHref: z
    .string()
    .regex(/^\/[^\s]*$/)
    .default("/courses"),
  /** The four figures under the CTAs. Fewer than four is fine; more is not. */
  stats: z
    .array(
      z.object({
        value: z.string().min(1).max(20),
        labelAr: z.string().min(1).max(40),
      }),
    )
    .max(4)
    .default([]),
  imageAssetId: z.uuid().nullable().default(null),
});

export const WhyRailPropsSchema = z.object({
  type: z.literal("whyRail"),
  titleAr: z.string().min(2).max(80),
  /** Rendered in the accent colour, immediately after `titleAr`. */
  titleAccentAr: z.string().max(60).default(""),
  leadAr: lead,
  leadSecondaryAr: lead,
  items: z
    .array(
      z.object({
        titleAr: z.string().min(2).max(60),
        bodyAr: z.string().min(4).max(240),
      }),
    )
    .min(2)
    .max(12),
});

export const CourseGridPropsSchema = z.object({
  type: z.literal("courseGrid"),
  titleAr: z.string().min(2).max(80),
  leadAr: lead,
  ctaLabelAr: z.string().max(40).default(""),
  /** Empty = "latest N"; explicit ids = a curated row. */
  courseIds: z.array(z.uuid()).max(12).default([]),
  limit: z.number().int().min(1).max(12).default(6),
});

/** Placement-only — see the module comment. */
export const InstructorPropsSchema = z.object({
  type: z.literal("instructor"),
});

/** Placement-only — see the module comment. */
export const YearTracksPropsSchema = z.object({
  type: z.literal("yearTracks"),
});

export const AboutPropsSchema = z.object({
  type: z.literal("about"),
  titleAr: z.string().min(2).max(120),
  body1Ar: z.string().max(600).default(""),
  body2Ar: z.string().max(600).default(""),
  roleAr: z.string().max(120).default(""),
  chipsAr: z.array(z.string().min(1).max(40)).max(4).default([]),
});

export const StatsPropsSchema = z.object({
  type: z.literal("stats"),
  titleAr: z.string().max(80).default(""),
  items: z
    .array(
      z.object({
        labelAr: z.string().min(1).max(40),
        value: z.string().min(1).max(20),
      }),
    )
    .min(1)
    .max(4),
});

export const TestimonialsPropsSchema = z.object({
  type: z.literal("testimonials"),
  titleAr: z.string().max(80).default(""),
  items: z
    .array(
      z.object({
        nameAr: z.string().min(2).max(60),
        bodyAr: z.string().min(4).max(400),
        avatarAssetId: z.uuid().nullable().default(null),
      }),
    )
    .min(1)
    .max(12),
});

export const FaqPropsSchema = z.object({
  type: z.literal("faq"),
  titleAr: z.string().max(80).default(""),
  eyebrowAr: eyebrow,
  items: z
    .array(
      z.object({
        questionAr: z.string().min(4).max(200),
        answerAr: z.string().min(4).max(1200),
      }),
    )
    .min(1)
    .max(20),
});

export const CtaPropsSchema = z.object({
  type: z.literal("cta"),
  headlineAr: z.string().min(4).max(120),
  leadAr: lead,
  ctaLabelAr: z.string().min(2).max(40),
  ctaHref: z.string().regex(/^\/[^\s]*$/),
});

export const HomeBlockPropsSchema = z.discriminatedUnion("type", [
  HeroPropsSchema,
  WhyRailPropsSchema,
  CourseGridPropsSchema,
  InstructorPropsSchema,
  YearTracksPropsSchema,
  AboutPropsSchema,
  StatsPropsSchema,
  TestimonialsPropsSchema,
  FaqPropsSchema,
  CtaPropsSchema,
]);

export type HomeBlockProps = z.infer<typeof HomeBlockPropsSchema>;

/**
 * ⚠️ Every entry here must also exist in the `HomeBlockType` Postgres enum
 * (`apps/api/prisma/schema.prisma`) — `HomeBlocksService.create` writes
 * `props.type` straight into that column, so a type present here and absent
 * there is a 500 on save, not a validation error.
 */
export const HOME_BLOCK_TYPES = [
  "hero",
  "whyRail",
  "courseGrid",
  "instructor",
  "yearTracks",
  "about",
  "stats",
  "testimonials",
  "faq",
  "cta",
] as const;

export type HomeBlockType = (typeof HOME_BLOCK_TYPES)[number];

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
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase latin, digits and - only"),
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
  .object({ ids: z.array(z.uuid()).min(1).max(50) })
  .strict()
  .refine((value) => new Set(value.ids).size === value.ids.length, {
    message: "ids must be unique",
    path: ["ids"],
  });
export type HomeBlockReorder = z.infer<typeof HomeBlockReorderSchema>;
