'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  EXAM_SIGNAL_TEXT_MAX,
  ExamSignalsResultSchema,
  type ExamSignal,
} from '@ayman/contracts/quiz/exam-signals';
import { ApiRequestError, apiPost } from '@/lib/api';

/** Often enough that a student who closes the laptop mid-exam has been
 *  recorded; rare enough to stay well under the API's rate limit. */
const FLUSH_MS = 10_000;
/** The server takes at most 50 per request. */
const BATCH_MAX = 50;
/** A queue that cannot reach the server stops growing here. */
const QUEUE_MAX = 300;
/**
 * How long a window blur waits before it counts. Switching tabs fires `blur`
 * and then `visibilitychange`; the wait lets the second claim the event, so
 * one tab switch is one row and not two.
 */
const BLUR_SETTLE_MS = 300;

export interface UseExamSignalsOptions {
  /** `StartedAttempt.signals`. False records nothing and sends nothing. */
  enabled: boolean;
  attemptId: string;
  /** The question on screen, stamped on every row. */
  currentSlot: number;
}

/**
 * «لما حد يعمل كوبي بيست أعرف… ولو طلع برا الصفحة» — the runner's quiet record
 * of an exam, sent to `POST /api/quiz/attempts/:id/signals`. What is recorded,
 * and why it is evidence and never a verdict, is in
 * `@ayman/contracts/quiz/exam-signals`.
 *
 * ## Silent, on purpose
 *
 * Nothing here renders, toasts or blocks. The instructor asked to know without
 * the student being told, and a paste that is refused is a paste he never
 * sees. Every network failure is swallowed: an exam must never stall, or show
 * anything, because of this.
 *
 * ## `stop()`
 *
 * Handing the paper in unmounts the runner on the way to the results page, and
 * an unmount otherwise reads as «left for another page». `stop()` sends what is
 * queued and marks the unmount as the expected one.
 */
export function useExamSignals({ enabled, attemptId, currentSlot }: UseExamSignalsOptions): { stop: () => void } {
  const queueRef = useRef<ExamSignal[]>([]);
  const slotRef = useRef(currentSlot);
  const stoppedRef = useRef(false);
  const flushRef = useRef<(keepalive: boolean) => void>(() => {});

  useEffect(() => {
    slotRef.current = currentSlot;
  }, [currentSlot]);

  useEffect(() => {
    if (!enabled) return;
    stoppedRef.current = false;
    let sending = false;
    let hiddenAt: number | null = null;
    let blurredAt: number | null = null;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const push = (signal: Omit<ExamSignal, 'at' | 'slot'>) => {
      if (stoppedRef.current || queueRef.current.length >= QUEUE_MAX) return;
      queueRef.current.push({ ...signal, at: new Date().toISOString(), slot: slotRef.current });
    };

    /*
     * `keepalive` on the paths where the page is going away, the same
     * transport the answer autosave uses there: `sendBeacon` cannot carry the
     * CSRF header this API requires. A keepalive send does not wait for an
     * in-flight one, because there is no later chance.
     */
    const flush = (keepalive: boolean) => {
      if (queueRef.current.length === 0 || (sending && !keepalive)) return;
      const batch = queueRef.current.splice(0, BATCH_MAX);
      sending = true;
      void apiPost(
        `/api/quiz/attempts/${attemptId}/signals`,
        ExamSignalsResultSchema,
        { signals: batch },
        keepalive ? { keepalive: true } : undefined,
      )
        .catch((error: unknown) => {
          // A 4xx will be a 4xx again; only a server or network failure is
          // worth putting back for the next tick.
          const retry = !(error instanceof ApiRequestError) || error.status >= 500;
          if (retry && !keepalive) queueRef.current.unshift(...batch.slice(0, QUEUE_MAX - queueRef.current.length));
        })
        .finally(() => {
          sending = false;
        });
    };
    flushRef.current = flush;

    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData('text') ?? '';
      push({ type: 'paste', chars: text.length, text: text.slice(0, EXAM_SIGNAL_TEXT_MAX) });
    };
    const onCopy = () => {
      const text = document.getSelection()?.toString() ?? '';
      push({ type: 'copy', chars: text.length, text: text.slice(0, EXAM_SIGNAL_TEXT_MAX) });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        // A blur that turned into a hidden tab is that hidden tab.
        if (blurTimer) clearTimeout(blurTimer);
        blurTimer = null;
        blurredAt = null;
        push({ type: 'hidden' });
        flush(true);
        return;
      }
      if (hiddenAt !== null) {
        push({ type: 'visible', awayMs: Date.now() - hiddenAt });
        hiddenAt = null;
        flush(false);
      }
    };

    const onBlur = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (document.visibilityState === 'hidden') return;
        // Focus moved into an embedded frame on the page (a video in a
        // question stem): still on the exam.
        if (document.activeElement instanceof HTMLIFrameElement) return;
        blurredAt = Date.now();
        push({ type: 'blur' });
      }, BLUR_SETTLE_MS);
    };
    const onFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
      if (blurredAt !== null) {
        push({ type: 'focus', awayMs: Date.now() - blurredAt });
        blurredAt = null;
      }
    };

    const onPageHide = () => {
      push({ type: 'pagehide' });
      flush(true);
    };

    push({ type: 'opened' });
    flush(false);

    // Capture phase on the document, so an editor that stops propagation on
    // its own paste handler still cannot hide one.
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCopy, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    const interval = window.setInterval(() => flush(false), FLUSH_MS);

    return () => {
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCopy, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(interval);
      if (blurTimer) clearTimeout(blurTimer);
      // Unmounted without handing the paper in: a link elsewhere in the site,
      // or «الخروج من الامتحان».
      push({ type: 'left' });
      flush(true);
      flushRef.current = () => {};
    };
  }, [enabled, attemptId]);

  const stop = useCallback(() => {
    flushRef.current(true);
    stoppedRef.current = true;
  }, []);

  return { stop };
}
