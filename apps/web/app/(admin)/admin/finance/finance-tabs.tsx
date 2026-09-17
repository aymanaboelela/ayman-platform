import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui';

const c = copy.admin.finance;

export const FINANCE_TABS = [
  { href: '/admin/finance', label: c.tabOverview },
  { href: '/admin/finance/subscriptions', label: c.tabSubscriptions },
  { href: '/admin/finance/expenses', label: c.tabExpenses },
] as const;

export type FinanceTabHref = (typeof FINANCE_TABS)[number]['href'];

/**
 * The three halves of the accounts.
 *
 * «الاشتراكات والإيرادات» used to be one screen carrying tiles and a subscriber
 * table, which meant the page answering "how is the business doing" and the one
 * answering "what does this student hold until when" were the same URL with the
 * same back button. They are opened for different reasons and at very different
 * rates, so they are three routes — and «النظرة العامة» is the one that opens
 * first, because it is the question asked most.
 *
 * A Server Component: the caller knows which tab it is, and shipping
 * `usePathname` for a highlight would be the whole client runtime for a border
 * colour. Same shape and same reasoning as `BooksTabs`.
 */
export function FinanceTabs({ active }: { active: FinanceTabHref }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-1.5" aria-label={c.title}>
      {FINANCE_TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.href === active ? 'page' : undefined}
          className={cn(
            'rounded-full border px-4 py-1.5 text-[length:var(--fs-text-sm)] font-medium',
            'transition-colors duration-[160ms] ease-out',
            tab.href === active
              ? 'border-accent bg-accent text-[#1A1206]'
              : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
