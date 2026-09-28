'use client';

import Link from 'next/link';
import { CircleCheck, Loader2, Plus, Wallet } from 'lucide-react';
// Subpaths, never the root barrel — see `lib/client-barrel.test.ts`.
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { formatEGP, formatEGPExact } from '@/lib/price';

const c = copy.subscribe;

/**
 * «الدفع من المحفظة» — the question the checkout asks first when the wallet
 * has money: this, or a transfer as usual.
 *
 * It says the one thing that decides it — does the balance cover THIS price —
 * with a meter a glance can read, and offers exactly one action for each
 * answer: pay now (covers), or top up the difference (does not). Never a
 * partial payment: a subscription is paid by one method, and «نص من المحفظة
 * ونص تحويل» would be two claims for one seat.
 *
 * `priceCents` is the amount the panel already shows above — the live price,
 * read at the moment the panel opened. The server charges its OWN live price;
 * a stale one here can only make the button disagree with a refusal, which
 * the panel then explains.
 */
export function WalletPayCard({
  balanceCents,
  priceCents,
  paying,
  onPay,
  topupHref,
}: {
  balanceCents: number;
  priceCents: number;
  paying: boolean;
  onPay: () => void;
  topupHref: string;
}) {
  const covers = balanceCents >= priceCents;
  const missing = Math.max(0, priceCents - balanceCents);
  const filled = priceCents > 0 ? Math.min(100, Math.round((balanceCents / priceCents) * 100)) : 100;

  return (
    <section className="wl-pay" aria-labelledby="wl-pay-title">
      <div className="wl-pay__head">
        <span className="wl-pay__icon" aria-hidden="true">
          <Wallet className="size-5" />
        </span>
        <div className="min-w-0">
          <p id="wl-pay-title" className="wl-pay__title">
            {c.walletTitle}
          </p>
          <p className="wl-pay__balance">{formatCopy(c.walletBalance, { balance: formatEGPExact(balanceCents) })}</p>
        </div>
      </div>

      <div
        className="wl-pay__meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={filled}
        aria-label={c.walletTitle}
      >
        <span style={{ inlineSize: `${filled}%` }} />
      </div>

      {covers ? (
        <>
          <p className="wl-pay__verdict">
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {c.walletCovers}
          </p>
          <button type="button" className="wl-btn wl-btn--wallet wl-btn--block" onClick={onPay} disabled={paying}>
            {paying ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Wallet className="size-5" aria-hidden="true" />}
            {paying ? c.walletPaying : formatCopy(c.walletPay, { price: formatEGP(priceCents) })}
          </button>
        </>
      ) : (
        <>
          <p className="wl-pay__verdict wl-pay__verdict--short">
            {formatCopy(c.walletShort, { missing: formatEGPExact(missing) })}
          </p>
          <Link href={topupHref} className="wl-btn wl-btn--primary wl-btn--block">
            <Plus className="size-5" aria-hidden="true" />
            {c.walletTopup}
          </Link>
        </>
      )}

      <p className="wl-pay__or">{c.walletOr}</p>
    </section>
  );
}
