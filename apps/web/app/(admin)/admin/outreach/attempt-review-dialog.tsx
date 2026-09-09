'use client';

import { useState, useTransition } from 'react';
import type {
  AdminAttemptReview,
  AdminAttemptReviewQuestion,
} from '@ayman/contracts/admin/attempts';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ayman/ui/components/dialog';
import { ReviewQuestion } from '@/components/quiz/review-question';
import { loadAttemptReviewAction } from './actions';

const c = copy.admin.outreach;

/**
 * The three that mean «مخدش الدرجة».
 *
 * ⚠️ Mirrors `WRONG` in `AttemptAdminService` deliberately, and must keep
 * mirroring it: `wrongCount` in the header is computed there, this filters the
 * list here, and a divergence shows as «٣ غلط» above a list of five.
 * `needsGrading` is in neither — an essay in the marking queue is not yet a
 * mistake.
 */
const WRONG = new Set<AdminAttemptReviewQuestion['correctness']>([
  'incorrect',
  'partial',
  'unanswered',
]);

/**
 * «لما أضغط على المسج أشوف الأسئلة اللي غلط فيها وحلها».
 *
 * ## Why it opens on the wrong answers
 *
 * The outreach message it hangs off already says the score and names the
 * topics. The one thing it cannot say — and the whole reason this was asked
 * for — is WHICH questions and what the right answer was. So the list is
 * filtered to the mistakes on open, with «كل الأسئلة» one press away; opening
 * on the full paper buries the three questions behind the nine he does not
 * need.
 *
 * ## Why it renders through the STUDENT's `ReviewQuestion`
 *
 * That component already solves every hard part of this: the correct option is
 * highlighted by id membership rather than by re-splitting the answer prose
 * (I9), an ordering answer is shown as two sequences instead of meaningless
 * per-row colours, the verdict carries a glyph as well as a colour for WCAG
 * 1.4.1, and the HTML goes through `SafeHtml`. A second renderer here would
 * have to get all of that right again — and would then show the instructor a
 * different picture of the paper from the one the student is looking at, which
 * is the one thing this popup must never do.
 *
 * ## Why the fetch is on open
 *
 * See `loadAttemptReviewAction`: twenty rows a page, one of which gets opened.
 */
export function AttemptReviewDialog({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<AdminAttemptReview | null>(null);
  const [failed, setFailed] = useState(false);
  const [wrongOnly, setWrongOnly] = useState(true);
  const [pending, start] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    // Fetched once per mount and then kept: a submitted paper cannot change
    // while the popup is open, so re-fetching on re-open would spend a request
    // to redraw an identical list.
    if (!next || review !== null || pending) return;
    setFailed(false);
    start(async () => {
      const result = await loadAttemptReviewAction(attemptId);
      if (result.ok) setReview(result.review);
      else setFailed(true);
    });
  }

  const questions = review
    ? review.questions.filter((item) => !wrongOnly || WRONG.has(item.correctness))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The trigger is a plain button calling `onOpenChange` rather than a
          `DialogTrigger`: opening has a side effect (the fetch), and routing
          it through the same handler the overlay's own dismiss uses keeps one
          place where "the dialog opened" is decided. */}
      <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(true)}>
        {c.reviewPaper}
      </Button>

      <DialogContent closeLabel={copy.admin.common.cancel} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {review
              ? formatCopy(c.reviewDialogTitle, {
                  student: review.studentName,
                  quiz: review.quizTitle,
                })
              : c.reviewLoading}
          </DialogTitle>
        </DialogHeader>

        {pending && !review ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.reviewLoading}</p>
        ) : null}
        {failed ? (
          <p className="text-[length:var(--fs-text-sm)] text-err">{c.reviewFailed}</p>
        ) : null}

        {review ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line px-2.5 py-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {formatCopy(c.reviewWrongOf, {
                  wrong: review.wrongCount,
                  total: review.totalCount,
                })}
              </span>
              <span className="rounded-full border border-line px-2.5 py-1 text-[length:var(--fs-text-xs)] text-fg-muted">
                {formatCopy(c.reviewScore, {
                  score: review.scaledScore ?? 0,
                  outOf: review.gradeOutOf,
                })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ms-auto"
                onClick={() => setWrongOnly((value) => !value)}
              >
                {wrongOnly ? c.reviewShowAll : c.reviewShowWrongOnly}
              </Button>
            </div>

            {questions.length === 0 ? (
              <p className="mt-3 text-[length:var(--fs-text-sm)] text-fg-muted">
                {c.reviewAllCorrect}
              </p>
            ) : (
              <div className="mt-3 grid gap-4">
                {questions.map((item) => (
                  <ReviewQuestion key={item.attemptQuestionId} question={item} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
