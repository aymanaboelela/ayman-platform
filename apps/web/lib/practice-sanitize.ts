import 'server-only';
import type { ReviewQuestion } from '@ayman/contracts/quiz/attempt';
import type { ExternalBookPracticeSession } from '@ayman/contracts/quiz/external-books';
import { sanitizeRichText } from '@/lib/sanitize-html';

/**
 * The second sanitization pass for a book practice — the one the quiz pages
 * have always run and this flow shipped without.
 *
 * `<SafeHtml>` renders what it is handed and checks nothing; its contract is
 * that every string has been through `sanitizeRichText` on the server first
 * (see `components/content/safe-html.tsx`). The practice page passed the
 * bank's stems and options straight through, and the result arrived from a
 * client-side POST that no server ever looked at. Both now come through here:
 * the page sanitizes what it renders, and the submit goes through a server
 * action that sanitizes the result before the browser sees it.
 */
export function sanitizePracticeSession(session: ExternalBookPracticeSession): ExternalBookPracticeSession {
  return {
    ...session,
    questions: session.questions.map((question) => ({
      ...question,
      stemHtml: sanitizeRichText(question.stemHtml),
      options: question.options.map((option) => ({ ...option, bodyHtml: sanitizeRichText(option.bodyHtml) })),
    })),
  };
}

/** Same as the review page's `sanitizeReviewQuestion`, over the practice review. */
export function sanitizeReview(questions: readonly ReviewQuestion[]): ReviewQuestion[] {
  return questions.map((question) => ({
    ...question,
    stemHtml: sanitizeRichText(question.stemHtml),
    options: question.options.map((option) => ({ ...option, bodyHtml: sanitizeRichText(option.bodyHtml) })),
    ...(question.feedbackHtml === undefined ? {} : { feedbackHtml: sanitizeRichText(question.feedbackHtml) }),
    ...(question.generalFeedbackHtml === undefined
      ? {}
      : { generalFeedbackHtml: sanitizeRichText(question.generalFeedbackHtml) }),
  }));
}
