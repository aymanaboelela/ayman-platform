'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { WELCOME_ENTRANCE_MS, entranceDelay, handoffDelayMs, isPlainPress } from '@/lib/welcome-motion';

/**
 * The /welcome scene — the page's one client component, and it exists for
 * exactly one reason: the DEPARTURE.
 *
 * ## Why the entrance is NOT in here
 *
 * Because it must not be. The entrance is pure CSS in `study.css`, driven by
 * `--welcome-delay` values the Server Component writes into the markup, and it
 * therefore runs on the first painted frame — before this file has been
 * fetched, before React has hydrated, on a phone on 3G where that gap is
 * seconds rather than milliseconds. An entrance that waits for JavaScript is
 * an entrance the student watching a blank card does not get.
 *
 * That leaves this component with one job, and it is a job CSS genuinely
 * cannot do: hold the press for the length of a handover and then navigate.
 *
 * ## Why the children come in as a prop
 *
 * `children` is a prop, so the band, the step rail and the WhatsApp card stay
 * Server Components and their markup never enters this client bundle. What
 * crosses the boundary is the already-rendered tree plus two strings.
 *
 * ## Why the CTA is rendered HERE and not passed in with the rest
 *
 * It is the element the press is on, so it is the one element that needs a
 * handler. It is still a real `<Link href>` with a real `href` — see the long
 * note on it below, and the page's own docblock, for why turning it into a
 * `<button>` would be a regression rather than a simplification.
 */
export function WelcomeScene({
  href,
  cta,
  children,
}: {
  /** Where «يلا نبدأ» goes. Already validated by `safeNext` on the server. */
  href: string;
  /** `copy.welcome.continue`, passed down so no Arabic string literal lives in a component. */
  cta: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  /**
   * Whether a departure has already been committed.
   *
   * A ref and not the `leaving` state, because the guard has to hold WITHIN a
   * single tick: a double-press fires both handlers before React has
   * re-rendered, and two `router.push` calls for the same destination push two
   * history entries — so the student's back button lands them on /welcome
   * again, which is the one screen the product never wants to show twice.
   */
  const departed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Two jobs, and the second one is the non-obvious half.
   *
   * CLEANUP: the App Router keeps the outgoing segment mounted for a moment
   * after a push, and a student can also leave this screen by the rail or the
   * back button while the handover is still counting. Either way a pending
   * timer that calls `router.push` after this tree is gone is a navigation
   * nobody asked for.
   *
   * ⚠️ RESET: `welcome-depart` fills FORWARDS — the scene stays at `opacity: 0`
   * once it has left, which is correct while the next page is arriving and very
   * wrong if this tree ever comes BACK carrying `leaving === true`. It has two
   * ways to: this router does not always unmount a page you navigate away from
   * (it keeps the DOM and re-runs the effects), and a browser `bfcache` restore
   * thaws the whole tree with its state intact. Both land here — the mount pass
   * covers the first, `pageshow` covers the second — and both put the screen
   * back to a visible, pressable ground state.
   */
  useEffect(() => {
    const restore = () => {
      departed.current = false;
      setLeaving(false);
    };
    restore();
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener('pageshow', restore);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  function press(event: MouseEvent<HTMLAnchorElement>) {
    /**
     * Not ours. A middle-click, a ⌘-click, or anything upstream has already
     * claimed the press — every one of those leaves this page exactly where it
     * is, so it gets no departure and, crucially, no `preventDefault()`. The
     * browser does what it has always done with a link.
     */
    if (!isPlainPress(event)) return;

    event.preventDefault();
    if (departed.current) return;
    departed.current = true;

    /**
     * Read at press time rather than in an effect.
     *
     * A `useEffect` + `useState` mirror of this query would be `false` for the
     * whole of the first render, which is the render this screen is most
     * likely to be pressed in — so the one student it exists for would get the
     * animation anyway. `matchMedia` is synchronous and correct here, and the
     * server never runs this path.
     */
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delay = handoffDelayMs(reduced);

    /**
     * ⚠️ `setLeaving(true)` happens either way, and under reduced motion it is
     * deliberately a no-op you can see in the CSS rather than a branch here:
     * `study.css` disables every `[data-welcome='leaving']` animation inside
     * the reduce query. Keeping the state write unconditional means the markup
     * is identical in both modes and there is one place — the stylesheet —
     * that decides what motion means.
     */
    setLeaving(true);

    if (delay === 0) {
      router.push(href);
      return;
    }
    timer.current = setTimeout(() => router.push(href), delay);
  }

  return (
    <main className="welcome-page" data-welcome={leaving ? 'leaving' : undefined}>
      <div className="welcome-scene">
        {children}

        {/*
          A real `<Link>` wearing a button's clothes rather than a `<Button>` —
          this NAVIGATES, and a `<button>` that navigates loses middle-click,
          open-in-new-tab and the status-bar preview. That argument is older
          than the animation and it survives it: the `onClick` below only ever
          intercepts a plain left press, and `isPlainPress` is the thing that
          keeps all three behaviours intact.

          Amber, which it was not. It was a hand-copy of `VARIANTS.secondary`
          in `bg-surface-3` grey, on the one screen whose entire job is to
          continue the journey — so nothing on it wore the colour this product
          uses to mean "press here".

          `.welcome-cta` and not `.chip .chip--solid`: the chip is `block-size:
          2rem` and `flex-shrink: 0`, sized for the end of a lesson row, and
          study.css is loaded after the Tailwind layer — so `h-11 w-full` on it
          would have been silently overruled by the chip's own height. Same
          amber, a box built for a page's primary control. (See the ⚠️ at the
          top of study.css about utility-name collisions; this is the same
          trap.)

          ⚠️ THE ONE ELEMENT ON THIS SCREEN THAT NEVER FADES IN. It carries
          `--welcome-delay` like everything else, but its keyframe
          (`welcome-settle`) animates transform ONLY — see study.css. An
          entrance that hides the single control for a third of a second is a
          worse screen than the static one it replaced, so this one is painted,
          hit-testable and pressable on frame one and merely finishes rising
          afterwards.
        */}
        <Link
          href={href}
          className="welcome-cta"
          style={entranceDelay(WELCOME_ENTRANCE_MS.cta)}
          onClick={press}
        >
          {cta}
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
