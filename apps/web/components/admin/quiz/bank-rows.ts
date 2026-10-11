import { z } from 'zod';
import { QUESTION_TYPES, type QuestionType } from '@ayman/contracts/quiz/question';

/**
 * The bank list's row, as `GET /api/admin/questions` sends it — shared by the
 * page that fetches it and the client list that renders it.
 *
 * `hidden` stays in the status enum for the reason the page has always given:
 * one retired version anywhere would otherwise throw a `ZodError` and take the
 * whole list down.
 */
export const BankOptionSchema = z.object({
  id: z.string(),
  bodyHtml: z.string(),
  answerPattern: z.string().nullable(),
  fraction: z.number(),
});

export const BankVersionSchema = z.object({
  id: z.string(),
  version: z.number(),
  status: z.enum(['draft', 'ready', 'hidden']),
  type: z.enum(QUESTION_TYPES),
  stemHtml: z.string(),
  /** The explanation after a wrong answer — read beside the wording it explains. */
  generalFeedbackHtml: z.string().nullable().default(null),
  defaultMark: z.union([z.number(), z.string()]),
  options: z.array(BankOptionSchema).default([]),
});

export const BankRowSchema = z.object({
  id: z.string(),
  archivedAt: z.string().nullable().default(null),
  /** DISTINCT quizzes with a slot on this question — what «امسح» will run into. */
  usedInQuizzes: z.number().int().default(0),
  /** «صيغ مختلفة لنفس الفكرة» — the `GROUP:` a paste gave it, if any. */
  variantGroupKey: z.string().nullable().default(null),
  category: z.object({ id: z.string(), name: z.string() }),
  versions: z.array(BankVersionSchema),
});

export const BankListSchema = z.object({
  rows: z.array(BankRowSchema),
  rowCount: z.number().int(),
});

export const BankCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Questions still in the bank — an archived one is not counted. */
  questionCount: z.number().int().default(0),
  /** Of those, how many wait on «انشر» — what the category's publish-all sends. */
  draftCount: z.number().int().default(0),
});

export type BankRow = z.infer<typeof BankRowSchema>;
export type BankOption = z.infer<typeof BankOptionSchema>;
export type BankCategory = z.infer<typeof BankCategorySchema>;

/** Markup off, entities that matter back, runs of space collapsed. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A hue per question type, for its chip and the row's edge. Decorative — the
 * type is also written in words on the chip — and kept clear of green and red
 * (the correct option is `--ok` right below it) and of amber (selection).
 */
export const TYPE_HUE: Record<QuestionType, number> = {
  mcq_single: 255,
  mcq_multi: 290,
  true_false: 195,
  short_answer: 225,
  ordering: 320,
  essay: 345,
};

const CATEGORY_HUES = [195, 210, 225, 240, 255, 270, 290, 305, 320, 340] as const;

/** A stable hue per category, so «الحلقات» is the same dot on every screen.
 *  Any stable string works — a variant group's key gets its hue the same way. */
export function categoryHue(categoryId: string): number {
  let hash = 0;
  for (let index = 0; index < categoryId.length; index += 1) {
    hash = (hash * 31 + categoryId.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_HUES[hash % CATEGORY_HUES.length]!;
}

/**
 * The page's rows cut into runs of one variant group, in the order they came.
 * The API sorts by group when asked (`sort=group`), so a run is the whole
 * group on this page; a question with no group is a run of one, unboxed.
 */
export function variantRuns(rows: readonly BankRow[]): { key: string | null; rows: BankRow[] }[] {
  const runs: { key: string | null; rows: BankRow[] }[] = [];
  for (const row of rows) {
    const last = runs.at(-1);
    if (last && row.variantGroupKey !== null && last.key === row.variantGroupKey) last.rows.push(row);
    else runs.push({ key: row.variantGroupKey, rows: [row] });
  }
  return runs;
}

/** A positive weight is a correct option — the same predicate the grader and the form use. */
export function isRightOption(option: Pick<BankOption, 'fraction'>): boolean {
  return option.fraction > 0;
}
