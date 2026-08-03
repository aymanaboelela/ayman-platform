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
  accountMenu,
  children,
}: {
  courses: ReactNode;
  accountMenu: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();

  if (isAttemptRoute(pathname)) return <>{children}</>;

  const forcedCollapsed = isRailForcedCollapsed(pathname);

  return (
    <div className="shell" data-rail-forced={forcedCollapsed ? 'true' : undefined}>
      <StudentRail courses={courses} forcedCollapsed={forcedCollapsed} />
      <div className="flex min-w-0 flex-col">
        <StudentTopbar courses={courses} accountMenu={accountMenu} />
        {children}
      </div>
    </div>
  );
}
