'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn, Kbd, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@ayman/ui';
import { ADMIN_NAV } from './nav-items';

/** The active item's Arabic label, for the breadcrumb's trailing crumb. */
function currentLabel(pathname: string): string | null {
  const match = [...ADMIN_NAV]
    .filter((item) => (item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.labelAr ?? null;
}

/**
 * Sticky header: mobile nav trigger, a breadcrumb derived from `ADMIN_NAV` +
 * the current path, the (inert for now — Task 16 wires it up) command
 * palette trigger, and the signed-in email. `bg-surface-1/80` +
 * `backdrop-blur` is the ONE element in the product allowed to use
 * `backdrop-blur` (spec §4.7) — every other surface is flat.
 */
export function AdminHeader({ email, permissions }: { email: string; permissions: readonly string[] }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const label = currentLabel(pathname);
  const visible = ADMIN_NAV.filter((item) => permissions.includes(item.permission));

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-8 border-b border-line bg-[color-mix(in_oklch,var(--n-1),transparent_20%)] px-16 py-12 backdrop-blur-[var(--header-blur)] md:px-24">
      <div className="flex min-w-0 items-center gap-8">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label={copy.admin.openMenu}
              className="flex size-9 items-center justify-center rounded-[var(--r-sm)] text-fg-muted hover:bg-surface-3 hover:text-fg md:hidden"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          </SheetTrigger>
          <SheetContent closeLabel={copy.admin.common.close} className="md:hidden">
            <SheetTitle className="eyebrow font-mono text-fg-muted">{copy.admin.title}</SheetTitle>
            <nav aria-label={copy.admin.title}>
              <ul className="flex flex-col gap-2">
                {visible.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-8 rounded-[var(--r-sm)] px-12 py-8 text-[length:var(--fs-text-sm)] text-fg-muted hover:bg-surface-3 hover:text-fg"
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.labelAr}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </SheetContent>
        </Sheet>

        <nav aria-label={copy.admin.title} className="min-w-0">
          <ol className="flex min-w-0 items-center gap-8 text-[length:var(--fs-text-sm)] text-fg-muted">
            <li className="truncate">
              <Link href="/admin" className="hover:text-fg">
                {copy.admin.title}
              </Link>
            </li>
            {label && pathname !== '/admin' ? (
              <>
                <li aria-hidden="true">/</li>
                <li className={cn('truncate text-fg')} aria-current="page">
                  {label}
                </li>
              </>
            ) : null}
          </ol>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-16">
        <button
          type="button"
          className="hidden items-center gap-8 rounded-[var(--r-sm)] border border-line px-8 py-4 text-[length:var(--fs-text-sm)] text-fg-muted hover:bg-surface-3 sm:flex"
        >
          <span>{copy.admin.commandPalette.trigger}</span>
          <Kbd>⌘K</Kbd>
        </button>
        <span className="hidden truncate text-[length:var(--fs-text-sm)] text-fg-muted sm:inline">
          {copy.admin.signedInAs} {email}
        </span>
      </div>
    </header>
  );
}
