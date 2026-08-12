'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The key our stop lives under inside a history entry's state object.
 *
 * Namespaced, not `__overlay`: the state object is shared property — Next's
 * app-router keeps `__NA` and `__PRIVATE_NEXTJS_INTERNALS_TREE` in the same
 * object, a third-party script can write to it, and a generic name is how two
 * unrelated features end up reading each other's marker and popping a route
 * they did not own.
 */
const SENTINEL_KEY = '__aymanBackStop';

interface Sentinel {
  /** The `useId()` of the hook instance holding this stop. */
  id: string;
  /**
   * The URL the stop was pushed on. A stop is only ever consumed on the page
   * that pushed it — see `armSentinel` and the popstate handler, both of which
   * refuse to act when the href has moved on.
   */
  href: string;
}

/**
 * Every hook instance currently holding a stop, outermost first — a drawer at
 * index 0 with a dialog opened on top of it at index 1.
 *
 * Module scope rather than a context, because the thing being coordinated is
 * itself global: there is one history stack, and the ONLY correct reader of a
 * back press is the innermost overlay on screen. A context would have to be
 * threaded through `DialogContent`, `SheetContent` and every future portal by
 * hand, and the first one that forgot would silently close two overlays with
 * one press.
 */
const armed: string[] = [];

/**
 * Counter behind each stop's id.
 *
 * NOT `useId()`, which is what this was first written with. React derives that
 * id from the component's position in its ROOT, so two hooks in two roots are
 * handed the same string — and two stops sharing an id is the one thing this
 * whole module cannot survive: `armed` can no longer tell which one is
 * innermost, and a single back press closes both the dialog and the drawer
 * underneath it. Next renders one root, so nothing in the product could show
 * it; two `renderHook` calls in `use-back-dismiss.test.ts` show it instantly,
 * which is how it was found.
 */
let stopCount = 0;

function readSentinel(): Sentinel | null {
  const state: unknown = window.history.state;
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[SENTINEL_KEY];
  if (!value || typeof value !== 'object') return null;
  const { id, href } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof href === 'string' ? { id, href } : null;
}

/**
 * Put a stop on top of the history stack: an entry with the SAME url and the
 * same router state as the one the caller is standing on, marked as ours.
 *
 * Two things make this safe under Next 16's app-router, and both are load
 * bearing:
 *
 * 1. The existing state is spread through. `app-router.js`'s own popstate
 *    handler reads `event.state.__NA` and calls `window.location.reload()` when
 *    it is missing — an entry pushed with a bare `{ ourKey: … }` turns the back
 *    gesture into a FULL PAGE RELOAD, which on the quiz runner means a fresh
 *    `resume()` and a rotated attempt token. Carrying `__NA` and
 *    `__PRIVATE_NEXTJS_INTERNALS_TREE` forward means the entry we push is, to
 *    Next, indistinguishable from the one below it, so popping it restores the
 *    identical tree and nothing on screen changes.
 * 2. No url argument. Next patches `pushState`/`replaceState` and only reaches
 *    into its router when a url is passed; with two arguments the address bar,
 *    `usePathname` and `useSearchParams` are all untouched.
 *
 * ## Adopting a spent stop instead of stacking another one
 *
 * Closing an overlay with the X, the backdrop or Escape deliberately does NOT
 * pop the entry back off (see `useBackDismiss`'s own comment for why that
 * would be dangerous), so the stack keeps a duplicate of the current page that
 * nobody is armed on. Opening the next overlay REUSES that dead entry —
 * `replaceState` rather than `pushState` — so a student who opens and closes
 * the drawer six times owes the back button one extra press, not six.
 *
 * The `href` check is what makes reuse safe. Next preserves custom history
 * state across a restore, so a marker can outlive the page it was written on;
 * adopting one on a different url would mean marking a REAL route entry as
 * disposable, and the next back press would close the overlay and pop the
 * route with it. Different url, or an id somebody still holds: push a fresh
 * one.
 */
function armSentinel(id: string): void {
  const href = window.location.href;
  const existing = readSentinel();
  const state = {
    ...(window.history.state as Record<string, unknown> | null),
    [SENTINEL_KEY]: { id, href } satisfies Sentinel,
  };

  if (existing && existing.href === href && !armed.includes(existing.id)) {
    window.history.replaceState(state, '');
    return;
  }
  window.history.pushState(state, '');
}

export interface BackDismissOptions {
  /**
   * Put the stop straight back after it fires instead of standing down.
   *
   * The difference between an overlay and a guard. An overlay is GONE once
   * back has closed it, so its stop goes with it. A running exam is still
   * running after the student has been asked whether they meant to leave, so
   * its stop has to be back in place before they press again — otherwise the
   * second press walks out of a timed paper with no question asked.
   */
  rearm?: boolean;
}

export interface BackDismissHandle {
  /**
   * Stand down immediately, without waiting for unmount.
   *
   * For the moment a guarded flow ENDS while its component is still on screen:
   * an exam whose `submit()` has just resolved is no longer an exam anybody
   * needs warning about, and the student is one `router.push` away from their
   * own results page.
   */
  release: () => void;
}

/**
 * Make the Android back gesture dismiss what is on top of the screen instead
 * of leaving the page.
 *
 * ## Why this is not `beforeunload`
 *
 * On Android the system back gesture is how people close anything overlaying
 * the screen — there is no second affordance, and the X in the corner of a
 * drawer is not one people reach for. Before this hook, `grep -rn
 * "popstate|pushState"` across the whole product returned nothing: back on an
 * open drawer left the student's page entirely, with the drawer and its
 * full-screen backdrop still painted over whatever loaded next.
 *
 * `beforeunload` cannot fix any of that. The App Router handles back as a soft
 * client navigation — no unload, no `beforeunload` — so it fires on exactly
 * the two cases this hook is not about: a hard reload and closing the tab.
 *
 * ## The mechanism
 *
 * On mount, push a duplicate of the current history entry marked as ours. The
 * entry carries the same url and the same router tree, so it is invisible:
 * nothing navigates when it is pushed and nothing navigates when it is popped.
 * A back press therefore spends that duplicate instead of the real page entry,
 * and the popstate it fires is the signal that the student asked to go back.
 * `onBack` is called with the page still exactly where it was.
 *
 * ## What it deliberately does NOT do
 *
 * It does not pop its own entry when the overlay closes by other means. That
 * is the obvious other half — close the dialog with the X, call
 * `history.back()` to tidy up — and it is a trap, because closing an overlay
 * and navigating are usually the SAME click. Every course row in the student
 * drawer is a `<Link>` beside an `onNavigate` that closes the sheet: the close
 * commits first (a sync setState), the route change lands hundreds of
 * milliseconds later (an RSC fetch inside a transition). A tidy-up
 * `history.back()` in the unmount cleanup therefore fires DURING a pending
 * navigation, and Next's popstate handler answers it by restoring the tree the
 * student is trying to leave. The tap on «الكورس التأسيسي» goes nowhere, or
 * goes somewhere depending on whether the link happened to be prefetched.
 *
 * The cost of not tidying up is one duplicate entry per page — one back press
 * that appears to do nothing before the next one leaves — and it is capped at
 * one per page by the adoption rule in `armSentinel`. That is the trade this
 * hook makes: a dead press on a path nobody complains about, against a
 * non-deterministic navigation on the most-tapped control in the app.
 *
 * @param onBack Runs when the student pressed back with this stop on top. For
 *   an overlay: close. For a guard: ask.
 */
export function useBackDismiss(
  onBack: () => void,
  { rearm = false }: BackDismissOptions = {},
): BackDismissHandle {
  // Allocated once per hook instance and kept in state, so a re-render cannot
  // hand this instance a new identity — including across the mount/unmount/
  // remount that Strict Mode performs in development, where a fresh id would
  // push a second stop instead of adopting the one already there.
  const [id] = useState(() => `stop-${(stopCount += 1)}`);

  // The callback is read through a ref so the effect below can depend on
  // nothing and arm exactly once. Callers pass an inline arrow (`() =>
  // setLeaveOpen(true)`); depending on it directly would tear the stop down
  // and push a NEW history entry on every render of the exam runner — one per
  // keystroke in an essay answer.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  const releaseRef = useRef<() => void>(() => {});
  const release = useCallback(() => releaseRef.current(), []);

  useEffect(() => {
    const armedHref = window.location.href;
    let live = true;

    const disarm = () => {
      if (!live) return;
      live = false;
      const at = armed.indexOf(id);
      if (at !== -1) armed.splice(at, 1);
      window.removeEventListener('popstate', onPopState);
    };

    function onPopState() {
      // Only the innermost stop answers. Both listeners are registered when a
      // dialog opens over the drawer, and both would otherwise close on the
      // one press — the student would lose the dialog AND the navigation
      // underneath it.
      if (armed[armed.length - 1] !== id) return;

      // The pop left the page altogether (a `history.go(-3)`, or a browser
      // restoring a session). Nothing here to dismiss and nothing to re-arm:
      // whatever mounted this is on its way out with the route.
      if (window.location.href !== armedHref) {
        disarm();
        return;
      }

      // The ordinary case: our own stop is what got spent, so it is gone from
      // under us. An overlay stands down with it — immediately, so a second
      // press cannot fire `onBack` again in the frames before React unmounts —
      // and a guard puts a fresh one back instead.
      //
      // The other case, our stop still being the current entry, means what got
      // popped was a spent duplicate sitting ABOVE it: the leftover of an
      // overlay that closed by other means, which this hook deliberately does
      // not tidy up. The student pressed back on this page either way, so it
      // still counts as a press — there is simply nothing to replace.
      if (readSentinel()?.id !== id) {
        if (rearm) armSentinel(id);
        else disarm();
      }

      onBackRef.current();
    }

    armSentinel(id);
    armed.push(id);
    window.addEventListener('popstate', onPopState);
    releaseRef.current = disarm;

    return disarm;
  }, [id, rearm]);

  return { release };
}
