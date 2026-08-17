'use client';

// Aliased: the package's default export and this file's exported component
// would otherwise be the same identifier. `ClaritySdk` is the vendor's API,
// `<Clarity>` is ours.
import ClaritySdk from '@microsoft/clarity';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { isAttemptRoute } from '@/components/app/student-nav-items';

/**
 * The project id is PUBLIC by design — it ships inside the tag URL in every
 * visitor's HTML, so it is an identifier, not a secret. It is still read from
 * the environment rather than hardcoded so a fork, a staging build, or a
 * second project does not silently write into this dashboard.
 *
 * ⚠️ `NEXT_PUBLIC_*` is burned into the bundle at BUILD time (see
 * `apps/web/Dockerfile`). Unset at build → the tag never ships, and no amount
 * of setting it at runtime brings it back without a rebuild. That is also the
 * reason nothing loads in local development: `.env.example` leaves it empty.
 */
const PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

/**
 * `window.clarity` as the tag itself defines it.
 *
 * `@microsoft/clarity` does not export a `stop`, but `ClaritySdk.init()` installs
 * the standard queueing stub on `window` before the remote script has loaded,
 * and that stub forwards every command — including the two below, which are
 * not in the package's typed surface but are part of the tag's API.
 */
type ClarityApi = (command: 'start' | 'stop', ...args: unknown[]) => void;

/**
 * Microsoft Clarity — session recordings + heatmaps.
 *
 * Mounted once, in the ROOT layout, so it covers the marketing pages a student
 * lands on first as well as the signed-in surface. Renders nothing.
 *
 * ## Why the npm package rather than a hand-pasted `<script>`
 *
 * The snippet Clarity's dashboard hands you is an inline IIFE, and inlining it
 * costs more than it looks. `next/script` would have to carry it as
 * `dangerouslySetInnerHTML`, which puts a third party's code in this repo as
 * an opaque string nobody reviews on update; and an inline script is exactly
 * the thing `script-src` cannot constrain without `'unsafe-inline'` covering
 * everything else too. `@microsoft/clarity` is Microsoft's own wrapper around
 * that same IIFE — it injects `https://www.clarity.ms/tag/<id>?ref=npm` and
 * guards on the `clarity-script` element id, so calling `init` twice is a
 * no-op. What ships is one external `src` from ONE named host, which is a
 * thing CSP can actually talk about.
 *
 * ## Why `/admin` is excluded
 *
 * Clarity records the rendered DOM. The admin screens put real students'
 * names, emails, grades and attempt answers on screen — a recording of one is
 * a copy of that data sitting in a third-party dashboard, and no heatmap of a
 * single-operator back office is worth that. Clarity's own text masking is a
 * default, not a guarantee, so this does not rely on it.
 *
 * The check has two halves because a client-side navigation does not reload
 * the page:
 *
 *  · `init` is never CALLED when the entry point is already `/admin`, so on
 *    that path no script is fetched at all.
 *  · `clarity('stop')` fires when a session walks into `/admin` from
 *    somewhere else, and `('start')` when it walks back out. Without the
 *    stop, one visit to `/dashboard` first would keep the recorder running
 *    through the whole admin session.
 *
 * ## Why an effect and not `next/script`
 *
 * The package injects the tag itself, from the browser — there is no `<script>`
 * for React to render. An effect is the correct place for that: it runs after
 * hydration, off the critical path, and it is the only place `window` exists.
 * `lazyOnload`'s old behaviour (wait for `window.load`) is deliberately NOT
 * reproduced: on an Egyptian phone connection that can be many seconds after
 * the page is usable, and a student who taps through before it fires is a
 * session that was never recorded at all.
 */
export function Clarity() {
  const pathname = usePathname();
  /**
   * Two routes it must not record, for two different reasons.
   *
   * `/admin` is privacy: an instructor's screen carries other people's names,
   * phone numbers and marks.
   *
   * A running ATTEMPT is performance, and it is the more expensive of the two.
   * Clarity installs a document-wide `MutationObserver` and continuously
   * serialises DOM deltas plus pointer and scroll telemetry — and the quiz
   * runner is the single worst page in the product to point that at. The
   * countdown rewrites text four times a second (`quiz-timer.tsx`), every
   * keystroke mutates the question card, and a paper runs for half an hour, so
   * the recorder does per-mutation work on the main thread for the whole
   * sitting, on top of everything the student is actually doing. That is a
   * large part of «بيلاج وأنا بحل الامتحان».
   *
   * `isAttemptRoute` is the same predicate `student-shell.tsx` uses to strip
   * the entire chrome from this route — the app already knows this page is
   * special, and this is one more thing that should have followed from it.
   *
   * ⚠️ ATTEMPT only, not the review or the intro screen. Those are ordinary
   * pages a student reads, and they are where a recording is genuinely useful
   * for finding out what confused somebody.
   */
  const paused = (pathname?.startsWith('/admin') ?? false) || isAttemptRoute(pathname ?? '');

  useEffect(() => {
    if (!PROJECT_ID) return;

    /*
     * Not initialised on a paused entry, and NOT started later either — the
     * effect re-runs on navigation, so walking out of `/admin` (or submitting
     * an attempt) reaches `init` for the first time there. `init` is idempotent
     * (it returns early if the script element already exists), which is what
     * makes calling it from a path-dependent effect safe.
     */
    if (!paused) ClaritySdk.init(PROJECT_ID);

    // Absent until `init` has run at least once — on `/admin` as an entry
    // point it never has, which is the intended outcome and not a case to
    // handle.
    const clarity = (window as unknown as { clarity?: ClarityApi }).clarity;
    if (typeof clarity !== 'function') return;
    clarity(paused ? 'stop' : 'start');
  }, [paused]);

  return null;
}
