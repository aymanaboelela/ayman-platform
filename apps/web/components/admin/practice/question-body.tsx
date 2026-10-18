import { Check, Lightbulb } from 'lucide-react';
import { adminPractice as c } from '@ayman/contracts/copy/admin-practice';
import type { PracticeQuestionType } from '@ayman/contracts/practice';
import { cn } from '@ayman/ui/lib/cn';
import { optionLetter } from '@/components/quiz/option-letter';

/**
 * A question's options and explanation, the right answer in `--ok` with a
 * check AND the words «الإجابة الصح» — so a wrong key is caught by reading the
 * card, not by the first forty visitors. Drawn by the list card and by the
 * editor's live preview, so what the instructor checks is what was saved.
 *
 * No directive: it renders inside client components only, but has no state.
 */
export function QuestionOptions({
  type,
  options,
  answer,
}: {
  type: PracticeQuestionType;
  options: readonly string[];
  answer: number | null;
}) {
  const rows = type === 'tf' ? [c.question.true, c.question.false] : options;
  return (
    <ul className="prx-opts">
      {rows.map((option, index) => {
        const right = answer === index;
        return (
          <li key={index} className={cn('prx-opt', right && 'prx-opt--right')}>
            <span className="prx-opt__letter" aria-hidden="true">
              {type === 'tf' ? (index === 0 ? <Check className="size-3.5" /> : '×') : optionLetter(index)}
            </span>
            <span className="prx-opt__body" dir="auto">
              {option}
            </span>
            {right ? (
              <span className="prx-opt__right">
                <Check className="size-3.5" aria-hidden="true" />
                {c.question.previewRight}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function QuestionExplanation({ text }: { text: string }) {
  if (text.trim() === '') {
    return <p className="prx-explain prx-explain--none">{c.question.noExplanation}</p>;
  }
  return (
    <p className="prx-explain">
      <Lightbulb className="size-4" aria-hidden="true" />
      <span>
        <span className="sr-only">{c.question.explanationLabel}: </span>
        <span dir="auto">{text}</span>
      </span>
    </p>
  );
}
