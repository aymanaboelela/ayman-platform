import Link from 'next/link';
import { ArrowRight, Hourglass, TrendingUp, UserRound, Wallet } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { AdminWalletSchema } from '@ayman/contracts/admin/wallet';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { can, getSession } from '@/lib/session';
import { formatEGPExact } from '@/lib/price';
import { WalletStatementTable } from '@/components/admin/wallet/wallet-statement-table';
import { WalletAdjust } from './wallet-adjust';

const c = copy.admin.wallet;

export const metadata = { title: c.title };

const egp = (cents: number) => `${formatEGPExact(cents)} ج`;

/**
 * `/admin/wallet/:userId` — one student's wallet: the balance, «اشحن» and
 * «خصم», and every movement with who made it and whether it was income.
 *
 * The forms render only for `payment:review` — the permission the API's two
 * writes carry. A role with `payment:read` alone sees the wallet and no form
 * that would 403 on its only button.
 */
export default async function AdminStudentWalletPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const [session, wallet] = await Promise.all([
    getSession(),
    adminGetOrNotFound(`/api/admin/wallets/${encodeURIComponent(userId)}`, AdminWalletSchema),
  ]);
  const canWrite = can(session, 'payment:review');

  return (
    <>
      <Link
        href="/admin/wallet"
        className="inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.back}
      </Link>

      {/* The balance band — the one number this page is about, in the wallet's
          own colours, with the student it belongs to. */}
      <section
        className="mt-3 overflow-hidden rounded-xl p-5 text-[color:var(--n-1)] shadow-[var(--shadow-md)] sm:p-6"
        style={{
          background:
            'radial-gradient(110% 90% at 100% 0%, color-mix(in oklab, var(--viz-6) 55%, transparent) 0%, transparent 60%), linear-gradient(135deg, var(--viz-2) 0%, var(--viz-5) 100%)',
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] font-semibold opacity-90">
              <UserRound className="size-4" aria-hidden="true" />
              {wallet.student.name}
            </p>
            <p className="mt-0.5 text-[length:var(--fs-text-xs)] opacity-80" dir="ltr">
              {wallet.student.phone ?? wallet.student.email ?? ''}
            </p>
            <p className="mt-4 text-[length:var(--fs-text-sm)] opacity-90">{c.balanceLabel}</p>
            <p className="mt-0.5 flex items-baseline gap-2">
              <span className="text-[2.5rem] font-bold leading-none tabular-nums [direction:ltr] [unicode-bidi:isolate]">
                {formatEGPExact(wallet.balanceCents)}
              </span>
              <span className="text-[length:var(--fs-title-3)] font-semibold opacity-90">ج</span>
            </p>
          </div>
          <span className="grid size-14 place-items-center rounded-2xl bg-[rgb(255_255_255/0.18)]" aria-hidden="true">
            <Wallet className="size-7" />
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[length:var(--fs-text-xs)] font-semibold">
          {wallet.pendingTopupCents > 0 ? (
            <Link
              href="/admin/wallet/requests"
              className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--viz-1)_85%,var(--n-12))] px-3 py-1 text-[color:var(--n-12)]"
            >
              <Hourglass className="size-3.5" aria-hidden="true" />
              {formatCopy(c.pendingNote, { amount: egp(wallet.pendingTopupCents) })}
            </Link>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(255_255_255/0.18)] px-3 py-1">
            <TrendingUp className="size-3.5" aria-hidden="true" />
            {formatCopy(c.incomeNote, { amount: egp(wallet.incomeCents) })}
          </span>
          <Link
            href={`/admin/students/${encodeURIComponent(wallet.student.id)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-[rgb(255_255_255/0.18)] px-3 py-1 underline-offset-2 hover:underline"
          >
            {c.studentPage}
          </Link>
        </div>
      </section>

      {canWrite ? <WalletAdjust userId={wallet.student.id} balanceCents={wallet.balanceCents} /> : null}

      <section className="mt-8" aria-labelledby="wallet-statement-title">
        <h2 id="wallet-statement-title" className="text-[length:var(--fs-title-3)] font-semibold text-fg">
          {c.statementTitle}
        </h2>
        <WalletStatementTable rows={wallet.transactions} />
      </section>
    </>
  );
}
