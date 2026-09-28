import Link from 'next/link';
import { Hourglass, PiggyBank } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminWalletSchema } from '@ayman/contracts/admin/wallet';
import { adminGetOrForbidden } from '@/lib/admin-api';
import { formatEGPExact } from '@/lib/price';
import { WalletStatementTable } from '@/components/admin/wallet/wallet-statement-table';

const c = copy.admin.wallet;

/**
 * «المحفظة» on a student's page — the balance and the latest movements, with
 * the way to the wallet page where the credit and debit forms are.
 *
 * `OrForbidden` for the same reason as the payments panel above it: the route
 * is `payment:read`, and this page is opened by roles that do not hold it.
 */
export async function WalletSection({ userId }: { userId: string }) {
  const wallet = await adminGetOrForbidden(`/api/admin/wallets/${encodeURIComponent(userId)}`, AdminWalletSchema);
  if (wallet === null) return null;

  return (
    <section className="panel p-4 sm:p-5">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="money-tile__well"
            style={{ '--tile-hue': 'var(--viz-6)' } as React.CSSProperties}
            aria-hidden="true"
          >
            <PiggyBank className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.sectionTitle}</h2>
            <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-muted">{c.sectionLead}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-[length:var(--fs-title-3)] font-bold tabular-nums text-fg">
            {formatEGPExact(wallet.balanceCents)} ج
          </span>
          <Link
            href={`/admin/wallet/${encodeURIComponent(userId)}`}
            className="rounded-full bg-[color:var(--viz-6)] px-3 py-1 text-[length:var(--fs-text-xs)] font-semibold text-[color:var(--n-1)]"
          >
            {c.sectionOpen}
          </Link>
        </div>
      </header>
      {wallet.pendingTopupCents > 0 ? (
        <p className="mb-2 inline-flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
          <Hourglass className="size-3.5" aria-hidden="true" />
          {formatCopy(c.pendingNote, { amount: `${formatEGPExact(wallet.pendingTopupCents)} ج` })}
        </p>
      ) : null}
      <WalletStatementTable rows={wallet.transactions} limit={5} />
    </section>
  );
}
