'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@ayman/ui/lib/cn';

export interface MarketingTab {
  href: string;
  label: string;
}

/**
 * The tab bar itself — a client component only for `usePathname`. Which tabs
 * exist is decided by `MarketingTabs` on the server, from the stack's
 * entitlements.
 */
export function MarketingTabsNav({ tabs }: { tabs: readonly MarketingTab[] }) {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line-subtle">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms]',
              active ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
