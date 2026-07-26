import type { ReactNode } from 'react';
import { copy, type Correctness, type QuestionType } from '@ayman/contracts';
import { cn } from '@ayman/ui';
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
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

export interface ReviewQuestionProps {
  question: ReviewQuestionData;
  appealSlot?: ReactNode;
}

export function ReviewQuestion({ question, appealSlot }: ReviewQuestionProps) {
  const isChoice = question.type !== 'short_answer' && question.type !== 'essay';
  const chosenIds = chosenOptionIds(question.response);
  const text = responseText(question.response);

  // `rightAnswerText` for a choice question is the correct option BODIES
  // joined by '، ' (see the API's `describeRightAnswer`) — matched back
  // against the SAME options array by stripped text so the correct row can
  // be highlighted, not just quoted below the question.
  const correctBodies = new Set(
    isChoice && question.rightAnswerText ? question.rightAnswerText.split('، ').map((part) => part.trim()) : [],
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-2 p-5">
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

      {isChoice ? (
        <ul className="flex flex-col gap-2">
          {question.options.map((option) => {
            const isChosen = chosenIds.includes(option.id);
            const isCorrectOption = correctBodies.has(stripHtml(option.bodyHtml));
            return (
              <li
                key={option.id}
                className={cn(
                  'rounded-sm border p-3',
                  isCorrectOption
                    ? 'border-ok bg-[color-mix(in_oklch,var(--ok),transparent_92%)]'
                    : isChosen && question.correctness === 'incorrect'
                      ? 'border-err bg-[color-mix(in_oklch,var(--err),transparent_92%)]'
                      : isChosen
                        ? 'border-accent'
                        : 'border-line-subtle',
                )}
              >
                <RichText html={option.bodyHtml} />
              </li>
            );
          })}
        </ul>
      ) : (
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

      {appealSlot}
    </div>
  );
}
