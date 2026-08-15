import { copy } from '@ayman/contracts/copy';
import type { Correctness } from '@ayman/contracts/quiz/attempt';
import type { QuestionType } from '@ayman/contracts/quiz/question';
import { cn } from '@ayman/ui/lib/cn';
import { RichText } from '@/components/content/rich-text';

export interface ReviewQuestionOption {
  id: string;
  bodyHtml: string;
}

export interface ReviewQuestionData {
  slotPosition: number;
  attemptQuestionId: string;
  type: QuestionType;
  stemHtml: string;
  options: ReviewQuestionOption[];
  /** Every field below is OPTIONAL because the server OMITS whatever the
   *  review matrix disallows for this window — see the doc comment on
   *  `toReviewQuestion` (API). This component branches on PRESENCE only. */
  response?: unknown;
  correctness?: Correctness;
  mark?: number | null;
  maxMark?: number;
  feedbackHtml?: string;
  generalFeedbackHtml?: string;
  rightAnswerText?: string;
  /** Present iff `rightAnswer` flag is on AND the question is a choice type
   *  — the correct options' own ids (I9). Drives the per-option highlight
   *  below by ID MEMBERSHIP, never by re-splitting `rightAnswerText` back
   *  apart on `copy.quiz.answerListSeparator` (lossy the instant an
   *  option's own text contains that separator — an ordinary Arabic list
   *  comma). */
  rightAnswerOptionIds?: string[];
}

const CORRECTNESS_LABEL: Record<Correctness, string> = {
  correct: copy.quiz.correct,
  partial: copy.quiz.partial,
  incorrect: copy.quiz.incorrect,
  needsGrading: copy.quiz.needsGrading,
  unanswered: copy.quiz.notAnswered,
};

/** `--ok`/`--err` on the verdict chip and on the option highlights — the
 *  other sanctioned use of these tokens in the product, alongside
 *  `result-header.tsx`. */
const CORRECTNESS_TONE: Record<Correctness, string> = {
  correct: 'text-ok',
  incorrect: 'text-err',
  partial: 'text-fg',
  needsGrading: 'text-fg-muted',
  unanswered: 'text-fg-muted',
};

/** I8: colour alone ("green border = correct") fails WCAG 1.4.1 and is
 *  invisible to a colour-blind student or a screen reader. These are the
 *  same check/cross glyphs `question-view.tsx`'s practice-mode panel
 *  already uses — `aria-hidden` because the adjacent text label is the
 *  actual accessible signal, not the icon shape. Green/red stay reserved
 *  for correctness (this is a SECOND channel, not a replacement for the
 *  first). */
function CheckGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M3 3l10 10M13 3 3 13" />
    </svg>
  );
}

function chosenOptionIds(response: unknown): string[] {
  if (!response || typeof response !== 'object') return [];
  const record = response as Record<string, unknown>;
  return record.kind === 'choice' && Array.isArray(record.optionIds) ? (record.optionIds as string[]) : [];
}

function responseText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const record = response as Record<string, unknown>;
  return record.kind === 'text' && typeof record.text === 'string' ? record.text : null;
}

/**
 * One numbered sequence. Used twice on an ordering question — the student's
 * and the correct one.
 *
 * `correctIds` is passed only for the student's list, and marks the rows that
 * landed in the right PLACE (same index in both sequences). It is a position
 * comparison, not a membership one: every id is present in both lists by
 * definition, so "is this item in the answer" is always yes and would mark the
 * whole thing green on a completely wrong order.
 */
function OrderList({
  label,
  ids,
  options,
  correctIds,
  tone,
  emptyLabel,
}: {
  label: string;
  ids: string[];
  options: ReviewQuestionOption[];
  correctIds?: string[];
  tone?: 'ok';
  emptyLabel?: string;
}) {
  const byId = new Map(options.map((option) => [option.id, option]));
  const rows = ids.map((id) => byId.get(id)).filter((option): option is ReviewQuestionOption => Boolean(option));

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">{label}</p>
      {rows.length === 0 ? (
        <p className="text-fg-muted">{emptyLabel}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {rows.map((option, index) => {
            const inPlace = correctIds ? correctIds[index] === option.id : false;
            return (
              <li
                key={option.id}
                className={cn(
                  'flex items-start gap-2 rounded-sm border p-2.5',
                  tone === 'ok'
                    ? 'border-ok bg-[color-mix(in_oklch,var(--ok),transparent_92%)]'
                    : correctIds
                      ? inPlace
                        ? 'border-ok bg-[color-mix(in_oklch,var(--ok),transparent_94%)]'
                        : 'border-err bg-[color-mix(in_oklch,var(--err),transparent_94%)]'
                      : 'border-line-subtle',
                )}
              >
                <span className="mono shrink-0 text-[length:var(--fs-mono-label)] tabular-nums text-fg-muted">
                  {index + 1}
                </span>
                <RichText html={option.bodyHtml} className="min-w-0" />
                {/* I8: colour is never the only channel. */}
                {correctIds ? (
                  <span className={cn('shrink-0', inPlace ? 'text-ok' : 'text-err')}>
                    {inPlace ? <CheckGlyph /> : <CrossGlyph />}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export interface ReviewQuestionProps {
  question: ReviewQuestionData;
}

export function ReviewQuestion({ question }: ReviewQuestionProps) {
  const isOrdering = question.type === 'ordering';
  const isChoice =
    !isOrdering && question.type !== 'short_answer' && question.type !== 'essay';
  const chosenIds = chosenOptionIds(question.response);
  const text = responseText(question.response);

  // I9: the correct set is matched by ID membership, straight off the
  // server's `rightAnswerOptionIds` — never by re-splitting `rightAnswerText`
  // (display prose only) back apart on `copy.quiz.answerListSeparator`. That
  // used to be lossy the instant an option's own body contained the same
  // separator (an ordinary Arabic list comma), which could highlight a
  // WRONG option instead of the correct one.
  const correctIds = new Set(isChoice ? (question.rightAnswerOptionIds ?? []) : []);

  return (
    // `data-correctness` is a deliberate, stable test handle, not styling: it
    // is what `e2e/quiz-attempt-review.e2e.ts` asserts on to prove per-question
    // correctness reaches the review screen — and ONLY the review screen, never
    // during the attempt (the answer-leak contract). Asserting on the Arabic
    // label instead would couple that contract check to a copy string, and the
    // attribute is absent (rather than empty) when the server sent no verdict,
    // so `[data-correctness]` cannot match a question whose grade is withheld.
    <div
      data-correctness={question.correctness}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
          {String(question.slotPosition + 1).padStart(2, '0')}
        </p>
        <div className="flex items-center gap-3">
          {question.mark !== undefined && question.maxMark !== undefined ? (
            <p className="mono tabular-nums text-fg-muted">
              {question.mark ?? '—'} / {question.maxMark}
            </p>
          ) : null}
          {question.correctness ? (
            <p className={cn('font-medium', CORRECTNESS_TONE[question.correctness])}>
              {CORRECTNESS_LABEL[question.correctness]}
            </p>
          ) : null}
        </div>
      </div>

      <RichText html={question.stemHtml} className="text-fg" />

      {isOrdering ? (
        /*
          Two numbered lists, never per-option highlights. An ordering answer
          is a SEQUENCE: an item can be in the right place in a wrong order and
          in the wrong place in an order that is nearly right, so «this row is
          green» says nothing true. What a student needs to see is their own
          sequence beside the correct one, with the rows that landed in the
          right place marked — that is the diff that teaches.

          The student's own order is shown even when it is correct: «صح» with
          nothing to look at teaches nothing, and this is the screen they open
          to find out what they got wrong.
        */
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          {question.response !== undefined ? (
            <OrderList
              label={copy.quiz.yourOrder}
              ids={chosenIds}
              options={question.options}
              correctIds={question.rightAnswerOptionIds}
              emptyLabel={copy.quiz.notAnswered}
            />
          ) : null}
          {question.rightAnswerOptionIds?.length ? (
            <OrderList
              label={copy.quiz.rightOrder}
              ids={question.rightAnswerOptionIds}
              options={question.options}
              tone="ok"
            />
          ) : null}
        </div>
      ) : null}

      {isChoice ? (
        <ul className="flex flex-col gap-2">
          {question.options.map((option) => {
            const isChosen = chosenIds.includes(option.id);
            const isCorrectOption = correctIds.has(option.id);
            const isWrongChosen = isChosen && !isCorrectOption && question.correctness === 'incorrect';
            return (
              <li
                key={option.id}
                className={cn(
                  'flex flex-col gap-1.5 rounded-sm border p-3',
                  isCorrectOption
                    ? 'border-ok bg-[color-mix(in_oklch,var(--ok),transparent_92%)]'
                    : isWrongChosen
                      ? 'border-err bg-[color-mix(in_oklch,var(--err),transparent_92%)]'
                      : isChosen
                        ? 'border-accent'
                        : 'border-line-subtle',
                )}
              >
                <RichText html={option.bodyHtml} />
                {/* I8: colour is never the ONLY channel — every highlighted
                    row also carries an icon plus a visible text label. */}
                {isCorrectOption ? (
                  <span className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] font-medium text-ok">
                    <CheckGlyph />
                    {copy.quiz.rightAnswer}
                  </span>
                ) : isWrongChosen ? (
                  <span className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] font-medium text-err">
                    <CrossGlyph />
                    {copy.quiz.yourAnswer}
                  </span>
                ) : isChosen ? (
                  <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quiz.yourAnswer}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : isOrdering ? null : (
        <div className="flex flex-col gap-2">
          {question.response !== undefined ? (
            <div>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quiz.yourAnswer}</p>
              <p className="whitespace-pre-wrap text-fg">{text || copy.quiz.notAnswered}</p>
            </div>
          ) : null}
          {/* A short-answer pattern is TEXT, never dangerouslySetInnerHTML —
              it was deliberately never sanitized (patterns can legitimately
              contain `<`/`>`, e.g. `a < b`). */}
          {question.rightAnswerText ? (
            <div>
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quiz.rightAnswer}</p>
              <p className="text-fg">{question.rightAnswerText}</p>
            </div>
          ) : null}
        </div>
      )}

      {question.feedbackHtml ? (
        <div>
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quiz.questionFeedback}</p>
          <RichText html={question.feedbackHtml} />
        </div>
      ) : null}

      {question.generalFeedbackHtml ? (
        <div>
          <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{copy.quiz.explanation}</p>
          <RichText html={question.generalFeedbackHtml} />
        </div>
      ) : null}

    </div>
  );
}
