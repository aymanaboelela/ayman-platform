'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ListChecks, XCircle } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { ReviewQuestion as ReviewQuestionData } from '@ayman/contracts/quiz/attempt';
import { ReviewQuestion } from './review-question';

const c = copy.quiz;

/** The correctness values that mean the student did not get the mark. */
const WRONG = new Set(['incorrect', 'partial', 'unanswered']);

/**
 * The reviewed paper, with a filter for the question a student actually came
 * here to ask: «غلطت فين؟»
 *
 * ## Why a filter and not a summary
 *
 * The review screen already rendered every question with its verdict, which
 * technically answers "where did I go wrong" — after scrolling through twenty
 * questions you got right. On a long paper the three you missed are the entire
 * point of the visit, and they were the hardest things on the page to find.
 *
 * ## Why it is client-side
 *
 * The filter shows and hides questions the SERVER already decided this student
 * may see: the 4×7 review matrix is resolved in the review serializer, and a
 * field the current window forbids is absent from the payload entirely rather
 * than hidden here. So this component cannot reveal anything — it re-orders
 * access to what is already on the page, which is exactly the kind of thing
 * that belongs in the browser rather than in a round trip.
 *
 * That is also why the toggle is only rendered when `correctness` is present.
 * In a window that withholds correctness there is nothing to filter BY, and a
 * control that silently does nothing is worse than no control.
 */
export function ReviewList({ questions }: { questions: readonly ReviewQuestionData[] }) {
  const [wrongOnly, setWrongOnly] = useState(false);

  const gradeable = useMemo(
    () => questions.filter((question) => question.correctness !== undefined),
    [questions],
  );
  const wrong = useMemo(
    () => gradeable.filter((question) => WRONG.has(question.correctness as string)),
    [gradeable],
  );

  // Nothing to filter by: this window withholds correctness entirely.
  const canFilter = gradeable.length > 0;
  const shown = wrongOnly ? wrong : questions;

  return (
    <>
      {canFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
            {wrong.length === 0
              ? c.allCorrect
              : formatCopy(c.wrongCount, { n: wrong.length, total: gradeable.length })}
          </p>

          {/*
            Hidden when there is nothing wrong. «وريني غلطاتي بس» on a perfect
            paper is a button whose only outcome is an empty screen.
          */}
          {wrong.length > 0 ? (
            <div className="review-filter" role="group" aria-label={c.reviewTitle}>
              <button
                type="button"
                className="review-filter__option"
                aria-pressed={!wrongOnly}
                onClick={() => setWrongOnly(false)}
              >
                <ListChecks className="size-4" aria-hidden="true" />
                {c.showAll}
              </button>
              <button
                type="button"
                className="review-filter__option"
                aria-pressed={wrongOnly}
                onClick={() => setWrongOnly(true)}
              >
                <XCircle className="size-4" aria-hidden="true" />
                {c.wrongOnly}
              </button>
            </div>
          ) : (
            <span className="verdict verdict--pass">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {c.passed}
            </span>
          )}
        </div>
      ) : null}

      {shown.map((question) => (
        <ReviewQuestion key={question.slotPosition} question={question} />
      ))}
    </>
  );
}
