'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isAttemptRoute, isRailForcedCollapsed } from './student-nav-items';
import { StudentRail } from './student-rail';
import { StudentTopbar } from './student-topbar';

/**
 * The frame every signed-in student page renders inside: rail at the inline
 * start, topbar across the content column.
 *
 * ## Why this is a client component
 *
 * Two of its three states are decided by the route, and in the App Router a
 * layout does not re-render on navigation within its own segment — only a
 * client component reading `usePathname()` reacts to the URL changing. The
 * layout above stays synchronous and passes `courses` and `accountMenu` down
 * as pre-rendered Server Component nodes, so nothing here awaits anything.
 *
 * ## The three states
 *
 * 1. **A running attempt renders no shell at all.**
 *    `/quizzes/:lessonId/attempt/:attemptId` is a timed, graded exam. The
 *    runner owns that whole viewport with its own timer, question navigator
 *    and submit control, and persistent navigation around it is one mis-click
 *    away from leaving an attempt that is still counting down. The review
 *    screen under it is not an attempt and keeps the shell.
 *
 *    This check is now the SECOND of two, and it is still the load-bearing
 *    one. `(app)/layout.tsx` also skips constructing the chrome on this route
 *    (via `<ChromeUnlessAttempt>`, off a header `proxy.ts` stamps), which is
 *    what stops the three round trips it costs — but a layout does not
 *    re-render on a client-side navigation within its own segment, so tapping
 *    «ابدأ» reaches the runner with the chrome already mounted and no server
 *    render at all. Only this line takes it down for that. Do not remove it on
 *    the grounds that the server "already handles it": the server handles the
 *    other case.
 *
 * 2. **The lesson player forces the rail to its icon width.** The player draws
 *    its own course-outline sidebar; two full rails would leave the video the
 *    narrowest column on screen. This overrides the student's preference for
 *    the duration of the route without writing to it, so leaving the lesson
 *    restores whatever they had chosen.
 *
 * 3. **Everywhere else the student's own preference wins**, applied by CSS
 *    from `html[data-rail]` — never from React state, which cannot be known on
 *    the server and would flash on every load.
 *
 * `data-rail-forced` is emitted only when true rather than as `"false"`, so
 * the CSS can match on the attribute's presence and the DOM stays quiet on the
 * routes where nothing is being overridden.
 */
export function StudentShell({
  courses,
  notifications,
  accountMenu,
  overlay,
  children,
}: {
  courses: ReactNode;
  notifications: ReactNode;
  accountMenu: ReactNode;
  /**
   * Anything that must be `position: fixed` to the VIEWPORT — today, «المساعد».
   *
   * It is a slot of its own rather than more `children`, and that is a bug fix,
   * not tidiness. `.route-fade` below animates a 4px rise, and a finished CSS
   * animation with `fill-mode: both` leaves `transform` computed as the IDENTITY
   * MATRIX, not the keyword `none` — which still makes the element a containing
   * block for every `position: fixed` descendant.
   *
   * So the assistant launcher, rendered inside `children`, was anchored to the
   * page wrapper instead of to the window: measured on `/path` at scrollY 1500,
   * it sat 3231px BELOW the bottom of the viewport. It looked pinned on a short
   * page and vanished on every long one. Reported as «مش مظبطة خالص».
   *
   * `assistant-widget.tsx` predicts this exactly — "a transformed ancestor
   * would silently re-anchor both the launcher and the panel to a box at the
   * end of the document… Never give this element a transform" — but that note
   * guards the widget's OWN carrier, and the transform was two levels up, in
   * this file, on a wrapper that had no idea it was containing anything.
   *
   * Rendering it as a sibling of the animated wrapper is what keeps both: the
   * route transition, and a launcher fixed to the window.
   */
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  // The runner owns the whole viewport — see (2) above. The overlay goes with
  // the rest of the chrome: a support launcher on top of a timed exam is one
  // mis-tap away from leaving it.
  if (isAttemptRoute(pathname)) return <>{children}</>;

  const forcedCollapsed = isRailForcedCollapsed(pathname);

  return (
    <div className="shell" data-rail-forced={forcedCollapsed ? 'true' : undefined}>
      {/*
        The signed-in surface's one decorative layer: a static warm bloom at
        the top of the viewport. It replaces the dot grid and the pointer-trail
        fluid that used to mount at the root — see `(site)/layout.tsx` for why
        those moved. This costs one gradient and zero JavaScript, and it does
        not move while a student is reading.
      */}
      <div className="app-bloom" aria-hidden="true" />
      <StudentRail courses={courses} forcedCollapsed={forcedCollapsed} />
      <div className="flex min-w-0 flex-col">
        <StudentTopbar courses={courses} notifications={notifications} accountMenu={accountMenu} />
        {/*
          `key={pathname}` remounts this wrapper on every navigation, which is
          what lets a pure CSS animation run AGAIN rather than firing once on
          the first load and never after.

          A fade with a 4px rise, 220ms — short enough that it never delays the
          content, long enough to read as a transition rather than a flash.

          Deliberately NOT a cross-fade between the two pages. That needs both
          trees mounted and animating against each other, and the App Router
          already keeps the OUTGOING segment in the document (see the note in
          `e2e/fixtures.ts`), so the honest result is a new page fading in over
          a stale one that is still sitting there.

          Reduced motion is covered by the global backstop in `motion.css`,
          which zeroes every animation duration in the product.
        */}
        <div key={pathname} className="route-fade min-w-0">
          {children}
        </div>
      </div>

      {/* OUTSIDE `.route-fade`, and it has to stay outside — see the `overlay`
          prop for the measurement. Nothing between here and the viewport may
          carry a transform, a filter, `perspective`, `contain` or a
          `will-change`; every one of them makes an element the containing block
          for its fixed descendants. `.shell` is a plain grid, which is safe. */}
      {overlay}
    </div>
  );
}
