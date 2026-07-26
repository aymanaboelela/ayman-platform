'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';

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
export function QuestionNavigator({ questions, current, onSelect }: QuestionNavigatorProps) {
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
    // Logical (start/end), never physical left/right — the arrow KEYS
    // themselves are still Left/Right (that is how keyboards work), but
    // which one means "forward" flips with `dir`, which the browser already
    // handles for us: ArrowRight advances in LTR reading order and ArrowLeft
    // in RTL, so no direction branching is needed here at all.
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        move(index + 1);
        return;
      case 'ArrowLeft':
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
    <nav aria-label={copy.quiz.navigator} className="overflow-x-auto">
      <ul className="grid grid-cols-8 gap-2 sm:grid-cols-10">
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
                aria-label={`${copy.quizAdmin.columnQuestion} ${question.slotPosition + 1}`}
                tabIndex={index === activeIndex ? 0 : -1}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                onClick={() => {
                  setActiveIndex(index);
                  onSelect(question.slotPosition);
                }}
                className={cn(
                  'mono relative flex size-9 items-center justify-center rounded-sm border text-[length:var(--fs-text-sm)]',
                  'transition-colors duration-[var(--d-hover)] ease-[var(--ease)]',
                  isCurrent
                    ? 'border-accent bg-surface-2 ring-2 ring-accent'
                    : question.answered
                      ? 'border-line-strong bg-surface-3 text-fg'
                      : 'border-line-subtle bg-surface-2 text-fg-muted',
                )}
              >
                {String(question.slotPosition + 1).padStart(2, '0')}
                {question.flagged ? (
                  <span
                    aria-hidden="true"
                    className="absolute end-[-3px] top-[-3px] size-2 rounded-full bg-accent"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
