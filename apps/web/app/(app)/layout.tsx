import { Suspense, type ReactNode } from 'react';
import { AccountMenu, AccountMenuFallback } from '@/components/app/account-menu';
import {
  NotificationBell,
  NotificationBellFallback,
} from '@/components/notifications/notification-bell';
import { RailCourses, RailCoursesSkeleton } from '@/components/app/rail-courses';
import { StudentShell } from '@/components/app/student-shell';
import { privateRouteMetadata } from '@/lib/seo/metadata';

/**
 * `noindex, nofollow` for the whole signed-in area — dashboard, path, player,
 * quizzes, settings. `robots.txt` already disallows these prefixes, but a
 * disallowed URL can still be INDEXED (URL-only, no snippet) if anything
 * links to it; only this directive prevents that. See `privateRouteMetadata`.
 */
export const metadata = privateRouteMetadata;

/**
 * Shell for authenticated app routes.
 *
 * Still no `<main>` and no width constraint of its own — matching the `(site)`
 * route group's convention. Each page carries its own `<main>`, because a
 * shared ancestor `<main>` here would either double up the landmark (invalid —
 * two on one page) or impose one width on both a short onboarding form and the
 * lesson player.
 *
 * What the shell itself provides is `<StudentShell>`: the navigation rail at
 * the inline start, the topbar across the content column, and the route rules
 * that collapse or hide them. It replaced `<AppHeader>`, whose three jobs —
 * navigation, theme, sign-out — all moved into the rail and the topbar;
 * leaving it mounted alongside would have drawn two navigations.
 *
 * ⚠️ This layout is deliberately NOT `async` and reads no request state. It
 * was both for one render, to decide whether to draw the admin link, and that
 * made every client-side transition into this group wait on a `/api/session`
 * round-trip before the new page could commit — with the previous page left
 * mounted the whole time. The visible symptom was two pages briefly
 * coexisting on the /register → /onboarding hand-off, long enough that one
 * field label matched on each of them at once and the signup e2e flow failed
 * on a strict-mode count.
 *
 * Both reads the shell now needs are therefore async Server Components inside
 * their OWN `<Suspense>` boundaries, passed down as already-rendered nodes.
 * The shell paints immediately; the course list and the avatar stream in
 * independently, and either can fail without taking the other — or the page —
 * down with it. Do not "simplify" this by awaiting them here.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <StudentShell
      courses={
        <Suspense fallback={<RailCoursesSkeleton />}>
          <RailCourses />
        </Suspense>
      }
      notifications={
        <Suspense fallback={<NotificationBellFallback />}>
          <NotificationBell />
        </Suspense>
      }
      accountMenu={
        <Suspense fallback={<AccountMenuFallback />}>
          <AccountMenu />
        </Suspense>
      }
    >
      {children}
    </StudentShell>
  );
}
