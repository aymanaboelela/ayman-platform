import { z } from '@ayman/contracts/zod';

/**
 * «أسئلة إجابتها الصح غالبًا متسجّلة غلط» — the admin overview's band.
 *
 * One row per question version an alert was raised for (see
 * `SuspectKeyAlert` in the schema) AND whose answers still say the key is
 * wrong right now. Fixing the key and choosing «صحّح من جديد» moves the
 * answers onto the corrected version, and the row drops out on its own.
 */
export const SuspectKeyRowSchema = z.object({
  questionVersionId: z.string(),
  /** «افتح السؤال» — `/admin/questions/:bankEntryId`. */
  bankEntryId: z.string(),
  stemText: z.string(),
  /** The lecture title of the quiz that raised it; empty if it is gone. */
  quizTitle: z.string(),
  pickedText: z.string(),
  keyText: z.string(),
  /** Answers on the most-picked unkeyed option, out of `answers`. Live. */
  picks: z.number().int(),
  answers: z.number().int(),
  /**
   * A newer version of this question is already published — the key was
   * corrected, and only the regrade is left. The band says so instead of
   * sending the teacher to fix a key that is already fixed.
   */
  edited: z.boolean(),
  alertedAt: z.iso.datetime(),
});
export type SuspectKeyRow = z.infer<typeof SuspectKeyRowSchema>;

export const SuspectKeyListSchema = z.object({ rows: z.array(SuspectKeyRowSchema) });
export type SuspectKeyList = z.infer<typeof SuspectKeyListSchema>;
