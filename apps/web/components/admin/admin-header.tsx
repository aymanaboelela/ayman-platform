'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Kbd } from '@ayman/ui/components/kbd';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@ayman/ui/components/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { BrandLockup } from '@/components/brand-lockup';
import { SignOutButton } from '@/components/sign-out-button';
import { AdminNavList } from './admin-nav-list';
import { CommandPalette } from './command-palette';
import { InboxAlertsToggle } from './inbox-alerts';
import { activeNavItem } from './nav-items';

/**
 * Sticky header: mobile nav trigger, a breadcrumb derived from `ADMIN_NAV` +
 * the current path, the command palette trigger (also reachable via the
 * global `⌘K` shortcut, wired through `CommandPalette`/`useGlobalShortcuts`),
 * the theme toggle, and the signed-in email. `bg-surface-1/80` +
 * `backdrop-blur` is the ONE element in the product allowed to use
 * `backdrop-blur` (spec §4.7) — every other surface is flat.
 *
 * The theme toggle is new here and is not decoration: the marketing surface
 * has had one in its nav since the rebuild, so an admin who switched to light
 * on the landing page had no way to switch back from inside /admin.
 *
 * Spacing note — see `app-sidebar.tsx`. `px-4`/`gap-2` are 16px/8px; the
 * `px-16`/`gap-8` this file used to carry were 64px/32px.
 */
export function AdminHeader({ email, permissions }: { email: string; permissions: readonly string[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const current = activeNavItem(pathname);

  return (
    // `h-[var(--admin-header-h)]` rather than the `py-3` that produced the same
    // 60px: the selection bar on the list screens sticks directly below this
    // and reads that same token as its `top`. A height derived from padding is
    // one nobody else can reference without guessing.
    <header className="sticky top-0 z-40 flex h-[var(--admin-header-h)] items-center justify-between gap-3 border-b border-line bg-[color-mix(in_oklch,var(--n-1),transparent_20%)] px-4 backdrop-blur-[var(--header-blur)] md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label={copy.admin.openMenu}
              className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent closeLabel={copy.admin.common.close} className="md:hidden">
            <SheetTitle className="mb-5 block">
              <BrandLockup showTagline={false} />
            </SheetTitle>
            <nav aria-label={copy.admin.title}>
              <AdminNavList permissions={permissions} onNavigate={() => setMobileOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>

        <nav aria-label={copy.admin.title} className="min-w-0">
          <ol className="flex min-w-0 items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            <li className="truncate">
              <Link href="/admin" className="transition-colors hover:text-fg">
                {copy.admin.title}
              </Link>
            </li>
            {current && pathname !== '/admin' ? (
              <>
                <li aria-hidden="true" className="text-fg-muted/60">
                  /
                </li>
                <li className="truncate font-medium text-fg" aria-current="page">
                  {current.labelAr}
                </li>
              </>
            ) : null}
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg sm:flex"
        >
          <span>{copy.admin.commandPalette.trigger}</span>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>

        {/* Only for a session that HAS an inbox — the control asks the browser
            for permission to announce messages this admin cannot read. */}
        {permissions.includes('conversation:read') ? <InboxAlertsToggle /> : null}

        <ThemeToggle />

        <span className="hidden max-w-[14rem] truncate text-[length:var(--fs-text-sm)] text-fg-muted lg:inline">
          {copy.admin.signedInAs} {email}
        </span>

        <SignOutButton className="w-auto border border-line" />
      </div>

      <CommandPalette permissions={permissions} open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
}
