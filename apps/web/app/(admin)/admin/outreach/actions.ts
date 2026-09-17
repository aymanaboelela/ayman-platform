'use server';

import { AdminAttemptReviewSchema, type AdminAttemptReview } from '@ayman/contracts/admin/attempts';
import { adminGet } from '@/lib/admin-api';

export type ReviewResult =
  | { ok: true; review: AdminAttemptReview }
  | { ok: false; message: string };

/**
 * «شوف ورقته» — the paper behind one outreach message, fetched when the popup
 * opens and never before.
 *
 * ## Why an action and not a prop on the row
 *
 * The log renders twenty messages a page. Loading every paper to render a
 * button nobody may press would be twenty joins over `attempt_questions` for
 * the one the instructor actually opens — and the payload carries full
 * question HTML and the model answers, which is a lot of bytes to ship into a
 * page in case they are wanted.
 *
 * ## Why an action and not a client `fetch`
 *
 * The admin API is reached with the session cookie through `adminGet`, server
 * side. A browser `fetch` would need the route to be callable from the client
 * with the same credentials, which is a wider surface for one popup.
 */
export async function loadAttemptReviewAction(attemptId: string): Promise<ReviewResult> {
  try {
    const review = await adminGet(
      `/api/admin/attempts/${attemptId}/review`,
      AdminAttemptReviewSchema,
    );
    return { ok: true, review };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'unknown' };
  }
}
