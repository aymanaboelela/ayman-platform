import { Suspense, type ReactNode } from 'react';
// The study vocabulary — `.stage`, `.unit`, `.lesson-row`, `.chip`, `.tile`.
//
// Imported by THIS layout and by `(admin)`, not by `globals.css`. It moved up
// one level for the second consumer: the admin course builder authors the very
// objects this file describes, and rendering the instructor's outline in a
// second private vocabulary is how the two drift apart. A marketing page that
// picked up `.unit` would still be styling something that means nothing there,
// which is why this is not global.
import '../study.css';
import { AccountMenu, AccountMenuFallback } from '@/components/app/account-menu';
import {
  NotificationBell,
  NotificationBellFallback,
} from '@/components/notifications/notification-bell';
import { RailCourses, RailCoursesSkeleton } from '@/components/app/rail-courses';
import { StudentShell } from '@/components/app/student-shell';
import { privateRouteMetadata } from '@/lib/seo/metadata';
import { AssistantWidget } from '@/components/assistant/assistant-widget';

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
      assistant={
        /*
        المساعد. Mounted per ROUTE GROUP, not at the root — and that is a
        boundary, not a preference.

        At the root it also rendered on `not-found.tsx`, which is the SAME
        tree Next renders when `(admin)/layout.tsx` calls `notFound()` on a
        student who reached `/admin/*`. The only difference between the two
        was `usePathname()`, so the launcher appeared on one and not the
        other — and `admin-publish-course.e2e.ts` caught it within a minute:
        that test asserts a student probing `/admin` gets output byte-identical
        to a route that does not exist, precisely so "forbidden" cannot be told
        apart from "absent". A visible button is a difference.

        Route-group layouts do not wrap the root `not-found.tsx`, so mounting
        here means neither 404 carries the widget. `(admin)` has no mount at
        all — the instructor does not message himself.

        `<Suspense>` is REQUIRED: the widget reads `useSearchParams()` (a reply
        notification links to `?assistant=1`), and under `cacheComponents: true`
        an unsuspended search-param read makes every prerendered page a build
        error. `null` for a fallback — it renders nothing until hydration.

        ## `docked`, and why this slot is not `children`

        On THIS surface the launcher is a control in the topbar beside the
        notification bell, not a disc floating over the page — «في الداشبورد…
        خليها جنب النوتيفيكيشن فوق». The signed-in shell already has a row of
        persistent controls, and a 56px pill over the lesson player was a second
        navigation competing with the first while covering the content.

        It stays out of `children` either way. `children` renders inside
        `.route-fade`, whose finished animation leaves an identity `transform`
        behind — which makes it the containing block for every
        `position: fixed` descendant. The launcher was pinned to the BOTTOM OF
        THE PAGE rather than to the window and slid off screen on any route long
        enough to scroll; `StudentShell`'s prop carries that measurement, and the
        panel (still fixed, and now hanging off a `backdrop-blur` header) is
        portalled for the same family of reason.
      */
        <Suspense fallback={null}>
          <AssistantWidget variant="docked" />
        </Suspense>
      }
    >
      {children}
    </StudentShell>
  );
}
