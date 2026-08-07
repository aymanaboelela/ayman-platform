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
import { QuestionView } from './question-view';
import { QuizTimer } from './quiz-timer';
import { SubmitDialog } from './submit-dialog';
import { type AnswerResponse, useAttemptAutosave, AUTOSAVE_STATUS_LABEL } from './use-attempt-autosave';

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
  //
  // AWAITED, which is what actually closes that race. Firing the flush and
  // opening in the same tick only narrows it: both requests are then in
  // flight together and the preflight GET frequently wins, which is exactly
  // the reported symptom — "لسه فيه 1 سؤال من غير إجابة" on a paper the
  // student had just finished. It reproduced on the faster of the two
  // Playwright projects and not the slower one, which is the signature of a
  // race, not of a missing answer.
  async function openSubmitDialog(): Promise<void> {
    await autosave.flushNow();
    setSubmitDialogOpen(true);
  }

  async function submit(): Promise<void> {
    // Same reason, higher stakes: the server grades what it has stored, so
    // the last answer must be written before the submit call, not alongside.
    await autosave.flushNow();
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

  // Derived from `navigatorItems`, which already decided what "answered" and
  // "flagged" mean — a second, parallel definition here is how the bar and the
  // navigator end up disagreeing about how many questions are done.
  const answeredCount = navigatorItems.filter((item) => item.answered).length;
  const flaggedCount = navigatorItems.filter((item) => item.flagged).length;
  const answeredPercent =
    navigatorItems.length === 0 ? 0 : (answeredCount / navigatorItems.length) * 100;
  const isLast = currentIndex >= initial.questions.length - 1;

  return (
    <div className="runner">
      <div className="runner__main">
        {/*
          The bar answers "where am I" and "how long have I got" together,
          which is how a student actually asks it. The meter tracks questions
          ANSWERED rather than questions visited: walking past a question you
          did not answer is not progress, and a bar that says it is would be
          lying at exactly the moment it matters.
        */}
        <div className="runner-bar">
          <div className="runner-bar__progress">
            <p className="runner-bar__count">
              {formatCopy(copy.quiz.questionOf, {
                current: currentIndex + 1,
                total: initial.questions.length,
              })}
              {' · '}
              {formatCopy(copy.quiz.answeredCount, {
                answered: answeredCount,
                total: initial.questions.length,
              })}
            </p>
            <span className="runner-bar__meter" aria-hidden="true">
              <span style={{ inlineSize: `${answeredPercent}%` }} />
            </span>
          </div>

          {/*
            The clock stands ALONE on this side.

            The autosave label used to sit right beside it, in the same size
            and the same grey — so the one number a student glances up for
            during a timed exam arrived with a second, unrelated word attached
            to it. It has moved down to the question card's own footer, beside
            «امسح إجابتي», which is where it belongs: it is feedback about the
            ANSWER, not about the exam.
          */}
          <QuizTimer
            deadlineAt={deadlineAt}
            serverTime={serverTime}
            graceSeconds={initial.graceSeconds}
            overdueHandling={initial.overdueHandling}
            onTimeUp={() => void submitOnce()}
          />
        </div>

        <div className="runner-card">
          <QuestionView
            saveStatus={AUTOSAVE_STATUS_LABEL[autosave.status]}
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
          />
        </div>

        <div className="runner-foot">
          {initial.navMethod === 'free' ? (
            <Button type="button" variant="secondary" onClick={() => goRelative(-1)} disabled={currentIndex <= 0}>
              {copy.quiz.previous}
            </Button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-3">
            {/*
              EXACTLY ONE control says «سلّم الامتحان».

              There were two on the last question — a dotted-underline link and
              the primary button, side by side, both opening the same dialog.
              Submit is still reachable from every question (a student should
              never have to click through the rest of the paper to bring the
              dialog up); it is simply the secondary action until there is no
              "next" left, and then it becomes the primary one.
            */}
            {isLast ? (
              <Button type="button" onClick={openSubmitDialog}>
                {copy.quiz.submit}
              </Button>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={openSubmitDialog}>
                  {copy.quiz.submit}
                </Button>
                <Button type="button" onClick={() => goRelative(1)}>
                  {copy.quiz.next}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {initial.navMethod === 'free' ? (
        <aside className="runner-nav">
          <p className="runner-nav__title">{copy.quiz.navigator}</p>
          <QuestionNavigator questions={navigatorItems} current={current.slotPosition} onSelect={goTo} />
          <p className="runner-nav__legend">
            {formatCopy(copy.quiz.answeredCount, {
              answered: answeredCount,
              total: initial.questions.length,
            })}
            {flaggedCount > 0 ? ` · ${formatCopy(copy.quiz.flaggedCount, { n: flaggedCount })}` : ''}
          </p>
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
