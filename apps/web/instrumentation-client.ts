import { documentLoadFor, type RouterNavigationType } from './lib/stale-navigation';

/**
 * Next's client hook file — evaluated once per document, before hydration.
 *
 * It exports ONE thing, `onRouterTransitionStart`, and that is the whole of
 * «a tab that knows it is behind the server moves to the new build on its next
 * click». `lib/stale-navigation.ts` has the reasoning, and why this hook rather
 * than a click listener. Kept this small on purpose: whatever this file imports
 * is loaded ahead of every page.
 */

/**
 * The pathname the router last moved to, for judging a back/forward press —
 * which reports only after the URL has already changed. Starts as the page
 * this document was loaded for.
 */
let lastPathname = typeof window === 'undefined' ? '/' : window.location.pathname;

export function onRouterTransitionStart(url: string, navigationType: RouterNavigationType): void {
  try {
    const target = documentLoadFor(url, navigationType, window.location, lastPathname);
    lastPathname = new URL(url, window.location.href).pathname;
    if (!target) return;
    if (target.mode === 'assign') window.location.assign(target.href);
    else window.location.replace(target.href);
  } catch {
    // Never in the way of a navigation: worst case it stays a soft one.
  }
}
