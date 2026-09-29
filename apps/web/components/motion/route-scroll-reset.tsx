'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Puts a NEW page at its top when Next forgot to — and does nothing when Next
 * did its job, which is almost always.
 *
 * ## The bug this is here for
 *
 * «لما بضغط عليها بتفتح تحت كده، يعني مش بتعمل لودنج والحاجة تظهر». From the
 * landing page, scrolled to 4141px, «كورسات أولى» opened `/years/1` at
 * `scrollY` 1666 — the maximum of a 2899px page, i.e. the old offset clamped —
 * and the reader arrived at the footer, looking at «نبدأ إمتى؟» while the
 * skeleton and then the page appeared a screen and a half above them. Nothing
 * wrote a scroll position at all: not Next, not Lenis.
 *
 * The cause is in Next, and it is deterministic. On a push, the layout router
 * arms a scroll on the new page segment and lets its `ScrollAndFocusHandler`
 * consume it on commit. That handler finds "the page" with `findDOMNode`,
 * which returns the FIRST host fiber under it. When the route is dynamic
 * (`/years/[year]` awaits `searchParams`) the first commit is the
 * `loading.tsx` fallback, and Next renders that fallback as
 * `[loadingStyles, loadingScripts, <Skeleton/>]` — scripts FIRST. Every
 * skeleton we ship mounts `<RouteLoadingWatchdog>`, a client component, so
 * `loadingScripts` is `<script async src=…>` for its chunk. React 19 hoists an
 * async script as a resource: its fiber exists, its DOM node does not. So
 * `findDOMNode` returns `null`, the handler reads that as "no DOM here, a
 * parent will scroll", and returns — without consuming the scroll. No parent
 * holds one. When the page streams in, only the Suspense boundary re-renders,
 * never the handler, so the armed scroll just sits there. Verified on a local
 * production build by walking the fiber tree after the navigation: the page's
 * handler still held `scrollRef: { current: true }`, and its Suspense fallback
 * began with `<script src="/_next/static/chunks/…" async>` — the watchdog's
 * 1KB chunk.
 *
 * A route whose prefetch already carries the whole page never meets it: the
 * fallback never commits, and the first host node is the page's `<main>`.
 * That is the likely reason a course link from `/years/1` went to the top
 * while the year link from the landing did not.
 *
 * ## Why not a fix at the cause
 *
 * The two ways to take the script out of that slot both cost more than this:
 * dropping the watchdog from the skeletons removes the only ceiling a stuck
 * skeleton has (see its file), and `experimental.appNewScrollHandler` — Next's
 * own rewrite, which measures a Fragment ref instead of `findDOMNode` — changes
 * focus and blur on EVERY navigation on three live stacks, behind an
 * experimental flag. When Next makes that handler the default, this component
 * becomes a no-op and can go.
 *
 * ## What it decides, and when
 *
 * `shouldResetScroll` below is the whole policy, and it is deliberately
 * narrow: a PUSH to a new pathname, without a hash. Then, two frames
 * after the commit, `isPageTopOffscreen` asks Next's OWN question — is the top
 * of the page in the viewport? — so a navigation Next already scrolled is left
 * alone, and a layout that keeps the page top in view (the signed-in shell
 * under its sticky bar) is not yanked either.
 *
 * Two frames because `smooth-scroll-impl.tsx` holds Lenis stopped for one
 * frame on every pathname change and restarts it with `resize()` + `start()`;
 * `start()` re-reads the document's scroll position. Writing after that, the
 * native `scrollTo` fires a native scroll event, which Lenis resyncs from
 * (`onNativeScroll`), so it cannot be glided back. Measured on production with
 * the same two-frame write: final `scrollY` 0, and it stayed there.
 */
export function RouteScrollReset() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  const kind = useRef<NavigationKind>({ api: false, pushedTo: null, traversedTo: null });

  useEffect(() => {
    const navigation = navigationApi();

    /*
     * WHO navigated has to be known before React commits, and `popstate` is
     * too late for that in Chrome: measured on a production build, a Back from
     * `/years/1` had the landing page committed and on screen ~40ms BEFORE the
     * `popstate` listener ran, so a traversal read as a push and the reader
     * was thrown to the top of the page they were returning to. The
     * Navigation API's `navigate` fires synchronously at the start of every
     * navigation, and it names the kind outright — so where it exists, a PUSH
     * is recognised positively and everything else is left alone.
     *
     * `replace` is not a verdict: Next rewrites the current entry with
     * `replaceState` on every commit, traversals included.
     */
    if (navigation) {
      kind.current.api = true;
      const onNavigate = (event: Event) => {
        const { navigationType, destination } = event as NavigateEventLike;
        if (navigationType === 'push') kind.current.pushedTo = pathOf(destination.url);
        else if (navigationType !== 'replace') kind.current.pushedTo = null;
      };
      navigation.addEventListener('navigate', onNavigate);
      return () => navigation.removeEventListener('navigate', onNavigate);
    }

    // Without it (older Safari and Firefox), `popstate` is the best there is.
    // Capture phase, so it runs before Next's own listener on `window`.
    const onPopState = () => {
      kind.current.traversedTo = window.location.pathname;
    };
    window.addEventListener('popstate', onPopState, { capture: true });
    return () => window.removeEventListener('popstate', onPopState, { capture: true });
  }, []);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    const { api, pushedTo, traversedTo } = kind.current;
    const pushed = api ? samePath(pushedTo, pathname) : !samePath(traversedTo, pathname);
    // Cleared on every pathname commit, so a navigation that changed only the
    // query (no commit here) cannot outlive itself and decide the next one.
    kind.current.pushedTo = null;
    kind.current.traversedTo = null;

    if (
      !shouldResetScroll({
        previousPathname: from,
        pathname,
        hash: window.location.hash,
        pushed,
      })
    ) {
      return;
    }

    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const main = firstVisibleMain();
        const top = main ? main.getBoundingClientRect().top : null;
        if (!isPageTopOffscreen(top, window.scrollY, window.innerHeight)) return;
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      });
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [pathname]);

  return null;
}

type NavigationKind = {
  /** Whether the Navigation API is there to ask. */
  api: boolean;
  /** Path of the last `push` the Navigation API reported. */
  pushedTo: string | null;
  /** Path the last `popstate` landed on — the fallback's only signal. */
  traversedTo: string | null;
};

/** The two fields read off a `NavigateEvent`, typed locally: not every DOM lib
 *  this repo compiles against declares the Navigation API. */
type NavigateEventLike = Event & {
  navigationType: 'push' | 'replace' | 'traverse' | 'reload';
  destination: { url: string };
};

function navigationApi(): EventTarget | null {
  const navigation = (window as { navigation?: unknown }).navigation;
  return navigation instanceof EventTarget ? navigation : null;
}

function pathOf(url: string): string | null {
  try {
    return new URL(url, window.location.href).pathname;
  } catch {
    return null;
  }
}

/** Percent-encoding is not a difference: an Arabic slug can reach here
 *  encoded from the URL and decoded from `usePathname()`. */
function samePath(a: string | null, b: string): boolean {
  if (a === null) return false;
  return safeDecode(a) === safeDecode(b);
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export type ScrollResetInput = {
  /** `null` on the first commit — the document load, which the browser owns. */
  previousPathname: string | null;
  pathname: string;
  /** `location.hash` after the navigation — `''` when there is none. */
  hash: string;
  /** Whether this commit came from a push — not back/forward, not a replace. */
  pushed: boolean;
};

/**
 * Whether this commit is a navigation to a NEW page that should open at its
 * top. Everything else is someone else's decision:
 *
 * - the first load: the browser's (a reload restores its own position);
 * - the same pathname: a search-param change is the same document —
 *   `years/[year]` pages its filters that way with `scroll={false}`, and would
 *   be yanked to the top on every tap;
 * - a hash: a jump the reader asked for, which Next performs itself;
 * - back/forward: the browser's and Next's restoration;
 * - a replace: a redirect or a URL rewrite, which Next scrolls for itself when
 *   it scrolls at all — the reported bug is a push.
 */
export function shouldResetScroll({
  previousPathname,
  pathname,
  hash,
  pushed,
}: ScrollResetInput): boolean {
  if (previousPathname === null) return false;
  if (previousPathname === pathname) return false;
  if (!pushed) return false;
  if (hash !== '' && hash !== '#') return false;
  return true;
}

/**
 * Next's own test, restated: scroll only if the top of the new page is NOT in
 * the viewport. `pageTop` is the page's `<main>` measured against the
 * viewport, or `null` when there is none on screen yet (a skeleton is not a
 * landmark — see `(site)/loading.tsx`), in which case any offset at all means
 * the reader is not looking at the start of it.
 */
export function isPageTopOffscreen(
  pageTop: number | null,
  scrollY: number,
  viewportHeight: number,
): boolean {
  if (scrollY <= 0) return false;
  if (pageTop === null) return true;
  return pageTop < 0 || pageTop > viewportHeight;
}

/**
 * The page on screen. Under `cacheComponents` the page just left is still in
 * the document inside a hidden `<Activity>` (`display: none`), so the first
 * `<main>` in source order may be the wrong one — only a box that renders
 * counts.
 */
function firstVisibleMain(): HTMLElement | null {
  for (const main of document.querySelectorAll('main')) {
    if (main.getClientRects().length > 0) return main;
  }
  return null;
}
