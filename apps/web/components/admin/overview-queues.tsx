'use client';

import Link from 'next/link';
import { Inbox, PackageOpen, Wallet } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { useInboxCount } from './inbox-alerts';
import { usePaymentsPendingCount } from './payments-alerts';
import { useBookOrdersUnshippedCount } from './book-orders-alerts';

const c = copy.admin.overview;

/**
 * «محتاج تصرّف» — the queues with something in them, at the top of `/admin`.
 *
 * The overview opened with three numbers that never change in a day (طلبة,
 * منشور, مسودة) and said nothing at all about the two screens where somebody
 * is actually waiting on a decision. Those counts already exist, live, in the
 * three providers the admin layout mounts for the sidebar badges — so this
 * reads the same contexts rather than fetching anything of its own. One
 * poller, three consumers.
 *
 * It renders NOTHING when every queue is empty, and that is the point: a band
 * that is always on screen showing «٠ / ٠ / ٠» is furniture, and the eye
 * stops reading it. Present means "there is work"; absent means "there is
 * none".
 *
 * `null` (not `0`) is what the hooks answer before the first poll lands and on
 * a session without the permission — neither is a zero, and neither should
 * flash an empty band on first paint.
 */
export function OverviewQueues() {
  const payments = usePaymentsPendingCount();
  const books = useBookOrdersUnshippedCount();
  const inbox = useInboxCount();

  const rows = [
    { href: '/admin/payments', icon: Wallet, count: payments, label: c.statPendingPayments },
    { href: '/admin/books', icon: PackageOpen, count: books, label: c.statUnshippedBooks },
    { href: '/admin/inbox', icon: Inbox, count: inbox, label: c.statUnreadInbox },
  ].filter((row): row is typeof row & { count: number } => row.count !== null && row.count > 0);

  if (rows.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-[length:var(--fs-title-4)] font-medium text-fg">{c.waitingTitle}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Link key={row.href} href={row.href} className="panel stat-tile stat-tile--waiting">
            <span className="stat-tile__well" aria-hidden="true">
              <row.icon className="size-5" />
            </span>
            <span>
              <span className="stat-tile__value block">{row.count}</span>
              <span className="stat-tile__label block">{row.label}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
