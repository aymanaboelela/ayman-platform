'use server';

import { revalidatePath } from 'next/cache';
import { AdminGradeAnswerSchema } from '@ayman/contracts/admin/exams';
import { z } from '@ayman/contracts/zod';
import { adminSend } from '@/lib/admin-api';

/**
 * The PATCH answers `{ scaledScore }` — the attempt's total AFTER this mark was
 * folded in — and that number is the whole point of the screen: marking one
 * answer moves the paper, and seeing it move is the only confirmation the
 * instructor gets that the write landed. So the action returns it rather than
 * swallowing it into `{ ok: true }`.
 *
 * Nullable, and not defensively: `recomputeScoreTx` leaves `scaledScore` null
 * on an attempt with nothing gradeable in it, and rendering that as `0` would
 * be the same "unmarked reads as zero" lie this whole feature exists to end.
 */
const GradeResultSchema = z.object({ scaledScore: z.number().nullable() });

export type GradeAnswerResult =
  | { ok: true; scaledScore: number | null }
  /** No message: every failure this action can produce is a transport or a
   *  validation fault, and the screen has one sentence for all of them
   *  (`copy.admin.grading.saveFailed`). An HTTP status rendered into an RTL
   *  panel is what `AdminApiError`'s own header was written about. */
  | { ok: false };

/**
 * «احفظ الدرجة» — one answer, marked by a human.
 *
 * ⚠️ `adminSend`, not `adminSendVoid`: this route DOES answer with a body, and
 * the body is the recomputed total. The two helpers are split precisely so the
 * call site says which contract it is calling.
 *
 * ## Why the mark is not validated harder here
 *
 * `ManualGradingService.grade` CLAMPS to the slot's own `max_mark` instead of
 * refusing — «an admin typing 20 into a 5-mark box is a slip, not an
 * instruction», and a 400 in the middle of thirty papers is worse than the
 * obvious correction. So this parses against the contract (which only refuses a
 * negative or a non-number) and lets the server be the authority on the
 * ceiling. The caller snaps its own box to the stored value once the save
 * returns; see `grade-answer-card.tsx`.
 *
 * ## Why both paths are revalidated
 *
 * `adminGet` is already `cache: 'no-store'`, so nothing server-side is stale —
 * what has to be dropped is the ROUTER cache, the client-side RSC snapshot.
 * Without the first line, marking the last pending answer on a paper leaves it
 * sitting in the queue when he presses back; without the second, re-opening the
 * paper shows the old total. Same reasoning as `reviewHomeworkAction`.
 */
export async function gradeAnswerAction(
  attemptId: string,
  attemptQuestionId: string,
  input: { mark: number; feedbackHtml?: string },
): Promise<GradeAnswerResult> {
  try {
    // Parsed before it leaves even though the API validates again — `.strict()`
    // here is what stops a form bug from posting a field the route would reject
    // after the instructor has already moved on to the next answer.
    const body = AdminGradeAnswerSchema.parse(input);
    const result = await adminSend(
      'PATCH',
      `/api/admin/attempts/${attemptId}/questions/${attemptQuestionId}/grade`,
      body,
      GradeResultSchema,
    );

    revalidatePath('/admin/grading');
    revalidatePath(`/admin/grading/${attemptId}`);

    return { ok: true, scaledScore: result.scaledScore };
  } catch {
    return { ok: false };
  }
}

/**
 * «أقيّمه» و«حطه في لوحة الشرف».
 *
 * ⚠️ `onHonorBoard: true` publishes the student's name and avatar on the
 * public landing page. The confirmation lives at the call site
 * (`AttemptMark`), where the student's name is in hand to put in the sentence
 * — a server action cannot ask, and a confirm that says «متأكد؟» without
 * naming what becomes public is not a confirmation.
 *
 * `revalidatePath` on both grading views, because a rating changes the ORDER
 * of «الأوائل» and not just one row: the ranking sorts on the rating before
 * the percentage, so a five-star paper moves to the top the moment it is
 * rated. Refreshing one row would leave the list in an order the server no
 * longer agrees with.
 */
export async function markAttemptAction(
  attemptId: string,
  input: { instructorRating?: number | null; onHonorBoard?: boolean },
): Promise<{ ok: true } | { ok: false }> {
  try {
    // ⚠️ `(method, path, BODY, SCHEMA)` — the body comes third here and the
    // schema fourth, the opposite way round from `apiSend`. Swapping them
    // typechecks against `unknown` on the body parameter and fails at runtime
    // as a validation error on the response.
    await adminSend(
      'PATCH',
      `/api/admin/attempts/${attemptId}/mark`,
      input,
      z.object({
        instructorRating: z.number().nullable(),
        onHonorBoard: z.boolean(),
      }),
    );
    revalidatePath('/admin/grading');
    revalidatePath(`/admin/grading/${attemptId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

