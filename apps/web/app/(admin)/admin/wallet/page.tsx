import Link from 'next/link';
import { BanknoteArrowUp } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminWalletSearchSchema } from '@ayman/contracts/admin/wallet';
import { adminGet } from '@/lib/admin-api';
import { formatEGPExact } from '@/lib/price';
import { StatTile } from '@/components/admin/charts/stat-tile';
import { WalletFinder } from './wallet-finder';

const c = copy.admin.wallet;

export const metadata = { title: c.title };

const egp = (cents: number) => `${formatEGPExact(cents)} ج`;

/**
 * `/admin/wallet` — «شحن المحفظة».
 *
 * Search first: the admin arrives with a name or a number in hand («فلان دفع
 * كاش في السنتر»). The list under the box is the wallets that moved most
 * recently until he types, because the student someone just called about is
 * almost always one of them. Opening a row goes to that student's wallet,
 * where the credit and debit forms are.
 *
 * Uncached like every admin read — a balance a minute old is a wrong one.
 */
export default async function AdminWalletPage() {
  const initial = await adminGet('/api/admin/wallets', AdminWalletSearchSchema);

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">{c.eyebrow}</p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 max-w-[46rem] text-[length:var(--fs-text-sm)] text-fg-muted">{c.lead}</p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          label={c.tileHeld}
          value={egp(initial.totals.balanceCents)}
          context={formatCopy(c.tileHeldContext, { n: initial.totals.walletCount })}
          tint="var(--viz-6)"
          accent
        />
        <StatTile
          label={c.tilePending}
          value={String(initial.totals.pendingCount)}
          context={formatCopy(c.tilePendingContext, { amount: egp(initial.totals.pendingCents) })}
          tint="var(--viz-1)"
          href="/admin/wallet/requests"
        />
      </div>

      <WalletFinder initial={initial.rows} />

      <p className="mt-6 text-[length:var(--fs-text-sm)]">
        <Link href="/admin/wallet/requests" className="inline-flex items-center gap-1.5 text-accent-text underline">
          <BanknoteArrowUp className="size-4" aria-hidden="true" />
          {c.requestsLink}
        </Link>
      </p>
    </>
  );
}
