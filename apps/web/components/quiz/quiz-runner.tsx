'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy, formatCopy } from '@ayman/contracts';
import { Button } from '@ayman/ui';
import { ApiRequestError, apiPost } from '@/lib/api';
import { reviewHref } from '@/lib/quiz-links';
import type { StartedAttempt } from './attempt-schema';
import { QuestionNavigator } from './question-navigator';
import { QuestionView, type CheckResult } from './question-view';
import { QuizTimer } from './quiz-timer';
import { SubmitDialog } from './submit-dialog';
import { type AnswerResponse, useAttemptAutosave, AUTOSAVE_STATUS_LABEL } from './use-attempt-autosave';

const CheckAnswerResultSchema = z.object({
  correctness: z.enum(['correct', 'partial', 'incorrect', 'needsGrading', 'unanswered']).optional(),
  feedbackHtml: z.string().optional(),
  rightAnswerText: z.string().optional(),
});

function toAnswerResponse(value: unknown): AnswerResponse | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.kind === 'choice' && Array.isArray(record.optionIds)) {
    return { kind: 'choice', optionIds: record.optionIds as string[] };
  }
  if (record.kind === 'text' && typeof record.text === 'string') {
    return { kind: 'text', text: record.text };
  }
  return null;
}

export interface QuizRunnerProps {
  lessonId: string;
  initial: StartedAttempt;
}

/**
 * The orchestrator. Owns the attempt's live state (answers, flags, current
 * question) and wires the server-authoritative timer, the autosave hook, the
 * navigator and the submit dialog together — none of those pieces reach out
 * to each other directly.
 */
export function QuizRunner({ lessonId, initial }: QuizRunnerProps) {
  const router = useRouter();
  const [responses, setResponses] = useState<Record<number, AnswerResponse | null>>(() =>
    Object.fromEntries(initial.questions.map((q) => [q.slotPosition, toAnswerResponse(q.response)])),
  );
  const [flags, setFlags] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(initial.questions.map((q) => [q.slotPosition, q.flagged])),
  );
  const [checkResults, setCheckResults] = useState<Record<number, CheckResult>>({});
  const [checkingSlot, setCheckingSlot] = useState<number | null>(null);
  const [currentSlot, setCurrentSlot] = useState(initial.questions[0]?.slotPosition ?? 0);
  const [serverTime, setServerTime] = useState(initial.serverTime);
  const [deadlineAt] = useState(initial.deadlineAt);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const autosave = useAttemptAutosave({
    attemptId: initial.attemptId,
    attemptToken: initial.attemptToken,
    initialSeq: initial.nextSeq,
    onSaved: (result) => setServerTime(result.serverTime),
  });

  const current = initial.questions.find((q) => q.slotPosition === currentSlot) ?? initial.questions[0]!;
  const currentIndex = initial.questions.findIndex((q) => q.slotPosition === currentSlot);

  const navigatorItems = useMemo(
    () =>
      initial.questions.map((q) => ({
        slotPosition: q.slotPosition,
        answered: responses[q.slotPosition] !== null && responses[q.slotPosition] !== undefined,
        flagged: flags[q.slotPosition] ?? false,
      })),
    [initial.questions, responses, flags],
  );

  const locallyUnanswered = useMemo(
    () => navigatorItems.filter((q) => !q.answered).map((q) => q.slotPosition),
    [navigatorItems],
  );

  function goTo(slotPosition: number) {
    autosave.flushNow();
    setCurrentSlot(slotPosition);
  }

  function goRelative(delta: number) {
    const nextIndex = currentIndex + delta;
    const target = initial.questions[nextIndex];
    if (target) goTo(target.slotPosition);
  }

  // `setAnswer` only marks a slot dirty (see `use-attempt-autosave.ts`'s own
  // doc comment) — it schedules no network call by itself, only `goTo`/
  // `flushNow` do. Answering the LAST question and immediately opening the
  // submit dialog without an intervening navigation is a completely normal
  // path, and without this flush the dialog's own `GET .../preflight` fetch
  // (fired the instant it opens) can race that still-pending write and
  // report an answer the student can plainly see on screen as unanswered.
  // Nothing is ever actually LOST either way — `submit()` below flushes
  // again before the real submission — but the confirmation count is the one
  // place this plan's own correctness bar calls out by name, so it must
  // reflect what the student just did, not what happened to reach the server
  // first.
  function openSubmitDialog() {
    autosave.flushNow();
    setSubmitDialogOpen(true);
  }

  async function submit(): Promise<void> {
    autosave.flushNow();
    try {
      await apiPost(
        `/api/quiz/attempts/${initial.attemptId}/submit`,
        z.object({ attemptId: z.string() }),
        { attemptToken: initial.attemptToken },
      );
      router.push(reviewHref(lessonId, initial.attemptId));
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.info(copy.quiz.alreadySubmitted);
        router.push(reviewHref(lessonId, initial.attemptId));
        return;
      }
      toast.error(copy.admin.common.saveFailed);
    }
  }

  async function submitOnce(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    try {
      await submit();
    } finally {
      setSubmitting(false);
    }
  }

  async function checkAnswer(slotPosition: number): Promise<void> {
    autosave.flushNow();
    setCheckingSlot(slotPosition);
    try {
      const result = await apiPost(
        `/api/quiz/attempts/${initial.attemptId}/questions/${slotPosition}/check`,
        CheckAnswerResultSchema,
        { attemptToken: initial.attemptToken },
      );
      setCheckResults((prev) => ({ ...prev, [slotPosition]: result }));
    } catch {
      toast.error(copy.admin.common.saveFailed);
    } finally {
      setCheckingSlot(null);
    }
  }

  if (autosave.status === 'stale') {
    return (
      <div className="mx-auto flex max-w-[var(--w-prose)] flex-col items-center gap-4 py-24 text-center">
        <p className="text-fg">{copy.quiz.staleTab}</p>
        <Button type="button" onClick={() => router.refresh()}>
          {copy.common.retry}
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <p className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
            {formatCopy(copy.quiz.questionOf, { current: currentIndex + 1, total: initial.questions.length })}
          </p>
          <div className="flex items-center gap-4">
            <p aria-live="polite" className="mono text-[length:var(--fs-mono-label)] text-fg-muted">
              {AUTOSAVE_STATUS_LABEL[autosave.status]}
            </p>
            <QuizTimer
              deadlineAt={deadlineAt}
              serverTime={serverTime}
              graceSeconds={initial.graceSeconds}
              overdueHandling={initial.overdueHandling}
              onTimeUp={() => void submitOnce()}
            />
          </div>
        </div>

        <QuestionView
          // `current` is a snapshot straight off `initial.questions` — the
          // frozen, once-per-page-load server payload — so its own `flagged`
          // is whatever the flag was AT LOAD TIME, never updated again. The
          // response override two lines below already knows this (it reads
          // live `responses` state, not `current.response`); `flagged` needs
          // the identical treatment, or the flag button's own label and
          // pressed-state never change no matter how many times a student
          // clicks it — even though `navigatorItems` (built straight from the
          // live `flags` state, not `current`) correctly shows the toggle.
          question={{ ...current, flagged: flags[current.slotPosition] ?? false }}
          response={responses[current.slotPosition] ?? null}
          onChange={(response) => {
            setResponses((prev) => ({ ...prev, [current.slotPosition]: response }));
            autosave.setAnswer(current.slotPosition, response);
          }}
          onToggleFlag={() => {
            setFlags((prev) => ({ ...prev, [current.slotPosition]: !prev[current.slotPosition] }));
            autosave.flushNow();
          }}
          checkResult={initial.mode === 'practice' ? (checkResults[current.slotPosition] ?? null) : undefined}
          onCheck={initial.mode === 'practice' ? () => void checkAnswer(current.slotPosition) : undefined}
          checking={checkingSlot === current.slotPosition}
        />

        <div className="flex items-center justify-between border-t border-line-subtle pt-4">
          {initial.navMethod === 'free' ? (
            <Button type="button" variant="secondary" onClick={() => goRelative(-1)} disabled={currentIndex <= 0}>
              {copy.quiz.previous}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            {/* Reachable from any question, not just the last one — a
                student should never have to click through the rest of the
                paper just to bring up the submit dialog. */}
            <button
              type="button"
              onClick={openSubmitDialog}
              className="text-[length:var(--fs-text-sm)] text-fg-muted underline decoration-dotted hover:text-fg"
            >
              {copy.quiz.submit}
            </button>
            {currentIndex < initial.questions.length - 1 ? (
              <Button type="button" onClick={() => goRelative(1)}>
                {copy.quiz.next}
              </Button>
            ) : (
              <Button type="button" onClick={openSubmitDialog}>
                {copy.quiz.submit}
              </Button>
            )}
          </div>
        </div>
      </div>

      {initial.navMethod === 'free' ? (
        <aside>
          <QuestionNavigator questions={navigatorItems} current={current.slotPosition} onSelect={goTo} />
        </aside>
      ) : null}

      <SubmitDialog
        open={submitDialogOpen}
        onOpenChange={setSubmitDialogOpen}
        attemptId={initial.attemptId}
        locallyUnanswered={locallyUnanswered}
        onJump={goTo}
        onConfirm={submitOnce}
      />
    </div>
  );
}
