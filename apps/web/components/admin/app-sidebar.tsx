import Link from 'next/link';
import { ArrowUpLeft } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { BrandLockup } from '@/components/brand-lockup';
import { AdminNavList } from './admin-nav-list';

/**
 * RTL-native: the sidebar sits at the inline start and its divider is
 * `border-e`. There is no `left`/`right` anywhere — in an RTL document the
 * inline start IS the right-hand edge, and expressing it logically means the
 * same file works unchanged if an English locale ever ships.
 *
 * A Server Component again. It used to be `'use client'` only to read
 * `usePathname()` for the active link; that moved into `AdminNavList`, which
 * the mobile sheet shares, so the shell itself ships no JS.
 *
 * ⚠️ The padding here is 16px (`p-4`), not `p-16`. Tailwind's spacing scale is
 * a 0.25rem multiplier, so the `p-16 / gap-8 / px-12` that the admin was
 * written in resolved to 64px / 32px / 48px — four times the intended values.
 * In a 260px column that left the link labels with zero width to lay out in,
 * which is why the sidebar rendered as a strip of unlabelled icons.
 */
export function AppSidebar({ permissions }: { permissions: readonly string[] }) {
  return (
    <aside className="hidden border-e border-line bg-surface-2 md:block">
      <div className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto p-4">
        {/* No tagline in a 260px column — it wraps to three lines and pushes
            the nav down. The auth screen has the room and keeps it. */}
        <Link href="/admin" className="rounded-md px-1" aria-label={copy.admin.title}>
          <BrandLockup showTagline={false} />
        </Link>

        <nav aria-label={copy.admin.title} className="flex-1">
          <AdminNavList permissions={permissions} />
        </nav>

        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-3 hover:text-fg"
        >
          <ArrowUpLeft className="size-4 shrink-0" aria-hidden="true" />
          {copy.nav.home}
        </Link>
      </div>
    </aside>
  );
}
