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
  assistant,
  children,
}: {
  courses: ReactNode;
  notifications: ReactNode;
  accountMenu: ReactNode;
  /**
   * «المساعد», as a control in the TOPBAR rather than a disc floating over the
   * page — «في الداشبورد… خليها جنب النوتيفيكيشن فوق».
   *
   * ## Why this is a slot and not a `<AssistantWidget/>` written into the topbar
   *
   * Same reason `notifications` and `accountMenu` are: this component is a
   * Client Component (it reads `usePathname()`), and the layout above it is
   * deliberately synchronous and non-`async`. Passing pre-rendered nodes down is
   * what keeps that true.
   *
   * ## ⚠️ It goes through the TOPBAR, and the panel does not
   *
   * This slot used to be `overlay`, and carried a hard-won measurement worth
   * keeping: `.route-fade` below animates a 4px rise, and a finished CSS
   * animation with `fill-mode: both` leaves `transform` computed as the IDENTITY
   * MATRIX rather than the keyword `none` — which still makes the element a
   * containing block for every `position: fixed` descendant. Rendered inside
   * `children`, the launcher was therefore anchored to the page wrapper instead
   * of the window: measured on `/path` at scrollY 1500, it sat 3231px BELOW the
   * bottom of the viewport. It looked pinned on a short page and vanished on
   * every long one. Reported as «مش مظبطة خالص».
   *
   * The launcher is no longer `position: fixed` at all, so that particular trap
   * is behind it — but the PANEL still is, and the topbar it now hangs off
   * carries `backdrop-blur`, which creates a containing block by exactly the
   * same mechanism a transform does. `assistant-widget.tsx` portals the panel to
   * `document.body` for that reason; the note is repeated there because that is
   * where the fix lives.
   */
  assistant?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  // The runner owns the whole viewport — see (2) above. المساعد goes with the
  // rest of the chrome: a support launcher on top of a timed exam is one
  // mis-tap away from leaving it, and a channel to a person beside a graded
  // question is an integrity hole rather than a distraction.
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
        <StudentTopbar
          courses={courses}
          notifications={notifications}
          accountMenu={accountMenu}
          assistant={assistant}
        />
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
    </div>
  );
}
