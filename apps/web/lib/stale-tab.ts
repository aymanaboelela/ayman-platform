import { useSyncExternalStore } from 'react';
import { copy } from '@ayman/contracts/copy';
import { isStaleDeployError } from './stale-deploy';

/**
 * "This tab now KNOWS it is older than the server" — one flag for the whole
 * page, and the one place anything that finds out says so.
 *
 * ## Why a store and not a return value
 *
 * `lib/stale-deploy.ts` explains the failure: a deploy mints new Server Action
 * ids, so a tab that outlived one fails its next action with Next's English
 * «Server Action "…" was not found on the server». The error-boundary path
 * already turns that into a reload (`use-error-retry.ts`). What it never
 * reached is every save that CATCHES its own failure and renders it — the
 * course editor's autosave printed that sentence in red above the homework
 * form, and a teacher had no way to know the cure was a reload.
 *
 * Three different places learn the same fact, and each of them only knows it
 * locally:
 *
 *   · `lib/build-watch.ts` — the proactive check, before anything failed;
 *   · a catch site that routes its error through `actionErrorMessage` below;
 *   · the window's `unhandledrejection` listener, for the ones nobody caught.
 *
 * They all end in the SAME answer for the person holding the tab — one toast
 * with one reload button (`components/pwa/stale-build-watch.tsx`) — so they
 * write to one flag and that component listens to it. A per-site toast would
 * put three of them on screen for one deploy.
 *
 * ## One-way
 *
 * Nothing sets it back to `false`. The only thing that makes a stale tab fresh
 * is a document load, and a document load discards this module with it.
 */
let stale = false;
const listeners = new Set<() => void>();

/**
 * Says so — and says it AGAIN on every call, not just the first.
 *
 * The toast is dismissible, and an editor who swiped it away and then pressed
 * «حذف» deserves to see it come back: that press is the moment the reload
 * matters. `toast()` with a fixed id updates the one on screen rather than
 * stacking a second, so repeating is free.
 *
 * Deferred to a microtask because the callers are catch blocks that can run
 * inside another store's listener (autosave reports into one) or, in the worst
 * case, a render — and the listener on the other end updates sonner's store. A
 * synchronous notify from there is React's «Cannot update a component while
 * rendering a different component».
 */
export function markTabStale(): void {
  stale = true;
  queueMicrotask(() => {
    for (const listener of listeners) listener();
  });
}

export function isTabStale(): boolean {
  return stale;
}

export function subscribeStaleTab(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For a component that has to change its own button, not just show a toast. */
export function useTabIsStale(): boolean {
  return useSyncExternalStore(subscribeStaleTab, isTabStale, () => false);
}

/**
 * The action failed because the tab is behind the server, and for no other
 * reason.
 *
 * `isStaleDeployError` matches Next's sentence and is pinned by its own test.
 * The `name` is the second handle: Next 16 throws an `UnrecognizedActionError`
 * whose constructor stamps it, and `unstable_isUnrecognizedActionError` in
 * `next/navigation` is an `instanceof` against that class — which would be
 * the right call if the name were not already enough, and is not something a
 * test can construct without importing Next's internals. Either one matching
 * is sufficient: if Next rewords the sentence, the name still holds, and the
 * reverse.
 */
export function isStaleActionError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.name === 'UnrecognizedActionError' || isStaleDeployError(error))
  );
}

/**
 * What a catch site renders for a failed Server Action.
 *
 * A stale tab gets `copy.common.staleBuildAction` — Arabic, and naming the
 * cure — and raises the toast that carries the button. Anything else is
 * returned exactly as the site rendered it before (`error.message`, or the
 * site's own fallback for a non-Error), so adopting this at a catch site is a
 * one-token change that alters nothing but the stale case.
 */
export function actionErrorMessage<F extends string | null>(error: unknown, fallback: F): string | F {
  if (isStaleActionError(error)) {
    markTabStale();
    return copy.common.staleBuildAction;
  }
  return error instanceof Error ? error.message : fallback;
}
