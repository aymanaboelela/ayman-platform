import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import type { ReviewQuestion } from '@ayman/contracts/quiz/attempt';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { ResultHeader } from '@/components/quiz/result-header';
import { ReviewList } from '@/components/quiz/review-list';
import type { PracticeSummary } from '@/app/(app)/library/[slug]/books/[bookId]/practice/[sessionId]/actions';
import { PracticeRetakeButton } from './practice-retake-button';

const x = quizExperience.practice;

/**
 * The practice's pass line. It is the API's rule, not a setting —
 * `StudentExternalBooksService.submitPractice` decides `passed` as
 * `percentage >= 50` — and it is stated here only so the bar can draw it.
 */
const PRACTICE_PASS_PERCENT = 50;

/**
 * A finished book practice: the same result card and review list a quiz
 * gets, so practising and sitting a paper look like the same activity, plus
 * the two ways on from it.
 *
 * Rendered by the page for a result that already exists (a reload, a shared
 * link) and by the runner straight after a submit — the same component, so
 * the screen a student lands on is the screen they get back to.
 */
export function PracticeResultView({
  summary,
  review,
  bookHref,
}: {
  summary: PracticeSummary;
  /** Sanitized and normalised on the server (`practiceReview` + `sanitizeReview`). */
  review: readonly ReviewQuestion[];
  bookHref: string;
}) {
  const retakeScopeId = summary.scopeId ?? (summary.scope === 'book' ? summary.bookId : null);

  return (
    <main className="mx-auto w-full max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10">
      <Link href={bookHref} className="quiz-back mb-2">
        <ArrowRight className="size-4" aria-hidden="true" />
        {x.backToBook}
      </Link>

      <header className="practice-head">
        <p className="practice-head__eyebrow">{summary.bookTitle}</p>
        <h1 className="practice-head__title">{summary.scopeTitle}</h1>
      </header>

      <div className="flex flex-col gap-6">
        <ResultHeader
          scaledScore={summary.score}
          gradeOutOf={summary.maxScore}
          passPercent={PRACTICE_PASS_PERCENT}
          passed={summary.passed}
          needsGrading={false}
          pendingOutOf={0}
          gradedOutOf={summary.maxScore}
        />

        <div className="result-actions">
          {/* Only where the scope can be started again: a session stored
              before `scopeId` existed, on a unit or a lesson, has nothing to
              start FROM — the old button sent the book's id as the unit's and
              landed on a 404. */}
          {retakeScopeId ? (
            <PracticeRetakeButton
              bookId={summary.bookId}
              courseSlug={summary.courseSlug}
              scope={summary.scope}
              scopeId={retakeScopeId}
              count={review.length}
            />
          ) : null}
          <Link href={bookHref} className="chip chip--quiet">
            <BookOpen className="size-4" aria-hidden="true" />
            {x.backToBook}
          </Link>
        </div>

        <section className="flex flex-col gap-6" aria-labelledby="practice-review-title">
          <div className="group-head">
            <span className="group-head__mark" aria-hidden="true" />
            <h2 id="practice-review-title" className="group-head__title">
              {x.reviewTitle}
            </h2>
          </div>
          <ReviewList questions={review} />
        </section>
      </div>
    </main>
  );
}
