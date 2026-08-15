'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { copy } from '@ayman/contracts/copy';
import { ApiRequestError, apiPost, apiPutTyped } from '@/lib/api';

/**
 * Mirrors the API's `AnswerResponseSchema` (`apps/api/.../dto/save-answers.dto.ts`)
 * exactly — that DTO is API-internal, not re-exported through `@ayman/contracts`,
 * so this is a plain structural duplicate rather than a shared import. The
 * server re-validates every field regardless; nothing here is a security
 * boundary, only a type for the browser's own bookkeeping.
 */
export type AnswerResponse = { kind: 'choice'; optionIds: string[] } | { kind: 'text'; text: string };

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'stale';

const SaveResultSchema = z.object({
  savedSlots: z.array(z.number()),
  serverTime: z.string(),
  deadlineAt: z.string().nullable(),
  answeredCount: z.number(),
});
export type SaveResult = z.infer<typeof SaveResultSchema>;

/** The flag route echoes the stored value back. Parsed rather than ignored so
 *  a contract change here fails loudly instead of silently no-op'ing. */
const FlagResultSchema = z.object({ flagged: z.boolean() });

export interface UseAttemptAutosaveOptions {
  attemptId: string;
  attemptToken: string;
  /** `StartedAttempt.nextSeq` — the lowest seq this page may safely send. */
  initialSeq: number;
  intervalMs?: number;
  onSaved?: (result: SaveResult) => void;
  /** Fired exactly once, the moment a 409 `attempt_stale` is seen. */
  onStale?: () => void;
}

export interface UseAttemptAutosaveResult {
  status: AutosaveStatus;
  /** Marks a slot dirty. Never sends a grade or a state — only the response. */
  setAnswer: (slotPosition: number, response: AnswerResponse | null) => void;
  /**
   * Flush on demand — question navigation and field blur call this directly
   * and ignore the result. Await it when what happens next reads server state
   * that this write changes; it resolves (never rejects) once the request has
   * settled, or immediately when there is nothing dirty to send.
   */
  flushNow: () => Promise<void>;
  /**
   * Persists one question's flag. Separate from `setAnswer` because flags do
   * NOT ride the answer autosave — `SaveAnswersSchema` has no `flagged` field
   * — and assuming otherwise is why every flag was silently lost on reload.
   * Fire-and-forget; see the implementation for why a flag must never
   * interrupt an exam the way a failed answer save legitimately does.
   */
  setFlag: (slotPosition: number, flagged: boolean) => void;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Save-as-you-go. `setAnswer` only marks a slot dirty in a ref — it never
 * schedules a network call by itself, so ten keystrokes in ten seconds still
 * produce ONE request once a flush trigger actually fires (the 15s interval,
 * blur, navigation, tab hide, or page hide).
 */
export function useAttemptAutosave({
  attemptId,
  attemptToken,
  initialSeq,
  intervalMs = 15_000,
  onSaved,
  onStale,
}: UseAttemptAutosaveOptions): UseAttemptAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const seqRef = useRef(initialSeq);
  const dirtyRef = useRef(new Map<number, AnswerResponse | null>());
  const staleRef = useRef(false);
  const inFlightRef = useRef(false);
  // The promise for the request `inFlightRef` is tracking, so a caller that
  // awaits a flush while one is already running waits for THAT one instead of
  // being told, falsely, that there is nothing left to save.
  const inFlightPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const backoffRef = useRef(1_000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSavedRef = useRef(onSaved);
  const onStaleRef = useRef(onStale);
  // Holds `flush` itself, so the backoff retry below can call the CURRENT
  // flush without `flush`'s own `useCallback` self-referencing (which the
  // React Compiler correctly refuses to let update over time otherwise).
  const flushRef = useRef<(keepalive: boolean) => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    onSavedRef.current = onSaved;
    onStaleRef.current = onStale;
  });

  const flush = useCallback(
    (keepalive: boolean): Promise<void> => {
      // Returns a promise that settles when this slot's write has actually
      // reached the server, so a caller whose correctness depends on that
      // (`openSubmitDialog` — its preflight count is read straight after) can
      // await it. It never rejects: the `.catch` below owns every failure.
      if (staleRef.current || dirtyRef.current.size === 0) return Promise.resolve();
      if (inFlightRef.current) return inFlightPromiseRef.current;

      // Snapshotted as [slot, valueAtSendTime] pairs — the finally-clause
      // below needs the EXACT value it sent, to tell apart "nothing changed
      // since we sent this" from "a new edit arrived while in flight".
      const sentEntries = [...dirtyRef.current.entries()];
      const answers = sentEntries.map(([slotPosition, response]) => ({ slotPosition, response }));
      // Incremented on EVERY send attempt (including retries) — never on
      // every edit — so an out-of-order reply from an earlier, slower
      // request can never clobber a value a later request already wrote.
      const seq = ++seqRef.current;
      inFlightRef.current = true;
      setStatus('saving');

      const pending = apiPutTyped(
        `/api/quiz/attempts/${attemptId}/answers`,
        SaveResultSchema,
        { attemptToken, seq, answers },
        keepalive ? { keepalive: true } : undefined,
      )
        .then((result) => {
          // Only the slots THIS request actually sent, and only if nothing
          // newer overwrote them while it was in flight — a fresher edit
          // must stay dirty for the next flush rather than being dropped.
          for (const [slot, sentValue] of sentEntries) {
            if (dirtyRef.current.get(slot) === sentValue) {
              dirtyRef.current.delete(slot);
            }
          }
          backoffRef.current = 1_000;
          setStatus('saved');
          onSavedRef.current?.(result);
        })
        .catch((error: unknown) => {
          if (error instanceof ApiRequestError && error.status === 409) {
            // Retrying a stale write forever is how a second tab silently
            // loses an hour of work — stop for good and surface it.
            staleRef.current = true;
            setStatus('stale');
            onStaleRef.current?.();
            return;
          }
          setStatus('error');
          const delay = backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
          retryTimerRef.current = setTimeout(() => flushRef.current(false), delay);
        })
        .finally(() => {
          inFlightRef.current = false;
        });

      inFlightPromiseRef.current = pending;
      return pending;
    },
    [attemptId, attemptToken],
  );

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const flushNow = useCallback(() => flush(false), [flush]);

  useEffect(() => {
    const interval = window.setInterval(() => flush(false), intervalMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    // `sendBeacon` cannot carry the CSRF header this API requires on every
    // state-changing method (same constraint `useVideoHeartbeat` documents);
    // `keepalive: true` is the fetch-based equivalent that lets the request
    // outlive the page.
    const onPageHide = () => flush(true);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.clearInterval(interval);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [flush, intervalMs]);

  return {
    status,
    setAnswer: (slotPosition, response) => {
      dirtyRef.current.set(slotPosition, response);
    },
    flushNow,
    /**
     * Persists one flag, immediately and on its own request.
     *
     * ⚠️ Flags do NOT travel with the answer autosave, and assuming they did
     * is why they were silently lost. `SaveAnswersSchema` is
     * `{ attemptToken, seq, answers: [{ slotPosition, response }] }` — there
     * is no `flagged` anywhere in it. `QuizRunner`'s toggle called
     * `flushNow()`, which reads exactly like "save this now" and does flush
     * pending ANSWERS, so the intent was right and the effect was nil: the
     * `POST /attempts/:id/flag` route existed, was tested on the server, and
     * was called by nothing.
     *
     * The cost lands at the worst moment. A student flags four questions to
     * revisit, their phone sleeps or Android Chrome's pull-to-refresh fires,
     * `resume()` rebuilds the attempt from the server — and every flag is
     * gone, mid-timed-exam, with the answers all correctly intact beside them.
     *
     * Sent per toggle rather than batched into the dirty map: a flag is one
     * boolean the student expects to be sticky the moment they press it, and
     * it has no `seq` ordering problem to solve because each slot's last write
     * wins by construction.
     *
     * Deliberately fire-and-forget. The local state is already updated and is
     * what the student sees; a failed flag must never interrupt an exam or
     * roll the marker back under their finger. It is a bookmark, not an
     * answer — `setAnswer` is the one with the retry/backoff/stale machinery,
     * and it keeps it.
     */
    setFlag: (slotPosition: number, flagged: boolean) => {
      if (staleRef.current) return;
      void apiPost(
        `/api/quiz/attempts/${attemptId}/flag`,
        FlagResultSchema,
        { attemptToken, slotPosition, flagged },
      ).catch(() => {
        // Swallowed on purpose — see above. Nothing on screen changes, and
        // the answer autosave's status pill must not report a flag failure as
        // if the student's answers were at risk.
      });
    },
  };
}

/** `copy.quiz.saving`/`saved`/`saveFailed`/`staleTab` keyed by status, for a
 *  consuming component's status pill — kept here so every caller renders the
 *  identical four strings rather than re-deriving the mapping. */
export const AUTOSAVE_STATUS_LABEL: Record<AutosaveStatus, string> = {
  idle: '',
  saving: copy.quiz.saving,
  saved: copy.quiz.saved,
  error: copy.quiz.saveFailed,
  stale: copy.quiz.staleTab,
};
