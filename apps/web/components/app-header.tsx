'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { cn, Sheet, SheetContent, SheetTitle, SheetTrigger } from '@ayman/ui';
import { BrandLockup } from '@/components/brand-lockup';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';

const LINKS = [
  { href: '/dashboard', label: copy.nav.dashboard },
  { href: '/path', label: copy.nav.path },
  { href: '/courses', label: copy.nav.courses },
  { href: '/essentials', label: copy.nav.essentials },
  { href: '/settings/devices', label: copy.nav.devices },
] as const;

/**
 * The signed-in shell's header.
 *
 * Before this, `(app)/layout.tsx` was a bare passthrough: a student who
 * finished onboarding landed on /dashboard with no logo, no navigation, no
 * theme control and no way to sign out. The only routes out were whatever
 * links a given page happened to render.
 *
 * ## Why it hides itself during an attempt
 *
 * `/quizzes/:lessonId/attempt/:attemptId` is a timed, graded exam. A nav bar
 * across the top of it is one mis-click away from navigating out of a running
 * attempt, and the runner already owns that whole viewport — its own timer,
 * question navigator and submit control are the only chrome that belongs
 * there. The review screen underneath it (`.../review`) is NOT an attempt and
 * keeps the header.
 */
function isAttemptRoute(pathname: string): boolean {
  return /^\/quizzes\/[^/]+\/attempt\/[^/]+$/.test(pathname);
}

/**
 * `adminLink`/`adminLinkMobile` arrive as pre-rendered Server Component nodes
 * from the layout rather than as an `isAdmin` boolean. A boolean would mean
 * this client component's parent had to `await getSession()` before it could
 * render at all — see `components/admin-link.tsx` for why that was a real
 * problem and not a style preference.
 */
export function AppHeader({
  adminLink,
  adminLinkMobile,
}: {
  adminLink?: ReactNode;
  adminLinkMobile?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (isAttemptRoute(pathname)) return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_oklch,var(--n-1),transparent_20%)] backdrop-blur-[var(--header-blur)]">
      <div className="mx-auto flex h-14 max-w-[var(--w-shell)] items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="shrink-0 rounded-md" aria-label={copy.site.name}>
            <BrandLockup showTagline={false} />
          </Link>

          <nav aria-label={copy.nav.home} className="hidden md:block">
            <ul className="flex items-center gap-1">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isActive(link.href) ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-[length:var(--fs-text-sm)]',
                      'transition-colors duration-[160ms] ease-out',
                      isActive(link.href)
                        ? 'bg-surface-3 font-medium text-fg'
                        : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {adminLink}

          <ThemeToggle />

          <div className="hidden md:block">
            <SignOutButton className="w-auto border border-line" />
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={copy.nav.openMenu}
                className="flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-[160ms] hover:bg-surface-3 hover:text-fg md:hidden"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            <SheetContent closeLabel={copy.admin.common.close} className="md:hidden">
              <SheetTitle className="mb-5 block">
                <BrandLockup showTagline={false} />
              </SheetTitle>
              <nav aria-label={copy.nav.accountMenu}>
                <ul className="flex flex-col gap-0.5">
                  {LINKS.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive(link.href) ? 'page' : undefined}
                        className={cn(
                          'block rounded-md px-3 py-2 text-[length:var(--fs-text-sm)]',
                          isActive(link.href)
                            ? 'bg-surface-3 font-medium text-fg'
                            : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                        )}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                  {adminLinkMobile ? <li>{adminLinkMobile}</li> : null}
                </ul>
              </nav>
              <div className="mt-4 border-t border-line pt-4">
                <SignOutButton />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
