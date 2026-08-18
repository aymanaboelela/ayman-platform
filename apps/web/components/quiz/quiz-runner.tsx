'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { useBackDismiss } from '@ayman/ui/hooks/use-back-dismiss';
import { ApiRequestError, apiPost } from '@/lib/api';
import { quizHref, reviewHref } from '@/lib/quiz-links';
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
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const autosave = useAttemptAutosave({
    attemptId: initial.attemptId,
    attemptToken: initial.attemptToken,
    initialSeq: initial.nextSeq,
    onSaved: (result) => setServerTime(result.serverTime),
  });

  /*
    Pull-to-refresh off, for exactly as long as this attempt is on screen.

    On a phone the paper is one scrolling column, so a flick upward from the
    top of a question is a normal thing to do and a flick that starts at scroll
    zero reloads the page on Android Chrome. Nothing is LOST when it does —
    `use-attempt-autosave.ts` flushes on `pagehide` with `keepalive` — but the
    reload costs a full round trip through `page.tsx`, which calls `resume()`
    on every load and rotates the attempt token doing it. On 3G that is several
    seconds of a countdown the student cannot pause, spent watching a skeleton.

    Written onto `<html>` from here and not into `globals.css`, because in a
    stylesheet this declaration is PRODUCT-WIDE: the dashboard, the player and
    every list would lose pull-to-refresh with it, and that gesture is how
    people reload a page they think is stale. The previous inline value is
    captured and put back, so unmounting the runner hands the gesture straight
    back — including on the way to the student's own results page.

    The block axis ONLY. Plain `overscroll-behavior: contain` would take the
    inline axis with it, and the inline axis is where the edge-swipe back
    gesture lives; killing that would "fix" the back problem by deleting the
    gesture instead of answering it, and the guard below would never run.
  */
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    return () => {
      root.style.overscrollBehaviorY = previous;
    };
  }, []);

  /*
    And the back gesture itself: on a running attempt it asks before it obeys.

    The same stop every overlay in the product now uses (`useBackDismiss`),
    with `rearm` on — an overlay is finished once back has closed it, but an
    exam is still running after the question has been asked, so the stop goes
    straight back and the second press is caught too.

    `beforeunload` is not the alternative and never was: the App Router handles
    back as a soft client navigation, so it does not fire. It covers a hard
    reload and a closed tab, which are the two cases where the attempt survives
    on the server anyway.

    Note the stop sits UNDER any overlay the runner opens. Back with the submit
    dialog up closes the dialog and nothing else — `useBackDismiss` hands each
    press to the innermost stop — and only a press with the paper bare reaches
    this one.
  */
  const { release: releaseBackGuard } = useBackDismiss(() => setLeaveDialogOpen(true), {
    rearm: true,
  });

  /*
    A stale tab has already lost this attempt to another one: the branch below
    replaces the paper with the «مفتوح في مكان تاني» notice. Asking that
    student whether they meant to leave would be asking about an exam they are
    no longer sitting — and because the guard re-arms after every press, and
    that branch renders no leave dialog, back would silently do nothing for as
    long as they kept pressing it.
  */
  useEffect(() => {
    if (autosave.status === 'stale') releaseBackGuard();
  }, [autosave.status, releaseBackGuard]);

  const current = initial.questions.find((q) => q.slotPosition === currentSlot) ?? initial.questions[0]!;
  const currentIndex = initial.questions.findIndex((q) => q.slotPosition === currentSlot);

  /*
    The question card's props, held still between keystrokes.

    `current` is a snapshot straight off `initial.questions` — the frozen,
    once-per-page-load server payload — so its own `flagged` is whatever the
    flag was AT LOAD TIME, never updated again. The response override already
    knew this (it reads live `responses` state, not `current.response`);
    `flagged` needs the identical treatment, or the flag button's own label and
    pressed-state never change no matter how many times a student clicks it —
    even though `navigatorItems`, built from the live `flags` state, correctly
    shows the toggle.

    It is a `useMemo` rather than an inline `{...current, flagged}` because
    `QuestionView` is memoised: a fresh object literal per render is a fresh
    prop identity per render, and the memo would never once match.
  */
  const currentQuestion = useMemo(
    () => ({ ...current, flagged: flags[current.slotPosition] ?? false }),
    [current, flags],
  );

  const handleChange = useCallback(
    (response: AnswerResponse | null) => {
      setResponses((prev) => ({ ...prev, [current.slotPosition]: response }));
      autosave.setAnswer(current.slotPosition, response);
    },
    [autosave, current.slotPosition],
  );

  const handleToggleFlag = useCallback(() => {
    const next = !flags[current.slotPosition];
    setFlags((prev) => ({ ...prev, [current.slotPosition]: next }));
    /*
     * `setFlag`, not `flushNow`. This used to be `flushNow()` alone, which
     * reads exactly like "save this now" and does flush pending ANSWERS — but
     * the flag was never in that payload (`SaveAnswersSchema` has no
     * `flagged`), so it reached the server only as far as this component's own
     * state. Reload, resume, or an Android pull-to-refresh mid-exam and every
     * flag was gone while the answers came back intact.
     *
     * `flushNow()` is kept alongside it: navigating away from a question the
     * student has just answered AND flagged should still push that answer, and
     * that is what it was doing correctly.
     */
    autosave.setFlag(current.slotPosition, next);
    void autosave.flushNow();
  }, [autosave, current.slotPosition, flags]);

  /*
    The navigator's data, memoised on what it CONTAINS rather than on the state
    it is derived from.

    `responses` gets a new object identity on every keystroke — the answers live
    at the top of this tree — so a `useMemo` keyed on it rebuilt this array per
    character, handed `memo(QuestionNavigator)` a fresh prop, and re-rendered
    every one of the paper's chips. On a twenty-question paper that is twenty
    buttons reconciled per letter typed into an essay, which is most of what
    «بيلاج وأنا بحل الامتحان» actually was once the sanitizer was out of the way.

    But the navigator only knows two booleans per question, and typing changes
    neither except on the empty↔non-empty transition. So the memo is keyed on a
    SIGNATURE of exactly those booleans: while it holds still, so does the array,
    and the memo on the component below finally does what it was added to do.

    A string rather than a hash: it is at most a few hundred characters, it is
    built once per render of a component that renders rarely, and — unlike a
    numeric digest — it cannot collide, so the navigator can never miss an
    update. Correctness first on the screen a student is graded on.
  */
  const navigatorSignature = initial.questions
    .map((q) => {
      const answered = responses[q.slotPosition] !== null && responses[q.slotPosition] !== undefined;
      return `${answered ? 'a' : '-'}${flags[q.slotPosition] ? 'f' : '-'}`;
    })
    .join('');

  const navigatorItems = useMemo(
    () =>
      initial.questions.map((q) => ({
        slotPosition: q.slotPosition,
        answered: responses[q.slotPosition] !== null && responses[q.slotPosition] !== undefined,
        flagged: flags[q.slotPosition] ?? false,
      })),
    /* `navigatorSignature` is a complete, collision-free encoding of every value
       this reads out of `responses` and `flags`; naming those two objects in the
       list instead is exactly what made it recompute on every keystroke. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial.questions, navigatorSignature],
  );

  const locallyUnanswered = useMemo(
    () => navigatorItems.filter((q) => !q.answered).map((q) => q.slotPosition),
    [navigatorItems],
  );

  /*
    `useCallback`, and every handler below it too.

    Not a micro-optimisation: `QuestionView` and `QuestionNavigator` are
    `memo()`d now, and a memo is only worth having if its props actually hold
    still. These were plain function declarations and inline arrows, so every
    keystroke minted a new identity for each of them and both children
    re-rendered anyway — twenty navigator buttons and the whole question card,
    per character, on a phone that has nothing spare.

    `autosave` is stable (the hook returns refs and stable callbacks), so the
    dependency lists here are genuinely short.
  */
  const goTo = useCallback((slotPosition: number) => {
    autosave.flushNow();
    setCurrentSlot(slotPosition);

    // Back to the top of the paper on every question change.
    //
    // Changing question here is React state, not a route change, so the App
    // Router's scroll restoration never fires and the document keeps whatever
    // offset the student had scrolled to. On a phone that offset is 500-600px
    // — `.runner-foot` sits below the whole question card and the navigator
    // below that again — so tapping «التالي» used to land the student in the
    // middle of the NEXT question's options with its stem off screen, on every
    // one of twenty questions. It is invisible on a desktop, where the card
    // fits one screen, which is why it survived this long.
    //
    // `behavior: 'auto'` deliberately, not `'smooth'`. The reduced-motion
    // backstop in `packages/ui/src/tokens/motion.css` forces
    // `scroll-behavior: auto !important`, but that is the CSS property, and a
    // `'smooth'` scroll OPTION bypasses it by spec — a user who asked for no
    // motion would get an animated scroll twenty times per paper. `'auto'`
    // defers to the computed property, which is what we want in both cases.
    //
    // The WINDOW, not `scrollIntoView` on `.runner-bar`: that bar is sticky at
    // the top of the viewport, and scrolling a sticky element into view parks
    // the document exactly where the element tucks under itself. Safe from the
    // marketing surface's Lenis instance too — `smooth-scroll.tsx` mounts only
    // in the `(site)` layout, and says why the quiz surface keeps the native
    // scroller.
    //
    // In `goTo` and nowhere else, so `goRelative`, the navigator's chips and
    // the submit dialog's jump-to-question all inherit it.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [autosave]);

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
      // The guard comes off the instant the attempt stops being one, and
      // BEFORE the push to the results page. A student who has just submitted
      // must never be asked whether they meant to leave the exam — least of
      // all on their way to their own result, which is the one screen they
      // pressed the button to reach.
      releaseBackGuard();
      router.push(reviewHref(lessonId, initial.attemptId));
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.info(copy.quiz.alreadySubmitted);
        // Same reason, and the 409 says it louder: the attempt is already
        // submitted, so there is nothing left to guard.
        releaseBackGuard();
        router.push(reviewHref(lessonId, initial.attemptId));
        return;
      }
      toast.error(copy.common.saveFailed);
    }
  }

  /*
    «الخروج من الامتحان» — the only way out of the runner that is not a submission.

    Flush FIRST. The autosave hook's `pagehide` handler covers a reload and a
    closed tab, but this exit is a client-side route change: no `pagehide`, no
    unload, and the hook's own cleanup clears its interval without writing the
    slot still sitting dirty in it. Without this await, the last answer the
    student typed before reaching for the back gesture is the one answer the
    server never sees.

    Then a REPLACE to the quiz's page, rather than counting the entries this
    guard has pushed and unwinding them with a `history.go(-2)`. That
    arithmetic is wrong the moment anything else touches the stack, and what it
    aims at — "wherever they came from" — is nothing at all when the attempt
    was opened from a notification, a shared link or a cold tab. The quiz page
    is the definite answer to "out of this exam", and it is where «كمّل
    امتحانك» lives, so the way back in is the first thing they see.
  */
  async function leaveAttempt(): Promise<void> {
    await autosave.flushNow();
    releaseBackGuard();
    router.replace(quizHref(lessonId));
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
            {/* `scaleX`, not a width — see `.runner-bar__meter > span` in
                study.css. Animating `inline-size` here ran layout and paint on
                every frame of every answer, inside a sticky bar, on the one
                screen that must never stutter. */}
            <span className="runner-bar__meter" aria-hidden="true">
              <span style={{ transform: `scaleX(${answeredPercent / 100})` }} />
            </span>
          </div>

          {/*
            The clock stands ALONE on this side.

            The autosave label used to sit right beside it, in the same size
            and the same grey — so the one number a student glances up for
            during a timed exam arrived with a second, unrelated word attached
            to it. It has moved down to the question card's own footer, beside
            «مسح إجابتي», which is where it belongs: it is feedback about the
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
          {/* Every prop here is stable across a keystroke — see the memos and
              callbacks above. That is what makes `memo(QuestionView)` real
              rather than decorative. */}
          <QuestionView
            saveStatus={AUTOSAVE_STATUS_LABEL[autosave.status]}
            question={currentQuestion}
            response={responses[current.slotPosition] ?? null}
            onChange={handleChange}
            onToggleFlag={handleToggleFlag}
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
              EXACTLY ONE control says «تسليم الامتحان».

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

      {/*
        What the back gesture opens. It is a question, not a barrier: a student
        who genuinely wants out gets out in one more tap, and «نكمّل الامتحان»
        is the primary and the focused one because staying is the answer the
        gesture was probably not asking for.

        `close`, not `leaveStay`, on the X — the footer already carries a
        control named «نكمّل الامتحان», and two controls with one accessible
        name in one dialog is ambiguous to anything navigating by name. The
        same rule `exam-gate-dialog.tsx` states for its own cancel.

        Pressing back AGAIN with this open closes it and leaves the student in
        the paper: the dialog is itself an overlay, so it owns the innermost
        stop while it is up, and the guard underneath re-arms untouched. Back
        therefore always means "dismiss the thing in front of me" and only asks
        this question when there is nothing in front of the paper at all.
      */}
      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent closeLabel={copy.common.close}>
          <DialogHeader>
            <DialogTitle>{copy.quiz.leaveTitle}</DialogTitle>
            <DialogDescription>{copy.quiz.leaveBody}</DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => void leaveAttempt()}>
              {copy.quiz.leaveConfirm}
            </Button>
            <Button type="button" autoFocus onClick={() => setLeaveDialogOpen(false)}>
              {copy.quiz.leaveStay}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
