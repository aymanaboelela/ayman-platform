'use server';

import type { ReviewQuestion } from '@ayman/contracts/quiz/attempt';
import {
  ExternalBookPracticeResultSchema,
  SubmitExternalBookPracticeSchema,
  type ExternalBookPracticeResult,
  type SubmitExternalBookPractice,
} from '@ayman/contracts/quiz/external-books';
import { apiSend } from '@/lib/api-server';
import { practiceReview } from '@/lib/practice-review';
import { sanitizeReview } from '@/lib/practice-sanitize';

export type PracticeSummary = Omit<ExternalBookPracticeResult, 'review'>;

export type PracticeSubmitResult =
  | { ok: true; summary: PracticeSummary; review: ReviewQuestion[] }
  /** `gone` — the session outlived its 24 hours in Redis (a 404). */
  | { ok: false; reason: 'gone' | 'failed' };

/**
 * «تسليم التدريب» — through the server, not straight from the browser.
 *
 * The result carries every question's stem, options and explanations as HTML,
 * and `<SafeHtml>` renders only what has already been through
 * `sanitizeRichText` — which cannot run in the browser (`lib/sanitize-html.ts`
 * is `server-only`, and keeping DOMPurify off the phone is the point). The
 * runner used to POST from the client and render the answer as-is. Here the
 * same POST happens server-side and the result leaves sanitized, normalised
 * for the review components, and split from its review so the client holds
 * one shape.
 *
 * Errors come back as a reason, never as the transport's message: the old
 * runner printed `err.message` — «POST /api/… failed with 404: …» — into the
 * dialog.
 */
export async function submitPracticeAction(
  sessionId: string,
  input: SubmitExternalBookPractice,
): Promise<PracticeSubmitResult> {
  try {
    const body = SubmitExternalBookPracticeSchema.parse(input);
    const result = await apiSend(
      'POST',
      `/api/me/external-books/practice/${encodeURIComponent(sessionId)}/submit`,
      ExternalBookPracticeResultSchema,
      body,
    );
    const { review: _review, ...summary } = result;
    return { ok: true, summary, review: sanitizeReview(practiceReview(result)) };
  } catch (error) {
    if (error instanceof Error && error.message.includes('failed with 404')) return { ok: false, reason: 'gone' };
    return { ok: false, reason: 'failed' };
  }
}
