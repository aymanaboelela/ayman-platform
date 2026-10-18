'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, Loader2, Play, Route, ShieldCheck, type LucideIcon } from 'lucide-react';
import { arabicCount } from '@ayman/contracts/arabic-count';
import { copy } from '@ayman/contracts/copy';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy } from '@ayman/contracts/format';
import { ExternalBookPracticeSessionSchema } from '@ayman/contracts/quiz/external-books';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { ApiRequestError, apiPost } from '@/lib/api';
import { practiceHref } from '@/lib/practice-links';

const x = quizExperience.practiceStart;

/** The counts offered below the full set. The API caps a practice at 50. */
const COUNT_STEPS = [5, 10, 15, 20] as const;
const API_MAX = 50;

export interface PracticeStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  courseSlug: string;
  scope: 'book' | 'unit' | 'lesson';
  scopeId: string;
  scopeTitle: string;
  availableCount: number;
}

interface Point {
  icon: LucideIcon;
  title: string;
  body: string;
}

const POINTS: readonly Point[] = [
  { icon: Route, title: x.points.freeTitle, body: x.points.freeBody },
  { icon: Lightbulb, title: x.points.instantTitle, body: x.points.instantBody },
  { icon: ShieldCheck, title: x.points.privateTitle, body: x.points.privateBody },
];

/**
 * The gate before a book practice — how many questions, and what to expect.
 *
 * Laid out as the exam's own gate (`exam-gate-dialog.tsx`): the same list of
 * points with ember wells, the same footer. The two dialogs open the two ways
 * a student sits a set of questions, and they should look like one product.
 * What differs is the third point, which is the reassurance a practice can
 * honestly give and an exam cannot: none of this is recorded.
 *
 * ## The count
 *
 * A radio group, because exactly one count is chosen: arrow keys move between
 * them (reversed for RTL, as the APG requires), and only the chosen one is a
 * tab stop. Every label is a counted noun said properly — «5 أسئلة»، «15
 * سؤال»; the redesign printed «15 أسئلة» and «1 سؤال» — and the last is the
 * whole pool, «الكل (37)», capped at the API's 50.
 */
export function PracticeStartDialog({
  open,
  onOpenChange,
  bookId,
  courseSlug,
  scope,
  scopeId,
  scopeTitle,
  availableCount,
}: PracticeStartDialogProps) {
  const router = useRouter();
  const pool = Math.min(availableCount, API_MAX);
  const options = [...COUNT_STEPS.filter((step) => step < pool), pool].filter((step) => step > 0);
  const [count, setCount] = useState<number>(() => options.find((step) => step === 10) ?? pool);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function choose(index: number) {
    const clamped = Math.min(Math.max(index, 0), options.length - 1);
    setCount(options[clamped]!);
    optionRefs.current[clamped]?.focus();
  }

  function onOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    // Under `dir="rtl"` the NEXT option is to the left — `question-navigator.tsx`
    // carries the full note on why the arrow keys are reversed.
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      choose(index + 1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      choose(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      choose(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      choose(options.length - 1);
    }
  }

  async function start() {
    if (pending || pool === 0) return;
    setPending(true);
    setError(null);
    try {
      const session = await apiPost(
        `/api/me/external-books/${encodeURIComponent(bookId)}/practice`,
        ExternalBookPracticeSessionSchema,
        { scope, scopeId, count },
      );
      router.push(practiceHref(courseSlug, bookId, session.sessionId));
      // Left pending on purpose: the dialog goes with the route, and a button
      // that came back to life between the push and the next page would
      // invite a second practice.
    } catch (failure) {
      // A 400 here is the API's «nothing ready in this scope» — the counts on
      // the page were older than the bank. Anything else is the connection.
      setError(failure instanceof ApiRequestError && failure.status === 400 ? x.noQuestions : x.failed);
      setPending(false);
    }
  }

  const startLabel = formatCopy(x.start, { questions: arabicCount(count, quizExperience.counts.questions) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={copy.common.close} className="exam-gate-dialog">
        <DialogHeader>
          <p className="practice-head__eyebrow">{x.scope[scope]}</p>
          <DialogTitle>{scopeTitle}</DialogTitle>
          <DialogDescription>{arabicCount(pool, x.available)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <p id="practice-count-label" className="text-[length:var(--fs-text-sm)] font-medium text-fg">
            {x.countLabel}
          </p>
          <div role="radiogroup" aria-labelledby="practice-count-label" className="count-picker">
            {options.map((step, index) => {
              const checked = step === count;
              return (
                <button
                  key={step}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => setCount(step)}
                  onKeyDown={(event) => onOptionKeyDown(event, index)}
                  className="count-picker__option"
                >
                  {/* «الكل» only when it IS all of them — past the API's 50 the
                      last chip is 50, and calling that «الكل» would be a lie. */}
                  {step === availableCount && options.length > 1
                    ? formatCopy(x.all, { count: step })
                    : arabicCount(step, quizExperience.counts.questions)}
                </button>
              );
            })}
          </div>
        </div>

        <ul className="exam-gate-dialog__points">
          {POINTS.map((point) => (
            <li key={point.title} className="exam-gate-dialog__point">
              <span className="exam-gate-dialog__point-well" aria-hidden="true">
                <point.icon className="size-[1.125rem]" />
              </span>
              <span className="exam-gate-dialog__point-text">
                <strong className="exam-gate-dialog__point-title">{point.title}</strong>
                <span className="exam-gate-dialog__point-body">{point.body}</span>
              </span>
            </li>
          ))}
        </ul>

        {error ? (
          <p role="alert" className="exam-gate-dialog__tail" style={{ color: 'var(--err)' }}>
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
            {x.cancel}
          </Button>
          <Button type="button" onClick={() => void start()} disabled={pending || pool === 0} aria-busy={pending}>
            {/* Both labels in one cell, the inactive one hidden — the button
                keeps the width of the longer and nothing beside it moves. */}
            <span className="grid">
              <span className={cn('col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5', pending && 'invisible')}>
                <Play className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                {startLabel}
              </span>
              <span
                className={cn(
                  'col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5',
                  !pending && 'invisible',
                )}
              >
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
                {x.starting}
              </span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
