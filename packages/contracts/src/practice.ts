import { z } from '@ayman/contracts/zod';

/**
 * «اختبارات مجانية» — the public, no-account self-test on every lesson.
 *
 * ## Shape
 *
 * A SET is one lesson's quiz for one year AND one track: «تانية بكالوريا ·
 * عربي · درس 2-1» and «تانية بكالوريا · لغات · Lesson 2-1» are two sets, with
 * different questions in different languages. A set holds an ordered list of
 * questions, each auto-gradable: `mcq` (one right option out of 2–6) or `tf`.
 *
 * ## Why this is not the question bank
 *
 * The bank is the paid product: every route that reads it sits behind a
 * session, and option fractions must never reach a learner who has not
 * submitted. These questions exist to be GIVEN AWAY — the public read returns
 * the key with the question, because grading happens in the visitor's browser
 * and nothing is ever written back. Keeping the two apart means no rule of the
 * bank has to grow an exception for an anonymous reader.
 */

export const PRACTICE_YEARS = [1, 2] as const;
export const PracticeYearSchema = z.union([z.literal(1), z.literal(2)]);
export type PracticeYear = z.infer<typeof PracticeYearSchema>;

/** The URL segment too: `/practice/2/arabic/2-1`. */
export const PRACTICE_TRACKS = ['arabic', 'languages'] as const;
export const PracticeTrackSchema = z.enum(PRACTICE_TRACKS);
export type PracticeTrack = z.infer<typeof PracticeTrackSchema>;

/** «2-1», «6-10» — unit, then lesson. A URL segment, so nothing else. */
export const PracticeLessonCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}-\d{1,2}$/);

export const PracticeQuestionTypeSchema = z.enum(['mcq', 'tf']);
export type PracticeQuestionType = z.infer<typeof PracticeQuestionTypeSchema>;

const Stem = z.string().trim().min(3).max(1000);
const Option = z.string().trim().min(1).max(400);
const Explanation = z.string().trim().max(1500);

/**
 * One question as written. For `tf`, `options` is empty and `answer` is
 * 0 (صح / True) or 1 (غلط / False); for `mcq`, 2–6 distinct options and
 * `answer` indexes one of them.
 */
export const PracticeQuestionInputSchema = z
  .object({
    type: PracticeQuestionTypeSchema,
    stem: Stem,
    options: z.array(Option).max(6).default([]),
    answer: z.number().int().min(0),
    explanation: Explanation.default(''),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'tf') {
      if (q.options.length > 0) ctx.addIssue({ code: 'custom', path: ['options'], message: 'tf has no options' });
      if (q.answer > 1) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'tf answer is 0 or 1' });
      return;
    }
    if (q.options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'mcq needs 2–6 options' });
    // Case-SENSITIVE on purpose: the ASCII lesson asks «O» against «o», and
    // «LOVE» against «Love» — distinct answers there, not a duplicate.
    if (new Set(q.options).size !== q.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'options must be distinct' });
    }
    if (q.answer >= q.options.length) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'answer out of range' });
  });
export type PracticeQuestionInput = z.infer<typeof PracticeQuestionInputSchema>;

export const PracticeQuestionSchema = z.object({
  id: z.uuid(),
  type: PracticeQuestionTypeSchema,
  stem: z.string(),
  options: z.array(z.string()),
  answer: z.number().int(),
  explanation: z.string(),
  position: z.number().int(),
});
export type PracticeQuestion = z.infer<typeof PracticeQuestionSchema>;

const SetMeta = {
  year: PracticeYearSchema,
  track: PracticeTrackSchema,
  lessonCode: PracticeLessonCodeSchema,
  title: z.string().trim().min(2).max(200),
  /** «الوحدة الثانية: الأمن السيبراني». Optional; the page falls back to «الوحدة 2». */
  unitTitle: z.string().trim().max(200).nullable().default(null),
  /** Slug of the free «شرح درس» article under `/news/`, or null. */
  articleSlug: z.string().trim().max(120).nullable().default(null),
};

// ── public ───────────────────────────────────────────────────────────────

export const PracticePublicSetSummarySchema = z.object({
  year: PracticeYearSchema,
  track: PracticeTrackSchema,
  lessonCode: z.string(),
  title: z.string(),
  unitTitle: z.string().nullable(),
  articleSlug: z.string().nullable(),
  questionCount: z.number().int(),
});
export type PracticePublicSetSummary = z.infer<typeof PracticePublicSetSummarySchema>;

/** `GET /api/practice/sets` — every PUBLISHED set with at least one question. */
export const PracticePublicListSchema = z.object({
  sets: z.array(PracticePublicSetSummarySchema),
});
export type PracticePublicList = z.infer<typeof PracticePublicListSchema>;

/** `GET /api/practice/sets/:year/:track/:lessonCode` — the set, key included. */
export const PracticePublicSetSchema = PracticePublicSetSummarySchema.extend({
  questions: z.array(PracticeQuestionSchema.omit({ position: true })),
});
export type PracticePublicSet = z.infer<typeof PracticePublicSetSchema>;

// ── admin ────────────────────────────────────────────────────────────────

export const AdminPracticeSetRowSchema = PracticePublicSetSummarySchema.extend({
  id: z.uuid(),
  published: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type AdminPracticeSetRow = z.infer<typeof AdminPracticeSetRowSchema>;

export const AdminPracticeSetDetailSchema = AdminPracticeSetRowSchema.extend({
  questions: z.array(PracticeQuestionSchema),
});
export type AdminPracticeSetDetail = z.infer<typeof AdminPracticeSetDetailSchema>;

export const PracticeSetCreateSchema = z.object({
  ...SetMeta,
  published: z.boolean().default(false),
});
export type PracticeSetCreate = z.infer<typeof PracticeSetCreateSchema>;

/**
 * ⚠️ Written out, not `PracticeSetCreateSchema.partial()`: `.partial()` keeps
 * every `.default()`, so a PATCH that only renames the title would also reset
 * `published` to false and null the article (`partial-patch-injected-defaults`).
 */
export const PracticeSetPatchSchema = z.object({
  year: PracticeYearSchema.optional(),
  track: PracticeTrackSchema.optional(),
  lessonCode: PracticeLessonCodeSchema.optional(),
  title: z.string().trim().min(2).max(200).optional(),
  unitTitle: z.string().trim().max(200).nullable().optional(),
  articleSlug: z.string().trim().max(120).nullable().optional(),
  published: z.boolean().optional(),
});
export type PracticeSetPatch = z.infer<typeof PracticeSetPatchSchema>;

/** Appends questions in order — the dashboard's «لصق أسئلة كتير» and the importer. */
export const PracticeQuestionBatchSchema = z.object({
  questions: z.array(PracticeQuestionInputSchema).min(1).max(200),
});
export type PracticeQuestionBatch = z.infer<typeof PracticeQuestionBatchSchema>;

/** The full new order; must name every question of the set exactly once. */
export const PracticeQuestionReorderSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
});
export type PracticeQuestionReorder = z.infer<typeof PracticeQuestionReorderSchema>;
