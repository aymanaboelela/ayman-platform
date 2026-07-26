'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ReorderStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export type CommitResult = { ok: true } | { ok: false; message: string };

type Options = {
  initial: string[];
  onCommit: (orderedIds: string[]) => Promise<CommitResult>;
  delayMs?: number;
};

function arrayMove(list: readonly string[], from: number, to: number): string[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * Optimistic local order + one debounced write of the WHOLE array.
 *
 * Dragging one lesson across a 40-item list changes 40 positions. The naive
 * implementations are (a) one request per position — 40 requests, 40 chances
 * to interleave with another editor; or (b) one request per drag — which
 * fires again on every intermediate drop while the user is still arranging.
 * This does neither: local state updates instantly, and exactly one PATCH
 * carrying the final array leaves the browser once the user stops.
 */
export function useDebouncedReorder({ initial, onCommit, delayMs = 600 }: Options) {
  const [items, setItems] = useState<string[]>(initial);
  const [status, setStatus] = useState<ReorderStatus>('idle');

  // The last order the SERVER acknowledged. Reverting to anything else after
  // a failure would show the user an order that does not exist anywhere.
  const committedRef = useRef<string[]>(initial);
  const pendingRef = useRef<string[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  // Refs are read/written outside render (effects, event handlers) — never
  // mutated during render itself, which is what makes this safe under React
  // Compiler's stricter ref rules.
  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending === null) return;

    setStatus('saving');
    void onCommitRef.current(pending).then((result) => {
      if (result.ok) {
        committedRef.current = pending;
        setStatus('saved');
      } else {
        // Revert. Leaving the optimistic order on screen after a rejected
        // write is how an editor believes they saved something they did not.
        setItems(committedRef.current);
        setStatus('error');
      }
    });
  }, []);

  const move = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      setItems((current) => {
        const next = arrayMove(current, from, to);
        pendingRef.current = next;
        setStatus('pending');
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flush, delayMs);
        return next;
      });
    },
    [delayMs, flush],
  );

  // A pending reorder must survive navigating away from the page. React runs
  // this cleanup on unmount, which covers client-side navigation; beforeunload
  // covers a hard reload or tab close.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingRef.current !== null) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      flush();
    };
  }, [flush]);

  return { items, status, move, flush };
}
