import { z } from '@ayman/contracts/zod';

/**
 * «عاوز مكان أحذف سؤال من بنك الأسئلة» — what deleting a question MEANS.
 *
 * A bank question is not a row that can simply go. Its versions are what every
 * past attempt's review screen renders, what «أصعب الأسئلة» in the games counts,
 * and what a quiz slot serves the next student who starts that paper. So one
 * button has three possible outcomes, decided per question by the server:
 *
 *   delete   nobody ever answered it, and no paper holds it — the row goes, and
 *            nothing anywhere pointed at it.
 *   archive  somebody answered it (a quiz attempt, a game round). It leaves the
 *            bank, the pickers and the games, and every result that used it
 *            still renders exactly as it did — «هيتشال من البنك، واللي حلّوه
 *            هيفضل في نتايجهم».
 *   blocked  a quiz still serves it — a slot on the paper, or a random pool of
 *            a published quiz that would no longer have enough to draw. It
 *            stays, and the admin is told which quizzes and where to go.
 *
 * Its own subpath, not a new export on an existing module: a tab left open on
 * the previous build keeps its Turbopack module ids, and an export added to a
 * module it already loaded is the thing that breaks it.
 */

/** One bulk action at most — two pages of the bank. */
export const QUESTION_REMOVAL_MAX = 200;

export const QUESTION_REMOVAL_OUTCOMES = ['delete', 'archive', 'blocked'] as const;
export type QuestionRemovalOutcome = (typeof QUESTION_REMOVAL_OUTCOMES)[number];

/** Bank entry ids are Postgres `uuid(7)`s — not user ids, which are nanoids. */
export const QuestionRemovalRequestSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(QUESTION_REMOVAL_MAX) })
  .strict();
export type QuestionRemovalRequest = z.infer<typeof QuestionRemovalRequestSchema>;

/** A quiz that keeps a question from leaving, named so the admin can go to it. */
export const QuestionRemovalQuizSchema = z.object({
  quizId: z.string(),
  /** The quiz's lesson title — what the admin calls the quiz. */
  title: z.string(),
  courseTitle: z.string(),
  isPublished: z.boolean(),
  /** `slot`: the question is on the paper. `pool`: a random draw of a
   *  published quiz would be left short of questions without it. */
  via: z.enum(['slot', 'pool']),
});
export type QuestionRemovalQuiz = z.infer<typeof QuestionRemovalQuizSchema>;

export const QuestionRemovalItemSchema = z.object({
  bankEntryId: z.string(),
  /** Plain text, cut short — for the confirm dialog, never rendered as HTML. */
  stem: z.string(),
  outcome: z.enum(QUESTION_REMOVAL_OUTCOMES),
  quizzes: z.array(QuestionRemovalQuizSchema),
});
export type QuestionRemovalItem = z.infer<typeof QuestionRemovalItemSchema>;

/** `POST /api/admin/questions/delete-plan` — what WOULD happen. Writes nothing. */
export const QuestionRemovalPlanSchema = z.object({
  items: z.array(QuestionRemovalItemSchema),
  /** Asked for, and not in the bank: already deleted, already archived, or never existed. */
  missing: z.array(z.string()),
});
export type QuestionRemovalPlan = z.infer<typeof QuestionRemovalPlanSchema>;

/**
 * `POST /api/admin/questions/delete` — what DID happen. Decided again inside
 * the write's own transaction, so a quiz that picked the question up between
 * the dialog opening and the click still keeps it.
 */
export const QuestionRemovalResultSchema = z.object({
  deleted: z.number().int().min(0),
  archived: z.number().int().min(0),
  blocked: z.array(QuestionRemovalItemSchema),
  missing: z.array(z.string()),
});
export type QuestionRemovalResult = z.infer<typeof QuestionRemovalResultSchema>;

/** How many of each — the three numbers the confirm dialog leads with. */
export function countRemoval(items: readonly Pick<QuestionRemovalItem, 'outcome'>[]): Record<QuestionRemovalOutcome, number> {
  const counts: Record<QuestionRemovalOutcome, number> = { delete: 0, archive: 0, blocked: 0 };
  for (const item of items) counts[item.outcome] += 1;
  return counts;
}
