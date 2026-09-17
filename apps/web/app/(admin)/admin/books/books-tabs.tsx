import Link from 'next/link';
import { copy } from '@ayman/contracts/copy/admin';
import { cn } from '@ayman/ui';

const c = copy.admin.books;

const TABS = [
  { href: '/admin/books', label: c.tabOrders },
  { href: '/admin/books/catalog', label: c.tabCatalog },
] as const;

/**
 * The two halves of «الكتب»: the shipping queue and the shelf.
 *
 * Two ROUTES rather than two panels on one, because they are opened for
 * different reasons and at different rates — the queue daily, the catalogue
 * when a price or a title changes — and because a `?status=` filter and a
 * catalogue editor sharing one URL would make the browser's back button mean
 * two different things on one screen.
 *
 * A Server Component: `pathname` is not needed, the caller knows which tab it
 * is, and shipping a client component for two links would be the whole
 * `usePathname` runtime for a highlight.
 */
export function BooksTabs({ active }: { active: '/admin/books' | '/admin/books/catalog' }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-1.5" aria-label={c.title}>
      {TABS.map((tab) => (
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
