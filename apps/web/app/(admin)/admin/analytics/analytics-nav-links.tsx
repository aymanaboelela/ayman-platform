'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@ayman/ui/lib/cn';
import { copy } from '@ayman/contracts/copy/admin';

const c = copy.analytics;

const TABS = [
  { href: '/admin/analytics', label: c.navOverview, exact: true, money: false },
  { href: '/admin/analytics/lessons', label: c.navLessons, exact: false, money: false },
  { href: '/admin/analytics/students', label: c.navStudents, exact: false, money: false },
  // Money, so its own permission — see `AnalyticsNav`, which decides.
  { href: '/admin/analytics/money', label: c.navMoney, exact: false, money: true },
] as const;

/** Three screens, one subject — four for a reader allowed to see the money. A
 *  sub-nav rather than sidebar entries: they share a filter vocabulary and a
 *  reader moves between them constantly, which is exactly the case tabs are
 *  for. */
export function AnalyticsNavLinks({ showMoney }: { showMoney: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => showMoney || !tab.money);
  const navRef = useRef<HTMLElement>(null);

  // On a phone the fourth tab is past the edge, and landing on it with its
  // label cut in half reads as broken. Bring the current tab into the strip —
  // `nearest` on both axes, so a tab already in view moves nothing and the
  // page itself never scrolls.
  useEffect(() => {
    navRef.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);

  return (
    // `overflow-x-auto`: four tabs are wider than a 360px phone, and a nav
    // that wraps puts the active underline on a second row nobody reads.
    <nav
      ref={navRef}
      className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      aria-label={c.title}
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative shrink-0 whitespace-nowrap px-3 py-2 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
              active ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg',
              // The underline is drawn as a pseudo-free absolute bar so the
              // tab does not shift by a pixel when it becomes current.
              active &&
                'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
