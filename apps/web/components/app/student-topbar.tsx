'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ArrowUpLeft, Menu } from 'lucide-react';
// Subpaths, not the root barrels. This bar renders on every `(app)` route, so
// a barrel import here is a client reference on every signed-in page: the
// contracts barrel alone is 539 KB raw / 128 KB gzip of zod schemas, a
// 245-country phone table and the admin copy table, none of which a topbar
// needs to print «القائمة». The `@ayman/ui` barrel costs six more Radix client
// modules beyond the sheet this file actually renders.
import { copy } from '@ayman/contracts/copy';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@ayman/ui/components/sheet';
import { BrandLockup } from '@/components/brand-lockup';
import { ThemeToggle } from '@/components/theme-toggle';
import { StudentNavFooterList, StudentNavList } from './student-nav-list';
import { activeStudentNav } from './student-nav-items';

/**
 * The shell's top bar: the mobile navigation trigger, the current page's name,
 * the theme control, and the account menu.
 *
 * The title is resolved through `activeStudentNav` — the same function the
 * rail uses to decide what is highlighted — rather than from a per-page prop.
 * A page that adds itself to `STUDENT_NAV` gets a rail entry AND a title with
 * no second edit, and the two can never disagree about what "here" is.
 *
 * `notifications` and `accountMenu` arrive as pre-rendered Server Component
 * nodes from the layout, each inside its own `<Suspense>`, so neither the
 * shell nor this component ever awaits anything.
 *
 * `backdrop-blur` is deliberate and rare: this and the admin header are the
 * only elements in the product allowed to use it (spec §4.7). Every other
 * surface is flat.
 */
export function StudentTopbar({
  courses,
  notifications,
  accountMenu,
}: {
  courses: ReactNode;
  notifications: ReactNode;
  accountMenu: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = activeStudentNav(pathname);

  /*
    Close the drawer when the route changes — watching the pathname, NOT by
    adding another `onClick` somewhere.

    Every hand-written link inside the sheet already closes it: `StudentNavList`
    and `StudentNavFooterList` both take an `onNavigate`, and «الموقع الرئيسي»
    calls `setOpen(false)` itself. The one that cannot is `{courses}` — the same
    pre-rendered `RailCourses` Server Component node the rail draws, whose rows
    are plain `<Link>`s, because a Server Component cannot carry that closure.
    And that list is the most-tapped thing in the drawer: the student taps
    «الكورس التأسيسي», the route changes underneath, and the panel plus its
    full-screen black overlay stay exactly where they were. It reads as a frozen
    app until they find the X or tap the backdrop and discover they had already
    arrived.

    This bar lives in the `(app)` layout and is never remounted on navigation,
    so the pathname is the single signal that sees EVERY route change, whatever
    caused it — a course row, a nav link, the back button, a redirect from a
    Server Action. Per-link handlers are the version that drifts the next time
    someone adds a link.

    ⚠️ Adjusted DURING RENDER against the previous pathname, not in a
    `useEffect`. The obvious `useEffect(() => setOpen(false), [pathname])` is a
    lint error under React 19's compiler rules — `react-hooks/set-state-in-effect`,
    "calling setState synchronously within an effect triggers cascading
    renders" — and this is the case React documents the render-time form for: a
    piece of state that has to be reset when something above it changes. React
    re-runs this component immediately with the new state and never commits the
    intermediate output, so the drawer is already closed on the destination's
    first paint rather than one frame after it.
  */
  const [drawerPath, setDrawerPath] = useState(pathname);
  if (drawerPath !== pathname) {
    setDrawerPath(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklch,var(--n-1),transparent_20%)] backdrop-blur-[var(--header-blur)]">
      <div className="flex h-[var(--topbar-h)] items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={copy.nav.openMenu}
                // 44px on a phone, which is the size a thumb actually hits.
                // It measured 36×36 — under every touch-target guideline there
                // is, on the control that opens ALL navigation.
                className="flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg md:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent closeLabel={copy.common.close} className="md:hidden">
              <SheetTitle className="mb-5 block">
                <BrandLockup showTagline={false} />
              </SheetTitle>

              <nav aria-label={copy.nav.mainNav}>
                <StudentNavList onNavigate={() => setOpen(false)} />
              </nav>

              <div className="mt-5">
                <p className="eyebrow px-3 pb-2 text-fg-muted">{copy.nav.railCourses}</p>
                {/*
                  The same Server Component node the rail renders. React renders
                  the element in both places; `getDashboard` is `cache()`-wrapped
                  so the two cost one round-trip, not two.

                  ⚠️ The `rail__label` class it carries is scoped to the rail's
                  collapsed state via `html[data-rail]`, which also matches
                  here. That is intentional and harmless: a collapsed rail on a
                  desktop viewport and this sheet are never on screen together
                  (`md:hidden`), so nothing can hide the sheet's own list.
                */}
                {courses}
              </div>

              <div className="mt-5 border-t border-line pt-4">
                <StudentNavFooterList onNavigate={() => setOpen(false)} />
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="flex h-10 items-center gap-3 rounded-md px-3 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
                >
                  <ArrowUpLeft className="size-4 shrink-0" aria-hidden="true" />
                  {copy.nav.backToSite}
                </Link>
              </div>
            </SheetContent>
          </Sheet>

          {/* The brand appears here only below `md`, where there is no rail to
              carry it. Duplicating it beside the rail on desktop would state
              the product name twice within 250px.

              `compact` — the PORTRAIT only. With the wordmark, this row did not
              fit a 360px phone: measured on a Galaxy S9+ against production,
              «أيمن أبو العلا» rendered on top of the theme switch. Dropping the
              words is what makes the row fit at all. It does NOT buy room for a
              page title — see the `<h2>` below, which was tried and measured at
              eight pixels. */}
          <Link href="/dashboard" className="shrink-0 md:hidden" aria-label={copy.nav.dashboard}>
            <BrandLockup showTagline={false} compact />
          </Link>

          {/*
            `md` and up ONLY — reverted, and the measurement is why.

            I showed this at every width in the previous change, reasoning that a
            phone had nothing telling the student where they were. Measured on
            production at 360px, it got EIGHT pixels: the bar already carries a
            menu button, the portrait, the bell, the theme switch and the account
            control, and the title is the only flexible thing in the row. «بروفايلي»
            rendered as 8px of 44px — not a short title, a blank space.

            There is no width to win here, and none is needed: every route under
            this shell opens with its own `<h1>` — «الكورسات», «مسارك التعليمي»,
            «جرّب الكود» — directly below the bar. A truncated duplicate helps
            nobody, and on a phone it was not even a duplicate, it was nothing.
          */}
          <h2 className="hidden truncate text-[length:var(--fs-text-sm)] font-medium text-fg md:block">
            {current?.labelAr ?? copy.nav.dashboard}
          </h2>
        </div>

        {/* `topbar__actions` gives every control in here a 44px minimum below
            `md` — see `globals.css`. The bell, the theme switch and the account
            button all measured 36px tall on a phone. */}
        <div className="topbar__actions flex shrink-0 items-center gap-2">
          {/* Slice 4 filled this slot. Slice 1 deliberately left it empty
              rather than shipping a bell that opened onto nothing. */}
          {notifications}
          <ThemeToggle />
          {accountMenu}
        </div>
      </div>
    </header>
  );
}
