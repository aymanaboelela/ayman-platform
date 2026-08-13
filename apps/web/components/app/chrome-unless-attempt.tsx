import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { pathnameFromHeaders } from '@/lib/request-pathname';
import { isAttemptRoute } from './student-nav-items';

/**
 * Renders its children unless the request is for a running attempt — the
 * server-side half of the rule `student-shell.tsx` enforces on the client.
 *
 * ## What it is actually for
 *
 * The shell's `isAttemptRoute(pathname)` check discards the rail, the topbar,
 * the course list, the bell and the account menu on
 * `/quizzes/:lessonId/attempt/:attemptId`. That decision is correct and it is
 * also far too late: it runs in the browser, and by the time it does,
 * `(app)/layout.tsx` has already RENDERED those Server Components and
 * serialised them into the payload. Measured cost of chrome nobody sees, on a
 * hard load of the runner: `/api/me/dashboard` (the heaviest endpoint in the
 * app), `/api/session`, and the unread count — three of the student's ten
 * requests a second, spent while the runner is asking for its questions and
 * arming its autosave, on a phone, on a timer.
 *
 * Wrapping each chrome slot in this is what stops the render happening at all:
 * a component that returns `null` never renders its children, so the fetches
 * inside them are never issued.
 *
 * ## Why it is a component and not a branch in the layout
 *
 * Because the layout must not read this itself. `headers()` under
 * `cacheComponents: true` returns a HANGING promise during a prerender
 * (`next/dist/server/request/headers.js` → `makeHangingHeaders`), so awaiting
 * it at the top of `(app)/layout.tsx` blocks the root of every route in the
 * group: no static shell is produced, `throwIfDisallowedDynamic` reports it,
 * and the build fails. Inside these `<Suspense>` boundaries the same read is
 * ordinary — the boundary is exactly the licence to be dynamic, and the
 * fallbacks it streams behind are already the shell.
 *
 * That is also why this reads the pathname from a header rather than being
 * handed it: see `lib/request-pathname.ts`.
 *
 * ## Why the client check stays
 *
 * This does NOT replace it. A layout does not re-render on a client-side
 * navigation within its own segment, so tapping «ابدأ» on the quiz page moves
 * into the runner with the chrome already mounted and no server render at all —
 * only `student-shell.tsx` can take it down for that. This covers the other
 * direction: every hard load of the runner, which is to say the reload, the
 * restored tab and the resume-after-disconnect the attempt page is written
 * around.
 *
 * The review screen under the attempt (`…/review`) is not an attempt and keeps
 * its full chrome — `isAttemptRoute` is anchored for that reason, and it is the
 * same predicate the shell reads, so the two cannot disagree about a route.
 */
export async function ChromeUnlessAttempt({ children }: { children: ReactNode }) {
  const pathname = pathnameFromHeaders(await headers());

  // No header means the proxy did not run on this request — a prefetch, or one
  // of the `(app)` routes its public branch leaves alone. Fail open: those are
  // never the runner, and rendering the chrome is what happened before this
  // component existed.
  if (pathname !== null && isAttemptRoute(pathname)) return null;

  return <>{children}</>;
}
