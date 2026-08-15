'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { ActionResult } from '@/app/(admin)/admin/courses/actions';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Which state wins when several fields are mid-flight at once. A failure is
 * the only thing the editor has to act on, so it outranks everything; a save
 * still travelling outranks one that has landed; `saved` outranks `idle` so
 * the confirmation survives a sibling field that was never touched.
 */
const RANK: Record<AutosaveStatus, number> = {
  idle: 0,
  saved: 1,
  pending: 2,
  saving: 3,
  error: 4,
};

type Entry = {
  status: AutosaveStatus;
  error: string | null;
  retry: () => void;
};

export type AutosaveSummary = {
  status: AutosaveStatus;
  /** The first failure's message — one line, not a list of six identical ones. */
  error: string | null;
  /** Re-sends every field that failed, not just the one being shown. */
  retry: () => void;
};

const IDLE: AutosaveSummary = { status: 'idle', error: null, retry: () => {} };

/**
 * An external store rather than React state, because the alternative re-renders
 * the whole course editor on every keystroke.
 *
 * Each field reports `pending` the moment it is typed into. Held in context
 * state, that report would re-render every section, lesson row and panel
 * beneath the provider — forty rows repainting per character. With
 * `useSyncExternalStore` the only component that subscribes is the indicator
 * in the header, so a keystroke repaints six words.
 */
function createAutosaveStore() {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let snapshot: AutosaveSummary = IDLE;

  function recompute() {
    let status: AutosaveStatus = 'idle';
    let error: string | null = null;
    const failed: Entry[] = [];

    for (const entry of entries.values()) {
      if (entry.status === 'error') {
        failed.push(entry);
        error ??= entry.error;
      }
      if (RANK[entry.status] > RANK[status]) status = entry.status;
    }

    snapshot = {
      status,
      error,
      retry: () => {
        for (const entry of failed) entry.retry();
      },
    };
    for (const listener of listeners) listener();
  }

  return {
    report(id: string, entry: Entry) {
      entries.set(id, entry);
      recompute();
    },
    drop(id: string) {
      if (entries.delete(id)) recompute();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}

type AutosaveStore = ReturnType<typeof createAutosaveStore>;

const AutosaveContext = createContext<AutosaveStore | null>(null);

/**
 * Wraps the editor so every autosaving field reports into ONE indicator.
 *
 * Without it `useAutosave` still saves — it just has nowhere to report, which
 * is what a unit test rendering a single form gets.
 */
export function AutosaveProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => createAutosaveStore(), []);
  return <AutosaveContext.Provider value={store}>{children}</AutosaveContext.Provider>;
}

export function useAutosaveSummary(): AutosaveSummary {
  const store = useContext(AutosaveContext);
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.getSnapshot ?? (() => IDLE),
    () => IDLE,
  );
}

type Options<T> = {
  onSave: (value: T) => Promise<ActionResult>;
  /**
   * Long enough that typing a sentence is one write, short enough that looking
   * away from the keyboard and back finds it saved.
   */
  delayMs?: number;
};

/**
 * Debounced field-level autosave: the editor's replacement for a «حفظ» button.
 *
 * The rule this enforces is the one the instructor asked for — «أي حاجة حطيتها
 * حتى لو ما كملتش، تتخزن بس ما تتنشرش». Content is a draft from the moment it
 * is typed (`Course.status` is `draft` and `Lesson.isPublished` is false by
 * default), so saving is never a decision; publishing is the only one.
 *
 * ## Ordering
 *
 * Writes are serialised, never concurrent. A save scheduled while another is
 * in flight waits for it and then sends the LATEST value, so two quick edits
 * cannot land out of order and leave the older one stored. That is the whole
 * reason `pendingRef` survives the in-flight save rather than being captured
 * into it.
 *
 * ## Failure
 *
 * A failed write keeps its value in `pendingRef` and does NOT retry on its
 * own — a 400 retried on a timer is an infinite loop against a payload the
 * server has already refused. It waits for `retry()` from the indicator, or
 * for the next edit, whichever comes first.
 */
export function useAutosave<T>({ onSave, delayMs = 700 }: Options<T>) {
  const id = useId();
  const store = useContext(AutosaveContext);

  const pendingRef = useRef<{ value: T } | null>(null);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const storeRef = useRef(store);
  useEffect(() => {
    onSaveRef.current = onSave;
    storeRef.current = store;
  });

  const report = useCallback(
    (status: AutosaveStatus, error: string | null, retry: () => void) => {
      storeRef.current?.report(id, { status, error, retry });
    },
    [id],
  );

  /*
   * A NAMED function expression, so it can call itself.
   *
   * Two things need "the flush" as a value: the `retry` handed to the store,
   * and the follow-up send when a newer edit arrived mid-flight. Reaching those
   * through a ref that an effect keeps up to date is the usual trick and the
   * React Compiler rejects it outright ("modifying a value previously passed as
   * an argument to a hook"). `flushNow` is in scope inside its own body, which
   * is all the self-reference this ever needed — and it is stable, because
   * `report` is keyed only on the mount's `useId`.
   */
  const flush = useCallback(
    function flushNow(): void {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (inFlightRef.current) return;
      const pending = pendingRef.current;
      if (pending === null) return;
      pendingRef.current = null;
      inFlightRef.current = true;
      report('saving', null, flushNow);

      void onSaveRef.current(pending.value).then(
        (result) => {
          inFlightRef.current = false;
          if (result.ok) {
            report('saved', null, flushNow);
            // A newer edit arrived mid-flight — send it now rather than waiting
            // for another keystroke that may never come.
            if (pendingRef.current !== null) flushNow();
          } else {
            // Put it BACK, so `retry` has something to send. Dropping it here
            // is how a failed write becomes a silently lost edit.
            pendingRef.current = pending;
            report('error', result.message, flushNow);
          }
        },
        (error: unknown) => {
          inFlightRef.current = false;
          pendingRef.current = pending;
          report('error', error instanceof Error ? error.message : 'unknown', flushNow);
        },
      );
    },
    [report],
  );

  const save = useCallback(
    (value: T) => {
      pendingRef.current = { value };
      report('pending', null, flush);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush, report],
  );

  /**
   * An unsent edit must survive leaving the page. Unmount covers client-side
   * navigation (React runs the cleanup); `beforeunload` covers a reload or a
   * closed tab, where the only honest thing left to do is warn — a `fetch`
   * started there is not guaranteed to finish. Same shape as
   * `useDebouncedReorder`, for the same reason.
   */
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pendingRef.current !== null || inFlightRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      flush();
      storeRef.current?.drop(id);
    };
  }, [flush, id]);

  return { save, flush };
}
