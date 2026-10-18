'use client';

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { quizExperience } from '@ayman/contracts/copy/quiz-experience';
import { formatCopy } from '@ayman/contracts/format';
import type { ReviewQuestion } from '@ayman/contracts/quiz/attempt';
import type { ExternalBookPracticeSession } from '@ayman/contracts/quiz/external-books';
import { Button } from '@ayman/ui/components/button';
import {
  submitPracticeAction,
  type PracticeSummary,
} from '@/app/(app)/library/[slug]/books/[bookId]/practice/[sessionId]/actions';
import { NavigatorKey } from '@/components/quiz/navigator-key';
import { QuestionNavigator } from '@/components/quiz/question-navigator';
import { QuestionView, type QuestionViewData } from '@/components/quiz/question-view';
import { SubmitConfirmDialog, type SubmitDialogQuestion } from '@/components/quiz/submit-confirm-dialog';
import type { AnswerResponse } from '@/components/quiz/use-attempt-autosave';
import { bookHref } from '@/lib/practice-links';
import { PracticeResultView } from './practice-result';

const x = quizExperience.practice;

interface ExternalBookPracticeRunnerProps {
  /** Sanitized on the server (`sanitizePracticeSession`). */
  session: ExternalBookPracticeSession;
  bookId: string;
  courseSlug: string;
}

/** What the runner keeps per question, by its 0-based position on the paper. */
interface Progress {
  answers: Record<number, AnswerResponse | null>;
  flags: Record<number, boolean>;
}

const EMPTY: Progress = { answers: {}, flags: {} };

/**
 * A practice's answers live only in this tab until it is handed in — there is
 * no autosave behind a practice the way there is behind an exam. So they are
 * mirrored into `sessionStorage` under the session's id: a reload, an Android
 * pull-to-refresh or a tap on the wrong link used to wipe twenty answered
 * questions without a word. Per tab and per session, and every access is
 * guarded — storage is unavailable in private windows and can throw.
 */
function storageKey(sessionId: string): string {
  return `practice:${sessionId}`;
}

function readProgress(sessionId: string): Progress {
  try {
    const raw = window.sessionStorage.getItem(storageKey(sessionId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { answers: parsed.answers ?? {}, flags: parsed.flags ?? {} };
  } catch {
    return EMPTY;
  }
}

function writeProgress(sessionId: string, progress: Progress | null): void {
  try {
    if (progress === null) window.sessionStorage.removeItem(storageKey(sessionId));
    else window.sessionStorage.setItem(storageKey(sessionId), JSON.stringify(progress));
  } catch {
    // Storage full or blocked: the answers are still in memory.
  }
}

function isAnswered(response: AnswerResponse | null | undefined): boolean {
  if (!response) return false;
  return response.kind === 'choice' ? response.optionIds.length > 0 : response.text.trim() !== '';
}

/**
 * «تدريب على أسئلة الكتاب» — built from the exam runner's own objects.
 *
 * It was a second, hand-rolled runner: its own header, its own buttons, its
 * own progress bar (which tracked the question you were ON while its label
 * claimed the share ANSWERED), its own confirmation in Modern Standard Arabic
 * («لديك {n} سؤال لم تجب عليه بعد!» — masculine, and «1 سؤال»), a navigator
 * numbered one too high (the practice API counts slots from 1, the navigator
 * from 0), and text answers that were silently thrown away. A student moving
 * between practising and sitting a paper met two different products.
 *
 * Now it is the same `.runner` — the bar, the question card, the foot, the
 * map and its key, and the same `SubmitConfirmDialog` — without the clock and
 * the autosave, which a practice does not have. Positions are 0-based here,
 * as they are everywhere in the quiz engine; the API's 1-based `slotPosition`
 * is only ever read back when the answers are sent.
 */
export function ExternalBookPracticeRunner(props: ExternalBookPracticeRunnerProps) {
  /*
   * The saved answers are restored by REMOUNTING once hydration is over, not
   * by an effect that sets state: the server has no storage, so the first
   * client render must match its empty paper, and an effect that immediately
   * re-renders is the commit `react-hooks/set-state-in-effect` rejects. The
   * `useSyncExternalStore` "am I in a browser yet" device is the one
   * `assistant-widget.tsx` and the command palette use.
   */
  const hydrated = useSyncExternalStore(subscribeNever, isBrowser, isServer);
  return <PracticeRunner key={hydrated ? 'restored' : 'server'} restore={hydrated} {...props} />;
}

function subscribeNever(): () => void {
  return () => {};
}

function isBrowser(): boolean {
  return true;
}

function isServer(): boolean {
  return false;
}

function PracticeRunner({
  session,
  bookId,
  courseSlug,
  restore,
}: ExternalBookPracticeRunnerProps & { restore: boolean }) {
  const total = session.questions.length;
  const backHref = bookHref(courseSlug, bookId);

  const [progress, setProgress] = useState<Progress>(() => (restore ? readProgress(session.sessionId) : EMPTY));
  const [current, setCurrent] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ summary: PracticeSummary; review: ReviewQuestion[] } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const question = session.questions[current];

  // Stable across renders that do not change it — `QuestionView` is memoised
  // and only holds still while its props do.
  const questionData = useMemo<QuestionViewData | null>(
    () =>
      question
        ? {
            slotPosition: current,
            type: question.type,
            stemHtml: question.stemHtml,
            maxMark: question.maxMark,
            options: question.options,
            flagged: progress.flags[current] ?? false,
            settings: question.settings ?? {},
          }
        : null,
    [question, current, progress.flags],
  );

  const update = useCallback(
    (next: (previous: Progress) => Progress) => {
      setProgress((previous) => {
        const value = next(previous);
        writeProgress(session.sessionId, value);
        return value;
      });
    },
    [session.sessionId],
  );

  const handleChange = useCallback(
    (response: AnswerResponse | null) =>
      update((previous) => ({ ...previous, answers: { ...previous.answers, [current]: response } })),
    [current, update],
  );

  const handleToggleFlag = useCallback(
    () =>
      update((previous) => ({
        ...previous,
        flags: { ...previous.flags, [current]: !(previous.flags[current] ?? false) },
      })),
    [current, update],
  );

  const goTo = useCallback((index: number) => {
    setCurrent(index);
    // The window, `'auto'` — the exam runner's `goTo` explains both choices.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigatorItems = useMemo(
    () =>
      session.questions.map((_, index) => ({
        slotPosition: index,
        answered: isAnswered(progress.answers[index]),
        flagged: progress.flags[index] ?? false,
      })),
    [session.questions, progress],
  );

  const dialogQuestions = useMemo<SubmitDialogQuestion[]>(
    () => navigatorItems.map((item, index) => ({ ...item, number: index + 1 })),
    [navigatorItems],
  );

  const jumpTo = useCallback(
    (index: number) => {
      goTo(index);
      requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }));
    },
    [goTo],
  );

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const answers = session.questions.map((item, index) => {
      const response = progress.answers[index] ?? null;
      return {
        slotPosition: item.slotPosition,
        questionId: item.questionId,
        optionIds: response?.kind === 'choice' ? response.optionIds : [],
        ...(response?.kind === 'text' ? { text: response.text } : {}),
      };
    });

    const result = await submitPracticeAction(session.sessionId, { answers });
    if (result.ok) {
      writeProgress(session.sessionId, null);
      setConfirmOpen(false);
      setDone({ summary: result.summary, review: result.review });
      window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      setSubmitError(result.reason === 'gone' ? x.sessionGone : x.submitFailed);
    }
    setSubmitting(false);
  }

  if (done) {
    return <PracticeResultView summary={done.summary} review={done.review} bookHref={backHref} />;
  }

  if (!question || !questionData) {
    return (
      <main className="mx-auto w-full max-w-[var(--w-prose)] px-4 py-8 md:px-6 md:py-10">
        <div className="empty">
          <p className="empty__title">{x.emptySession}</p>
          <div className="empty__action">
            <Link href={backHref} className="chip chip--solid">
              {x.backToBook}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const answeredCount = navigatorItems.filter((item) => item.answered).length;
  const flaggedCount = navigatorItems.filter((item) => item.flagged).length;
  const answeredPercent = total === 0 ? 0 : (answeredCount / total) * 100;
  const isLast = current >= total - 1;

  return (
    <main className="mx-auto w-full max-w-[var(--w-shell)] px-4 py-8 md:px-6 md:py-10">
      <Link href={backHref} className="quiz-back mb-2">
        <ArrowRight className="size-4" aria-hidden="true" />
        {x.backToBook}
      </Link>

      <header className="practice-head">
        <p className="practice-head__eyebrow">{session.bookTitle}</p>
        <h1 className="practice-head__title">{session.scopeTitle}</h1>
      </header>

      <div className="runner">
        <div className="runner__main">
          {/* The exam's bar without the clock: position, answered share, and
              the meter — which tracks ANSWERED, as the exam's does. The old
              bar tracked the question you were on, under a label that said
              «تم الحل». */}
          <div className="runner-bar">
            <div className="runner-bar__progress">
              <div className="runner-bar__row">
                <p className="runner-bar__count">
                  <span className="runner-bar__pos">
                    {formatCopy(copy.quiz.questionOf, { current: current + 1, total })}
                  </span>
                  <span>{formatCopy(copy.quiz.answeredCount, { answered: answeredCount, total })}</span>
                </p>
                <span className="runner-bar__pct" aria-hidden="true">
                  {Math.round(answeredPercent)}%
                </span>
              </div>
              <span className="runner-bar__meter" aria-hidden="true">
                <span style={{ transform: `scaleX(${answeredPercent / 100})` }} />
              </span>
            </div>
          </div>

          <div ref={cardRef} tabIndex={-1} className="runner-card">
            <QuestionView
              key={current}
              question={questionData}
              number={current + 1}
              response={progress.answers[current] ?? null}
              onChange={handleChange}
              onToggleFlag={handleToggleFlag}
              saveStatus=""
            />
          </div>

          <div className="runner-foot">
            <Button type="button" variant="secondary" onClick={() => goTo(current - 1)} disabled={current <= 0}>
              <ChevronRight className="size-4" aria-hidden="true" />
              {copy.quiz.previous}
            </Button>
            <div className="flex items-center gap-3">
              {isLast ? (
                <Button type="button" onClick={() => setConfirmOpen(true)}>
                  <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                  {x.submit}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="ghost" onClick={() => setConfirmOpen(true)}>
                    {x.submit}
                  </Button>
                  <Button type="button" onClick={() => goTo(current + 1)}>
                    {copy.quiz.next}
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="runner-nav">
          <p className="runner-nav__title">{copy.quiz.navigator}</p>
          <QuestionNavigator questions={navigatorItems} current={current} onSelect={goTo} />
          <p className="runner-nav__legend">
            <span>{formatCopy(copy.quiz.answeredCount, { answered: answeredCount, total })}</span>
            {flaggedCount > 0 ? (
              <>
                <span aria-hidden="true"> · </span>
                <span>{formatCopy(copy.quiz.flaggedCount, { n: flaggedCount })}</span>
              </>
            ) : null}
          </p>
          <NavigatorKey />
        </aside>
      </div>

      <SubmitConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setSubmitError(null);
        }}
        title={x.submitTitle}
        description={x.submitBody}
        questions={dialogQuestions}
        // Local, and therefore exact: there is no server copy of these answers
        // to disagree with until the moment they are sent.
        unansweredCount={total - answeredCount}
        onJump={jumpTo}
        onConfirm={() => void submit()}
        submitting={submitting}
        confirmLabel={copy.quiz.submitConfirmAction}
        submittingLabel={x.submitting}
        cancelLabel={copy.quiz.submitCancel}
        error={submitError}
      />
    </main>
  );
}
