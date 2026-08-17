'use client';

import { memo, useRef, useState, type KeyboardEvent } from 'react';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';

export interface NavigatorQuestion {
  slotPosition: number;
  answered: boolean;
  flagged: boolean;
}

export interface QuestionNavigatorProps {
  questions: readonly NavigatorQuestion[];
  current: number;
  onSelect: (slotPosition: number) => void;
}

/**
 * Four visual states only — current (amber ring), answered (filled
 * surface), flagged (amber dot), untouched (hairline border). No green, no
 * red: nothing here knows whether an answer is right, so correctness colour
 * has no business appearing on this grid.
 */
function QuestionNavigatorImpl({ questions, current, onSelect }: QuestionNavigatorProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, questions.findIndex((q) => q.slotPosition === current)),
  );

  function move(to: number) {
    const clamped = Math.min(Math.max(to, 0), questions.length - 1);
    setActiveIndex(clamped);
    buttonRefs.current[clamped]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    // Logical (forward/backward), never physical left/right. The arrow KEYS
    // themselves are still literally Left/Right (`KeyboardEvent.key` comes
    // from the physical key and layout, never from CSS `direction` — the
    // browser does NOT remap them for us, contrary to what this comment used
    // to claim). This grid is `grid-cols-*` under `dir="rtl"`, so column 1
    // (Q1) sits at the RIGHT and reading order runs right-to-left: the key
    // pointing at the NEXT item is ArrowLeft, and the key pointing at the
    // PREVIOUS item is ArrowRight — the reverse of the LTR mapping. This is
    // the exact reversal WAI-ARIA APG requires: "In right-to-left languages,
    // the direction of the arrow keys is reversed."
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        move(index + 1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        move(index - 1);
        return;
      case 'Home':
        event.preventDefault();
        move(0);
        return;
      case 'End':
        event.preventDefault();
        move(questions.length - 1);
        return;
      default:
        return;
    }
  }

  return (
    <nav aria-label={copy.quiz.navigator}>
      <ul className="runner-nav__grid">
        {questions.map((question, index) => {
          const isCurrent = question.slotPosition === current;
          return (
            <li key={question.slotPosition}>
              <button
                ref={(el) => {
                  buttonRefs.current[index] = el;
                }}
                type="button"
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${copy.common.question} ${question.slotPosition + 1}`}
                // A stable handle for "this question now holds an answer".
                // Answered-ness was expressible only as a border/background
                // class before, so the only way to observe it from outside was
                // to assert on Tailwind classes — which couples a test to
                // styling and silently stops meaning anything the moment the
                // palette changes. Screen readers are unaffected either way:
                // they read `aria-current` and the label, not this.
                data-answered={question.answered ? 'true' : 'false'}
                tabIndex={index === activeIndex ? 0 : -1}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={() => {
                  setActiveIndex(index);
                  onSelect(question.slotPosition);
                }}
                // `.nav-chip` rather than a Tailwind ternary: the three
                // states are told apart by WEIGHT and FILL, not by hue, and
                // that decision belongs beside the rest of the exam surface in
                // `study.css` — this grid is two clicks from a screen where
                // green and red mean "right" and "wrong", and a red
                // "unanswered" chip would read as a mark.
                className={cn(
                  'nav-chip',
                  isCurrent && 'nav-chip--current',
                  !isCurrent && question.answered && 'nav-chip--answered',
                )}
              >
                {String(question.slotPosition + 1).padStart(2, '0')}
                {question.flagged ? <span aria-hidden="true" className="nav-chip__flag" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Memoised — the grid is one button per question, and on a twenty-question
 * paper that is twenty buttons reconciled on every character typed into an
 * essay, because `QuizRunner` holds the answers at the top of its tree.
 *
 * ⚠️ It matches only while its props hold still. `questions` is already a
 * `useMemo` over there and `onSelect` is now a `useCallback`; an inline arrow
 * on either would turn this back into a no-op with nothing to show for it.
 */
export const QuestionNavigator = memo(QuestionNavigatorImpl);
