import { z } from '@ayman/contracts/zod';

/**
 * «صحّح من جديد» — marking the answers students already gave again, against
 * the question as it reads NOW.
 *
 * Every attempt snapshots the question VERSION it was served (schema.prisma,
 * `attempt_questions.question_version_id`), and editing a question writes a
 * new version. That snapshot is right for wording — a student's review shows
 * the paper they sat — and wrong for a corrected answer key: on 2026-10-17,
 * 171 students on one stack were still marked wrong for «siri» after the
 * teacher had fixed the key, because their papers pointed at the version that
 * said «Amazon». A regrade moves those answers onto the latest published
 * version and marks them again.
 */

/** What a regrade WOULD touch — shown in the confirmation before it runs. */
export const RegradePreviewSchema = z.object({
  bankEntryId: z.string(),
  /** The version answers would move to: the latest published one. Null when
   *  the question has no published version, and then there is nothing to do. */
  version: z.number().int().nullable(),
  /** Answers sitting on an OLDER version of this question… */
  answers: z.number().int(),
  /** …of which in papers already handed in (these get re-marked)… */
  finished: z.number().int(),
  /** …and in papers still being sat (these are marked at submit, against the new key). */
  inProgress: z.number().int(),
  /** Distinct students behind those answers. */
  students: z.number().int(),
});
export type RegradePreview = z.infer<typeof RegradePreviewSchema>;

export const RegradeResultSchema = z.object({
  /** Answers moved onto the latest version. */
  moved: z.number().int(),
  /** Of those, answers in handed-in papers that were marked again. */
  regraded: z.number().int(),
  /** Marks that went up / down because of it. */
  raised: z.number().int(),
  lowered: z.number().int(),
  /**
   * Left exactly as they were: an essay (a human marks those), a mark a
   * teacher set by hand, or an answer whose option no longer exists in the
   * new version, so there is nothing honest to move it to.
   */
  skipped: z.number().int(),
  /** Papers whose total was recomputed. */
  attempts: z.number().int(),
});
export type RegradeResult = z.infer<typeof RegradeResultSchema>;

export const EMPTY_REGRADE_RESULT: RegradeResult = {
  moved: 0,
  regraded: 0,
  raised: 0,
  lowered: 0,
  skipped: 0,
  attempts: 0,
};

/** Adds two results — a quiz-wide publish regrades question by question. */
export function addRegradeResults(a: RegradeResult, b: RegradeResult): RegradeResult {
  return {
    moved: a.moved + b.moved,
    regraded: a.regraded + b.regraded,
    raised: a.raised + b.raised,
    lowered: a.lowered + b.lowered,
    skipped: a.skipped + b.skipped,
    attempts: a.attempts + b.attempts,
  };
}

/**
 * «انشر التعديلات» on an exam: every question in it whose newest version is an
 * unpublished edit gets published, and — unless the teacher unticks it — the
 * answers already given are marked again against the edit.
 */
export const PublishQuizEditsSchema = z
  .object({ regrade: z.boolean().default(true) })
  .strict();
export type PublishQuizEditsInput = z.infer<typeof PublishQuizEditsSchema>;

export const PublishQuizEditsResultSchema = z.object({
  published: z.number().int(),
  failed: z.array(z.object({ bankEntryId: z.string(), message: z.string() })),
  regrade: RegradeResultSchema,
});
export type PublishQuizEditsResult = z.infer<typeof PublishQuizEditsResultSchema>;
