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
import { ChromeUnlessAttempt } from '@/components/app/chrome-unless-attempt';
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
 *
 * ## `<ChromeUnlessAttempt>`, and why the read is DOWN THERE and not up here
 *
 * `student-shell.tsx` discards this entire chrome on a running attempt — the
 * runner owns the viewport — but it decides that in the browser, long after
 * these three Server Components have rendered and paid for
 * `/api/me/dashboard`, `/api/session` and the unread count. On a hard load of
 * the runner that is three round trips out of a student's rate-limit budget,
 * spent on markup nothing will mount, while the questions are still in flight.
 *
 * The obvious fix is to read `proxy.ts`'s pathname header here and pass
 * `null` for the three slots. It cannot be done: under `cacheComponents: true`
 * `headers()` returns a hanging promise during a prerender, so awaiting it in
 * THIS function blocks the root of every route in the group — no static shell,
 * and a build that fails on all of them. It would also make the layout `async`
 * again, which is the very thing the paragraph above was written about.
 *
 * So the read happens one level down, inside the boundaries that already
 * license a dynamic read, and the shell shape above is untouched: same three
 * slots, same three fallbacks, same independent streaming. See
 * `components/app/chrome-unless-attempt.tsx`.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <StudentShell
      courses={
        <Suspense fallback={<RailCoursesSkeleton />}>
          <ChromeUnlessAttempt>
            <RailCourses />
          </ChromeUnlessAttempt>
        </Suspense>
      }
      notifications={
        <Suspense fallback={<NotificationBellFallback />}>
          <ChromeUnlessAttempt>
            <NotificationBell />
          </ChromeUnlessAttempt>
        </Suspense>
      }
      accountMenu={
        <Suspense fallback={<AccountMenuFallback />}>
          <ChromeUnlessAttempt>
            <AccountMenu />
          </ChromeUnlessAttempt>
        </Suspense>
      }
      assistant={
        /*
        المساعد. Mounted per ROUTE GROUP, not at the root — and that is a
        boundary, not a preference.

        At the root it also rendered on the NOT-FOUND tree, which is the SAME
        tree Next renders when `(admin)/layout.tsx` calls `notFound()` on a
        student who reached `/admin/*`. The only difference between the two
        was `usePathname()`, so the launcher appeared on one and not the
        other — and `admin-publish-course.e2e.ts` caught it within a minute:
        that test asserts a student probing `/admin` gets output byte-identical
        to a route that does not exist, precisely so "forbidden" cannot be told
        apart from "absent". A visible button is a difference.

        Route-group layouts do not wrap that root tree, so mounting
        here means neither 404 carries the widget. `(admin)` has no mount at
        all — the instructor does not message himself.

        ⚠️ "The not-found tree" is deliberately not written as a FILE, and the
        wording was corrected on 2026-08-13 because it used to be. There is no
        `not-found.tsx` anywhere in `apps/web` — `find apps/web -name
        "not-found*"` returns nothing — so what is being described is Next's own
        built-in default. Everything above stays true of it: it is what
        `notFound()` renders, and a route-group layout does not wrap it. Only
        the noun was wrong, and a comment naming a file nobody can open is how a
        reader decides the rest of it is stale too.

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
