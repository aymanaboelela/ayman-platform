import { z } from 'zod';

/**
 * «نقاط ضعفك» — a per-topic account of a student's own marks.
 *
 * Nothing here is stored. The whole shape is recomputed on every read from
 * `attempt_questions`, exactly as `apps/web/lib/achievements.ts` recomputes
 * its badges, and for the same reason: a stored verdict outlives the thing
 * that earned it, and a student who revises and retakes must see the number
 * move.
 */

/** Questions a student must have answered in a topic before it is judged at
 *  all. One wrong answer out of one is 0%, and a card that opens by declaring
 *  a student hopeless at a topic they met once is a card they stop believing
 *  on day one. Four is the smallest number where a single unlucky answer
 *  cannot produce a verdict below 75%. */
export const MASTERY_MIN_EVIDENCE = 4;

/** Below this, a topic needs review. It is the Egyptian Bakalorya's own pass
 *  mark — NOT `Quiz.passPercent`, which defaults to 50 and is per-quiz
 *  configurable. Those answer different questions: `passPercent` is "did this
 *  sitting pass", this is "would more work here change my grade". */
export const MASTERY_REVIEW_BELOW = 70;

/** At or above this, a topic is mastered. `apps/web/lib/achievements.ts`
 *  re-exports this as `DISTINCTION_PERCENT` — the dependency runs that way
 *  because contracts may never import from `apps/web`. */
export const MASTERY_STRONG_AT = 90;

export const MasteryTopicSchema = z.object({
  categoryId: z.uuid(),
  /** The category's OWN name, never a parent's. Rolling up to the parent would
   *  average an admin's filing decision into the verdict: two subtopics under
   *  one parent, one mastered and one failed, average to a topic the student
   *  is told they are fine at. */
  name: z.string(),
  /** Questions counted. Always ≥ MASTERY_MIN_EVIDENCE. */
  answered: z.number().int(),
  /** 0–100, whole numbers. A decimal place would be precision that a
   *  four-question sample does not support. */
  accuracyPercent: z.number().int(),
  /** Where to go to fix it — null when the lesson was unpublished or its
   *  course was. The row still renders; it just has no button, because a
   *  button to a 404 is worse than none. */
  lessonId: z.uuid().nullable(),
  lessonTitle: z.string().nullable(),
  courseSlug: z.string().nullable(),
});
export type MasteryTopic = z.infer<typeof MasteryTopicSchema>;

export const StudentMasterySchema = z.object({
  /** Below MASTERY_REVIEW_BELOW, weakest first. Capped at three because the
   *  card has three rows — a list of every weak topic is a syllabus, not an
   *  instruction. */
  weakest: z.array(MasteryTopicSchema).max(3),
  /** At or above MASTERY_STRONG_AT, best first. Carries the lesson fields for
   *  shape consistency; the card never links them, because there is nothing
   *  to fix. */
  strongest: z.array(MasteryTopicSchema).max(3),
  /** Topics that cleared MASTERY_MIN_EVIDENCE, however they scored. Lets the
   *  card say «١٢ موضوع اتقاسوا» rather than implying three is everything. */
  evaluated: z.number().int(),
  /** Topics seen but still under MASTERY_MIN_EVIDENCE. */
  pending: z.number().int(),
});
export type StudentMastery = z.infer<typeof StudentMasterySchema>;
