'use client';

import { useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isModuleEvaluationError, isStaleDeployError } from './stale-deploy';

/**
 * «حاول تاني» — the press that did nothing.
 *
 * ## What was wrong
 *
 * All five boundaries wired the button straight to Next's `reset()`, and on the
 * failure that actually sends people to an error screen — a Server Component
 * that threw — `reset()` cannot recover. It clears the boundary's error state
 * and re-renders the segment, but the segment's RSC payload is already in the
 * client router's cache, so React re-reads the SAME failed payload and throws
 * the SAME error. Nothing is re-fetched, nothing changes, and the screen does
 * not even flicker.
 *
 * Reported exactly as it behaves: «يضغط try again … ما بيحصلش حاجة».
 *
 * The boundaries half-knew. Every one of them has a comment explaining that
 * `reset()` "re-renders the identical segment and reproduces the identical
 * throw, forever" — which is why each uses a plain `<a href>` rather than a
 * `<Link>` for its escape hatch. They fixed the way OUT and left the retry
 * itself pointed at the thing they had just documented as not working.
 *
 * ## What it does instead
 *
 * `router.refresh()` first: that is the only call that invalidates the client
 * router cache and re-requests the server payload for the current route. Then
 * `reset()`, so the boundary drops its error and re-renders against whatever
 * came back. Both inside one `startTransition` so React treats it as a single
 * update — the refresh's result is what the reset renders, rather than the
 * reset racing ahead and re-rendering the stale tree first.
 *
 * ## Why the second press is a document load
 *
 * A refresh fixes the common case — the API was restarting, a deploy was
 * mid-swap, a read timed out. It cannot fix a client module that failed to
 * evaluate, because the broken module graph is still in memory and
 * `router.refresh()` does not replace it. So a second press against the SAME
 * failure escalates to `location.reload()`, which discards the runtime and
 * re-requests the document.
 *
 * ⚠️ The counter is at MODULE scope, not in a ref, and that is load-bearing.
 * When the retry fails, the boundary unmounts its fallback to re-render the
 * children, the children throw again, and React mounts a FRESH fallback
 * instance — so any per-instance state is back to zero on exactly the press
 * that needed to know it was the second one. Module scope lives as long as the
 * page does, which is the right lifetime.
 *
 * Keyed on the digest so a different failure later starts its own count rather
 * than inheriting a strike and hard-reloading on its first press.
 */
let lastFailure = '';
let strikes = 0;

/**
 * How the page recovers from a module that failed to evaluate WITHOUT anyone
 * pressing anything.
 *
 * `isModuleEvaluationError` explains the failure: a tab that outlived a deploy
 * has Turbopack module ids pinned to the old build's factories, and a chunk it
 * then loads from the new build reads exports that module never had. There is
 * nothing on the screen worth keeping — the segment never rendered — and the
 * one thing that fixes it is a document load. Making a person press for that is
 * charging them for a step whose outcome is already known.
 *
 * ⚠️ ONCE, and the bound is the whole safety of this. A genuine throw at a
 * module's top level looks identical from here, and auto-reloading on one of
 * those is an infinite loop on a page nobody can read or escape. So the message
 * is written to `sessionStorage` BEFORE the reload, and a second arrival of the
 * same failure falls through to the ordinary error screen — where the report
 * has already been filed and «حاول تاني» still works if the person wants it.
 *
 * `sessionStorage` rather than a module variable: the reload discards the
 * module. Per TAB rather than per origin, because two tabs of different ages
 * are exactly the situation, and one of them recovering must not use up the
 * other's attempt.
 *
 * Wrapped, and failing CLOSED. Safari's private mode throws on `setItem`, and a
 * reload we cannot record is a reload we cannot bound — so when the store is
 * unavailable nothing reloads and the screen behaves as it did before.
 */
const RELOAD_MARK = 'ayman:module-eval-reload';

function reloadOnceFor(failure: string): void {
  let alreadyTried: string | null;
  try {
    alreadyTried = window.sessionStorage.getItem(RELOAD_MARK);
    if (alreadyTried === failure) return;
    window.sessionStorage.setItem(RELOAD_MARK, failure);
  } catch {
    return;
  }
  window.location.reload();
}

export function useErrorRetry(
  error: Error & { digest?: string },
  reset: () => void,
): { retry: () => void; retrying: boolean } {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();

  // Before any press. See `reloadOnceFor` — the segment never rendered, so
  // there is nothing to lose by replacing the document, and the person is
  // looking at an error screen that cannot become a page on its own.
  useEffect(() => {
    if (isModuleEvaluationError(error)) reloadOnceFor(error.message);
  }, [error]);

  const retry = useCallback(() => {
    // A tab that outlived its build cannot be refreshed back into working —
    // the stale Server Action id is in the loaded bundle, which only a document
    // load replaces. Skipping the first press's `router.refresh()` is the whole
    // point: it is guaranteed to do nothing here. See `lib/stale-deploy.ts`.
    if (isStaleDeployError(error)) {
      window.location.reload();
      return;
    }

    // Same reasoning, other symptom: a client module that threw while
    // evaluating. The paragraph above about the second press already says a
    // refresh cannot fix one — the broken module graph is in memory and
    // `router.refresh()` does not replace it — so making it cost two presses is
    // charging for a step known in advance to do nothing. See
    // `isModuleEvaluationError` for why this is matched on the stack, and why
    // it still gets reported even though the retry treats it as a deploy.
    if (isModuleEvaluationError(error)) {
      window.location.reload();
      return;
    }

    // `digest` is the stable identity of a server error and is absent for a
    // client throw, where the message is the best available substitute.
    const failure = error.digest ?? error.message;

    if (failure === lastFailure) {
      strikes += 1;
    } else {
      lastFailure = failure;
      strikes = 1;
    }

    if (strikes > 1) {
      window.location.reload();
      return;
    }

    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [error, reset, router]);

  return { retry, retrying };
}
