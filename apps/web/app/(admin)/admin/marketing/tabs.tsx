'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui/lib/cn';

const c = copy.marketing;

const TABS = [
  { href: '/admin/marketing/campaigns', label: c.title },
  { href: '/admin/marketing/device', label: c.deviceTitle },
  { href: '/admin/marketing/opt-outs', label: c.optOutsTitle },
] as const;

/**
 * The three screens behind «التسويق»: campaigns, the device that sends them,
 * and who has opted out of ever receiving one.
 *
 * A client component only for `usePathname` — the tab bar itself renders the
 * same three links on every page under this section, and each page decides
 * its own content.
 */
export function MarketingTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 border-b border-line-subtle">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2 text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms]',
              active
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
