import { z } from 'zod';

/**
 * «نيوز» — the public articles section.
 *
 * ## What it is for
 *
 * The catalog ranks for people who already know this platform exists. This
 * ranks for «إيه هي الحلقة التكرارية» — a student who has never heard of it,
 * asking Google or an assistant. `relatedCourseSlug` is the reason the traffic
 * is worth having: every article ends on a way into the product.
 *
 * ## Two shapes, and why the list one is smaller
 *
 * `NewsListItem` deliberately omits `body`. The index page renders forty
 * cards; shipping forty full article bodies to render forty excerpts would be
 * most of the page weight, and none of it is displayed. `NewsPostDetail` is
 * the only shape that carries the article.
 *
 * ## Slug rules
 *
 * Arabic slugs are allowed and expected. A percent-encoded UTF-8 path is
 * handled correctly by every search engine, and an Arabic query matching an
 * Arabic URL is a signal a transliterated slug throws away. What is NOT
 * allowed is a slug with a slash, a space or a dot — see `NewsSlugSchema`.
 */

/**
 * ⚠️ Not `z.string().min(1)`. This value becomes a URL path segment and is
 * matched by `/news/[slug]`, so three characters have to be excluded or the
 * route silently means something else:
 *
 *   · `/` — invents a second path segment and the route stops matching.
 *   · `.` — `foo.md` would collide with the markdown-twin convention in
 *     `apps/web/lib/agents/markdown-routes.ts`, which strips a `.md` suffix
 *     before routing. A post slugged `x.md` would be unreachable.
 *   · whitespace — legal once encoded, but produces links nobody can read or
 *     paste, and Arabic slugs are already long.
 *
 * Length is capped well under the ~75 characters Google renders in a result,
 * because a slug that is truncated in the SERP is a slug carrying keywords
 * nobody sees.
 */
export const NewsSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .refine((value) => !/[/.\s]/.test(value), {
    message: 'الرابط ما ينفعش يحتوي على مسافة أو نقطة أو شرطة مائلة',
  });

export const NewsStatusSchema = z.enum(['draft', 'published']);

/**
 * ⚠️ Capped at 160 because this field IS the `<meta name="description">`.
 * Google truncates around there, and the truncation lands mid-sentence — so
 * the limit is enforced at the contract rather than left to whoever writes the
 * article to remember.
 */
export const NewsExcerptSchema = z.string().trim().min(20).max(160);

export const NewsTitleSchema = z.string().trim().min(4).max(120);

/** Markdown. 40k is roughly a 6,000-word article — long enough for anything real. */
export const NewsBodySchema = z.string().trim().min(1).max(40_000);

/**
 * The card shape. No `body` — see the header.
 *
 * `publishedAt` is non-nullable here even though the column is nullable,
 * because this shape only ever describes a PUBLISHED post, and the database
 * refuses a published row with no date (`news_posts_published_has_date`).
 * Modelling it as nullable would push a `?? ''` into every consumer for a case
 * that cannot occur.
 */
export const NewsListItemSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  coverKey: z.string().nullable(),
  publishedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Minutes, computed from the body server-side — see `readingMinutes`. */
  readingMinutes: z.number().int().min(1),
});

export const NewsPostDetailSchema = NewsListItemSchema.extend({
  body: z.string(),
  /**
   * The call to action. `null` when the article has no course yet, or when the
   * course it pointed at was unpublished — the article survives either way.
   */
  relatedCourseSlug: z.string().nullable(),
  relatedCourseTitle: z.string().nullable(),
});

export const NewsListSchema = z.object({
  posts: z.array(NewsListItemSchema),
  total: z.number().int().min(0),
});

// ── admin ────────────────────────────────────────────────────────────────

/**
 * The admin row. Carries `status` and a nullable `publishedAt`, which the
 * public shapes deliberately cannot express — a draft is invisible on the
 * wire to anyone without `news:read`.
 */
export const AdminNewsRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  status: NewsStatusSchema,
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const AdminNewsDetailSchema = AdminNewsRowSchema.extend({
  excerpt: z.string(),
  body: z.string(),
  coverKey: z.string().nullable(),
  relatedCourseId: z.uuid().nullable(),
});

export const NewsCreateSchema = z.object({
  slug: NewsSlugSchema,
  title: NewsTitleSchema,
  excerpt: NewsExcerptSchema,
  body: NewsBodySchema,
  coverKey: z.string().trim().min(1).max(200).nullable().optional(),
  relatedCourseId: z.uuid().nullable().optional(),
});

/** Every field optional — a PATCH that renames nothing but the title is normal. */
export const NewsPatchSchema = NewsCreateSchema.partial();

/**
 * Publishing is its own route and its own permission, not a `status` field on
 * the patch.
 *
 * Same reasoning as `course:publish` being separate from `course:update`: the
 * authority to fix a typo and the authority to put something on the public
 * internet under the instructor's name are genuinely different, and an editor
 * role added later should be able to hold the first without the second.
 */
export const NewsSetPublishedSchema = z.object({ isPublished: z.boolean() });

/**
 * Reading time, in whole minutes.
 *
 * ⚠️ 180 words/minute, not the ~230 quoted for English. Arabic is read more
 * slowly in every study of it, and a technical article with code blocks slower
 * still. Rounding UP with a floor of 1 because "0 دقيقة" is not a thing, and
 * because a reader who finishes early is never annoyed by the estimate.
 *
 * Computed server-side rather than in the browser so the number in the JSON-LD
 * and the number on the card are the same number.
 */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

export type NewsSlug = z.infer<typeof NewsSlugSchema>;
export type NewsStatus = z.infer<typeof NewsStatusSchema>;
export type NewsListItem = z.infer<typeof NewsListItemSchema>;
export type NewsPostDetail = z.infer<typeof NewsPostDetailSchema>;
export type NewsList = z.infer<typeof NewsListSchema>;
export type AdminNewsRow = z.infer<typeof AdminNewsRowSchema>;
export type AdminNewsDetail = z.infer<typeof AdminNewsDetailSchema>;
export type NewsCreate = z.infer<typeof NewsCreateSchema>;
export type NewsPatch = z.infer<typeof NewsPatchSchema>;
