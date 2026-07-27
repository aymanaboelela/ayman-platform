'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { copy } from '@ayman/contracts';
import { cn } from '@ayman/ui';
import { ADMIN_NAV } from './nav-items';

/**
 * RTL-native: the sidebar sits at the inline start and its divider is
 * `border-e`. There is no `left`/`right` anywhere — in an RTL document the
 * inline start IS the right-hand edge, and expressing it logically means the
 * same file works unchanged if an English locale ever ships.
 */
export function AppSidebar({ permissions }: { permissions: readonly string[] }) {
  const pathname = usePathname();
  const visible = ADMIN_NAV.filter((item) => permissions.includes(item.permission));

  return (
    <aside className="hidden border-e border-line bg-surface-2 md:block">
      <div className="sticky top-0 flex h-dvh flex-col gap-16 p-16">
        <p className="eyebrow font-mono text-fg-muted">{copy.admin.title}</p>

        <nav aria-label={copy.admin.title}>
          <ul className="flex flex-col gap-2">
            {visible.map((item) => {
              const active =
                item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-8 rounded-[var(--r-sm)] px-12 py-8',
                      'text-[length:var(--fs-text-sm)] transition-colors duration-[160ms]',
                      active
                        ? 'bg-surface-4 text-fg'
                        : 'text-fg-muted hover:bg-surface-3 hover:text-fg',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.labelAr}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
