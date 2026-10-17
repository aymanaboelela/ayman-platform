import { isConnectivityError } from './connectivity-error';
import { UPSTREAM_TIMEOUT_DIGEST } from './api';
import { UPSTREAM_BUSY_DIGEST } from './upstream-digest';

/**
 * An error screen that brings the page back by itself, for the failures that
 * are over in seconds.
 *
 * ## Why the boundary has to act without being asked
 *
 * `/admin/errors` showed what students were actually meeting: a quiz review
 * that failed seven times in ten minutes on one phone's mobile data, `/results`
 * five times in one second, the exam page forty-one times during a live exam.
 * Not one of those was a broken page. They were a connection that dropped, an
 * API that was restarting, a throttle — and every one of them left a student
 * reading «الصفحة دي مافتحتش» until they thought to press «نحاول تاني», which
 * on a phone in the middle of an exam they mostly do not. A failure whose cure
 * is "try again in a moment" should be tried again in a moment.
 *
 * ## Which failures, and how patiently
 *
 *   · `network` — the student's own connection (`lib/connectivity-error.ts`).
 *     Wait for the browser to report itself online, then keep asking the
 *     origin until it answers; only then re-render. Generous, because nothing
 *     is filed for it and the only cost of trying is one tiny request.
 *   · `soon`    — a SERVER render failed. The digest says how: a throttle
 *     (`UPSTREAM_BUSY_DIGEST`) waits longest, an API that did not answer
 *     (`UPSTREAM_TIMEOUT_DIGEST` — timed out or refused during a restart) a
 *     little less, and any other server fault gets ONE quiet retry, because a
 *     deploy window and a database blip look exactly like a bug from here and
 *     a second deterministic failure costs one render.
 *
 * A client-side throw with no digest gets nothing: that is a bug in this
 * bundle, and re-rendering the same bundle reproduces it. The stale-build
 * shapes are not here either — they have their own document-load recovery in
 * `use-error-retry.ts`.
 *
 * ## ⚠️ The origin is asked FIRST, every time
 *
 * A retry is `router.refresh()`, and a refresh answered by Traefik's plain-text
 * 404 — the few seconds of every deploy — is not a failed refresh: Next treats
 * a non-RSC answer as a reason to load the URL as a document, and the student
 * lands on a bare «404 page not found» with the platform gone. So no retry
 * fires until `/build-id` answers `ok`: a Next route handler, `no-store`, a few
 * bytes, never intercepted by `public/sw.js` (`lib/build-watch.ts` says why).
 * Not answering does not spend an attempt; it just waits a little longer.
 */

export type AutoRetryKind = 'network' | 'soon';

export interface AutoRetryPlan {
  kind: AutoRetryKind;
  /** Wait before each automatic attempt; its length is the number of attempts. */
  delays: readonly number[];
}

const NETWORK_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000, 30_000, 30_000, 30_000, 30_000];
const BUSY_DELAYS = [6_000, 15_000, 30_000];
const UNANSWERED_DELAYS = [4_000, 10_000, 20_000];
const SERVER_FAULT_DELAYS = [4_000];

/** How long to wait between two asks of an origin that did not answer. */
export const PROBE_INTERVAL_MS = 5_000;

/**
 * Attempts for one failure are counted per (route, failure), and forgotten
 * once this long has passed since that failure was last seen or retried.
 *
 * Two minutes, because of what it has to tell apart. A retry that FAILED comes
 * back as the next error within the seconds a render takes, so a chain of
 * failures always lands inside the window and keeps counting towards its cap.
 * A retry that WORKED produces nothing at all — so the next failure on the same
 * page, minutes later, is a new story and gets the whole plan again. Without
 * that, a student on patchy data who recovered ten times would find the
 * eleventh drop left for them to press.
 */
export const AUTO_RETRY_MEMORY_MS = 2 * 60_000;

export function autoRetryPlanFor(error: Error & { digest?: string }): AutoRetryPlan | null {
  if (isConnectivityError(error)) return { kind: 'network', delays: NETWORK_DELAYS };
  if (error.digest === UPSTREAM_BUSY_DIGEST) return { kind: 'soon', delays: BUSY_DELAYS };
  if (error.digest === UPSTREAM_TIMEOUT_DIGEST) return { kind: 'soon', delays: UNANSWERED_DELAYS };
  if (error.digest) return { kind: 'soon', delays: SERVER_FAULT_DELAYS };
  return null;
}

/*
 * ── bookkeeping ─────────────────────────────────────────────────────────────
 *
 * Module scope for the reason `use-error-retry.ts` gives for its strike
 * counter: every failed retry mounts a FRESH fallback instance, so anything
 * kept per instance is back at zero on exactly the attempt that needed to know
 * it was the third.
 */
let attemptsFor = '';
let attemptsMade = 0;
let attemptsAt = 0;

function failureKey(error: Error & { digest?: string }, plan: AutoRetryPlan): string {
  return `${window.location.pathname}|${plan.kind}|${error.digest ?? error.message}`;
}

/** Which attempt this failure is on, or `null` once its plan is spent. */
export function nextAttemptIndex(
  error: Error & { digest?: string },
  plan: AutoRetryPlan,
  now: number,
): number | null {
  const key = failureKey(error, plan);
  if (key !== attemptsFor || now - attemptsAt > AUTO_RETRY_MEMORY_MS) {
    attemptsFor = key;
    attemptsMade = 0;
  }
  attemptsAt = now;
  return attemptsMade < plan.delays.length ? attemptsMade : null;
}

function spendAttempt(now: number): void {
  attemptsMade += 1;
  attemptsAt = now;
}

/** For tests: every attempt forgotten, as on a fresh page. */
export function resetAutoRetryMemory(): void {
  attemptsFor = '';
  attemptsMade = 0;
  attemptsAt = 0;
  pending = null;
}

/*
 * ── "a retry is on its way" — for the line under the error ─────────────────
 *
 * A tiny external store rather than `useState`, because the fact is decided in
 * an effect and the screen has to say it: the boundary reads it with
 * `useSyncExternalStore`, which is the sanctioned way for an effect to tell a
 * render something.
 *
 * ⚠️ Two details keep this from looping, and the first version had neither
 * (measured: «Maximum update depth exceeded» on the first test that rendered an
 * error whose identity was not stable). The snapshot is a STRING — the same
 * failure reads the same however many fresh `Error` objects describe it — and
 * a teardown does not clear it synchronously (see the end of
 * `scheduleAutoRetry`), so a cleanup followed in the same commit by the same
 * failure re-arming never tells the screen anything at all.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();
/** Counts every arming, so a deferred clear can tell it was superseded. */
let armed = 0;

/** One failure as a string: the same failure reads the same across renders. */
export function failureIdentity(error: Error & { digest?: string }): string {
  return `${error.name}\u0000${error.digest ?? ''}\u0000${error.message}`;
}

function pendingValue(kind: AutoRetryKind, error: Error & { digest?: string }): string {
  return `${kind}\u0001${failureIdentity(error)}`;
}

function setPending(next: string | null): void {
  if (next === pending) return;
  pending = next;
  for (const listener of listeners) listener();
}

export function subscribePendingAutoRetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function pendingAutoRetry(): string | null {
  return pending;
}

/** Which kind of automatic retry is armed for THIS failure, if any. */
export function waitingFor(
  snapshot: string | null,
  error: Error & { digest?: string },
): AutoRetryKind | null {
  if (snapshot === null) return null;
  const split = snapshot.indexOf('\u0001');
  if (snapshot.slice(split + 1) !== failureIdentity(error)) return null;
  const kind = snapshot.slice(0, split);
  return kind === 'network' || kind === 'soon' ? kind : null;
}

/** `true` when the origin answered with a 2xx — see the ⚠️ in the header. */
export async function originAnswers(): Promise<boolean> {
  try {
    const response = await fetch(`/build-id?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface ScheduleOptions {
  /** The retry itself — `router.refresh()` then `reset()`, in one transition. */
  retry: () => void;
  /** Injected for tests; `originAnswers` otherwise. */
  probe?: () => Promise<boolean>;
}

/**
 * Plans and arms the automatic retry for one failure. Returns the teardown,
 * which the caller runs when the boundary unmounts or the error changes — so
 * a student who pressed the button, or navigated away, never gets a second
 * retry landing on top of the page they moved on to.
 */
export function scheduleAutoRetry(
  error: Error & { digest?: string },
  { retry, probe = originAnswers }: ScheduleOptions,
): () => void {
  const plan = autoRetryPlanFor(error);
  if (!plan) return () => {};
  const attempt = nextAttemptIndex(error, plan, Date.now());
  if (attempt === null) return () => {};

  let cancelled = false;
  let timer: number | undefined;
  const wait = (ms: number, then: () => void) => {
    timer = window.setTimeout(() => {
      timer = undefined;
      if (!cancelled) then();
    }, ms);
  };

  // `pending` is left SET while the retry is in flight: the screen keeps saying
  // what it is doing until the attempt resolves — the page replaces it, or the
  // next failure re-arms it — rather than flicking back to the plain body for
  // the length of one request.
  const fire = () => {
    if (cancelled) return;
    spendAttempt(Date.now());
    retry();
  };

  const askThenFire = () => {
    void probe().then((answered) => {
      if (cancelled) return;
      if (answered) fire();
      else wait(PROBE_INTERVAL_MS, askThenFire);
    });
  };

  /*
   * Offline is the one state the browser reports for certain, and it says
   * when it ends. Waiting on the event means a student who walks back into
   * coverage gets the page within a second, not at the next tick of a timer.
   */
  const onOnline = () => {
    window.removeEventListener('online', onOnline);
    if (!cancelled) wait(plan.delays[attempt]!, askThenFire);
  };

  const mine = pendingValue(plan.kind, error);
  armed += 1;
  setPending(mine);
  if (plan.kind === 'network' && navigator.onLine === false) {
    window.addEventListener('online', onOnline);
  } else {
    wait(plan.delays[attempt]!, askThenFire);
  }

  const armedAs = armed;
  return () => {
    cancelled = true;
    if (timer !== undefined) window.clearTimeout(timer);
    window.removeEventListener('online', onOnline);
    /*
     * Cleared a microtask LATER, and only if nothing re-armed in between. A
     * cleanup is usually followed, in the same commit, by the next effect
     * arming the very same failure again (a re-render, StrictMode's double
     * run); clearing synchronously would notify the boundary twice and make
     * React schedule a render for a value that ends up unchanged — which
     * re-runs the effect, which clears and re-arms, without end.
     */
    queueMicrotask(() => {
      if (armed === armedAs && pending === mine) setPending(null);
    });
  };
}
