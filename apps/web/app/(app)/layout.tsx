import { Suspense, type ReactNode } from 'react';
import { AppHeader } from '@/components/app-header';
import { AdminLink } from '@/components/admin-link';

/**
 * Shell for authenticated app routes.
 *
 * Still no `<main>` and no width constraint of its own — matching the `(site)`
 * route group's convention. This used to hardcode
 * `<main className="max-w-2xl px-6 py-16">` for onboarding; that width is right
 * for a short form but wrong for the player and the dashboard, both of which
 * need the same `--w-shell` (1152px) width every other top-level page uses. A
 * shared ancestor `<main>` here would either double up the `<main>` landmark
 * (invalid — two on one page) or squeeze the player's outline sidebar into
 * 672px. `onboarding/page.tsx`, `onboarding/loading.tsx` and
 * `settings/devices/page.tsx` each carry their own `<main>` instead.
 *
 * What IS new is the header. Before it, a signed-in student had no logo, no
 * navigation, no theme control and — because the product shipped no sign-out
 * anywhere at all — no way to end their session on a shared machine.
 *
 * ⚠️ This layout is deliberately NOT `async` and reads no request state. It
 * was both for one render, to decide whether to draw the admin link, and that
 * made every client-side transition into this group wait on a `/api/session`
 * round-trip before the new page could commit — with the previous page left
 * mounted the whole time. The session read now lives in `<AdminLink>` behind
 * its own `<Suspense>`, so the shell paints immediately and only that one link
 * streams in. See that component for the full story.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader
        adminLink={
          <Suspense fallback={null}>
            <AdminLink />
          </Suspense>
        }
        adminLinkMobile={
          <Suspense fallback={null}>
            <AdminLink className="block rounded-md px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted hover:bg-surface-3 hover:text-fg" />
          </Suspense>
        }
      />
      {children}
    </>
  );
}
