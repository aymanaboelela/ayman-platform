'use client';

import { useCallback, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { isModuleEvaluationError, isStaleChunkError, isStaleDeployError } from './stale-deploy';

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

/**
 * The chunk case's own SLOT, and it cannot share `RELOAD_MARK`: one slot shared
 * between two classes lets each reset the other's bound, which is the ping-pong
 * the bound exists to prevent.
 */
const CHUNK_RELOAD_MARK = 'ayman:chunk-reload';

/**
 * What is written into that slot: the build this tab is RUNNING.
 *
 * Not the error message — that carries the chunk URL, so every failing chunk
 * would get its own reload and two that alternate would overwrite each other's
 * mark forever.
 *
 * And not a constant either, which is what this was first. A constant spends the
 * tab's single automatic recovery permanently: one chunk failure ever, and a
 * genuine deploy weeks later leaves a long-lived tab stranded on the error
 * screen with no automatic way back. The build id is the value that means what
 * the bound actually wants to say — "this tab has already tried reloading out of
 * THIS build":
 *
 *   · a reload that worked leaves the tab on a new build, so the next deploy
 *     finds a different mark and is allowed its own recovery;
 *   · a reload that changed nothing leaves the tab on the same build, finds the
 *     same mark, and stops — no loop.
 *
 * `'dev'` when there is no token (`next dev`, or a build that did not go through
 * the Dockerfile). One reload per tab there, which is the old behaviour and is
 * plenty for a machine with devtools open.
 */
const RUNNING_BUILD = process.env.NEXT_PUBLIC_BUILD_ID || 'dev';

/**
 * @param slot  which `sessionStorage` key records the attempt
 * @param mark  the value written to it — the identity of "this failure"
 */
function reloadOnceFor(slot: string, mark: string): void {
  let alreadyTried: string | null;
  try {
    alreadyTried = window.sessionStorage.getItem(slot);
    if (alreadyTried === mark) return;
    window.sessionStorage.setItem(slot, mark);
  } catch {
    return;
  }
  window.location.reload();
}

/** Pulls the chunk URL back out of Turbopack's message — see `askTheServer`. */
const CHUNK_URL = /(\/_next\/[^\s"']+)/;

/**
 * ⚠️ ASKS THE SERVER before taking anyone's page away, and this is the guard
 * `isStaleChunkError` deliberately does not carry.
 *
 * That predicate cannot tell a chunk that 404s because the build moved from one
 * that failed because the connection dropped — Turbopack raises the same
 * `ChunkLoadError` for both, because its loader cannot tell them apart either.
 * The two need opposite treatment, and getting it wrong the harmful way is
 * expensive: `public/sw.js` answers a navigation it cannot fetch with the
 * offline page, so an automatic reload on a bad connection replaces the page a
 * student was reading with «مفيش نت دلوقتي».
 *
 * `navigator.onLine` is not good enough to make that call — this used it, and it
 * is `true` on exactly the weak-mobile-data and captive-portal cases that
 * matter. So ask the one party that knows: re-request the chunk.
 *
 *   rejects           → the network is the problem. Leave the page alone.
 *   4xx               → the file is gone; this tab is older than the server.
 *                       Reload.
 *   2xx               → it is there now, so the first attempt was a blip a
 *                       document load will clear. Reload.
 *   5xx (or anything
 *   else)             → the server is unwell; a reload is not the answer.
 *
 * The request goes through the service worker's own cache-first handler for
 * `/_next/static/`, which is correct rather than a hole: a cached hit means the
 * bytes are on the device and a reload really will work, and a miss falls
 * through to the network and sees the same 404 the loader saw.
 *
 * If the URL cannot be recovered from the message — the one part of it that is
 * not a stable literal — nothing reloads, and «حاول تاني» is left to decide.
 * Failing that way round is the safe one: the student keeps their page.
 */
async function reloadIfTheBuildMoved(error: Error, cancelled: () => boolean): Promise<void> {
  const url = CHUNK_URL.exec(error.message)?.[1];
  if (!url) return;

  let status: number;
  try {
    status = (await fetch(url, { cache: 'no-store' })).status;
  } catch {
    return;
  }
  if (cancelled()) return;

  if (status >= 500) return;
  if (status >= 400 && !(await originIsServing(cancelled))) return;
  if (cancelled()) return;
  if (status >= 400 || status < 300) reloadOnceFor(CHUNK_RELOAD_MARK, RUNNING_BUILD);
}

/**
 * ⚠️ The one 4xx that must NOT be read as "the build moved": the deploy window.
 *
 * `docs/runbooks/` says it in as many words — «الـ 404 لثواني وقت النشر طبيعي —
 * دي الحاوية القديمة وقفت والجديدة لسه بتقوم» — and `public/sw.js`'s navigate
 * handler already retries once for the same reason. For those few seconds
 * EVERYTHING 404s, the chunk probe included, so a 404 alone cannot tell "this
 * file is gone from the new build" from "there is no backend right now".
 *
 * Reloading into that window is the worst available outcome: the document 404s
 * too, the service worker passes a 404 RESPONSE straight through (its retry
 * covers a rejected fetch, not a served error), and the student lands on a bare
 * 404 with their one automatic recovery already spent.
 *
 * So the chunk's 404 is corroborated against the page the student is already
 * on. A pause first, because the whole point is to let the new container finish
 * binding its port — the same 600ms instinct as `sw.js`, doubled, since nothing
 * is waiting on this and being right matters more than being quick.
 *
 *   document serves    → the origin is healthy, so the chunk really is gone.
 *   document 404s /
 *   will not load      → mid-deploy or worse. Leave the page alone and leave
 *                        the mark unspent, so the recovery is still there when
 *                        the new container is up.
 */
async function originIsServing(cancelled: () => boolean): Promise<boolean> {
  await new Promise((resolve) => window.setTimeout(resolve, 1200));
  if (cancelled()) return false;
  try {
    return (await fetch(window.location.href, { cache: 'no-store' })).ok;
  } catch {
    return false;
  }
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
  //
  // `isStaleChunkError` joins it for the same reason and with the same bound:
  // a chunk that 404s because the build that produced it is gone cannot come
  // back on a re-render, and asking a student to press a button to get the
  // build they should already have been served is a step with one possible
  // outcome. `reloadOnceFor` keyed on the message is what stops it looping if
  // the reload lands on the same failure — a genuinely unreachable asset then
  // shows the error screen and stays there, which is the honest answer.
  useEffect(() => {
    if (isStaleChunkError(error)) {
      // Cancelled on cleanup: the probe is two awaits and a deliberate pause
      // long, and a reload that landed after the student had already navigated
      // somewhere else would take a page they were reading over an error
      // screen they never saw.
      let done = false;
      void reloadIfTheBuildMoved(error, () => done);
      return () => {
        done = true;
      };
    }
    if (isModuleEvaluationError(error)) reloadOnceFor(RELOAD_MARK, error.message);
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

    // And the chunk that never arrived. The effect above has usually already
    // reloaded for this one, so reaching here means the reload was refused,
    // already spent, or suppressed because the device reported itself offline.
    //
    // The press reloads anyway, in all three cases including the offline one,
    // and that is deliberate: suppressing the AUTOMATIC reload is about not
    // taking someone's page away without being asked. Being asked is exactly
    // what this is, and `router.refresh()` still cannot conjure a file the
    // server did not send.
    if (isStaleChunkError(error)) {
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
