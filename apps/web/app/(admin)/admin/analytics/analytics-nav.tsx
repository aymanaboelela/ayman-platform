'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@ayman/ui/lib/cn';
import { copy } from '@ayman/contracts/copy/admin';

const c = copy.analytics;

const TABS = [
  { href: '/admin/analytics', label: c.navOverview, exact: true },
  { href: '/admin/analytics/lessons', label: c.navLessons, exact: false },
  { href: '/admin/analytics/students', label: c.navStudents, exact: false },
] as const;

/** Three screens, one subject. A sub-nav rather than three sidebar entries:
 *  they share a filter vocabulary and a reader moves between them constantly,
 *  which is exactly the case tabs are for. */
export function AnalyticsNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-1 border-b border-line" aria-label={c.title}>
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative px-3 py-2 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
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
