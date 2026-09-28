import { Hourglass, Sparkles, Wallet } from 'lucide-react';
import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import { MyWalletSchema, type MyWallet } from '@ayman/contracts/wallet';
import { WalletArt } from '@/components/wallet/wallet-art';
import { WalletRequests, WalletStatement } from '@/components/wallet/wallet-statement';
import { WalletTopup } from '@/components/wallet/wallet-topup';
import { apiGetAuthed } from '@/lib/api-server';
import { formatEGPExact } from '@/lib/price';
import { getPublicSettingsOrDefaults } from '@/lib/settings';
import '@/components/unlock-codes/unlock-codes.css';
import '@/components/wallet/wallet.css';

const c = copy.wallet;

export const metadata = { title: c.pageTitle };

const EMPTY: MyWallet = { balanceCents: 0, pendingTopupCents: 0, transactions: [], topups: [] };

/** Only a path on this site — `?back=` is a URL anybody can type, and an
 *  absolute one would turn «الرجوع للاشتراك» into a link off the platform. */
function safeBack(value: string | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/**
 * «المحفظة» — the balance, the three ways to fill it, and every movement.
 *
 * The wallet read is LIVE and per-student (`apiGetAuthed`, never cached):
 * this is the page a student opens right after a top-up was approved, and a
 * cached balance would say the money never arrived. It fails QUIETLY into an
 * empty wallet so the top-up form — the reason most people are here — is
 * always usable.
 *
 * `?amount=` (piastres) and `?back=` come from the checkout's «شحن المحفظة
 * بالفرق»: the form opens on a transfer rail with the missing amount already
 * typed, and the success screen offers the way back to the subscription.
 */
export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string; back?: string }>;
}) {
  const [wallet, { contact }, params] = await Promise.all([
    apiGetAuthed('/api/wallet', MyWalletSchema).catch((): MyWallet => EMPTY),
    getPublicSettingsOrDefaults(),
    searchParams,
  ]);

  const asked = Number(params.amount);
  const initialAmountCents = Number.isInteger(asked) && asked > 0 && asked <= 5_000_000 ? asked : null;

  return (
    <main className="mx-auto w-full max-w-[var(--w-app)] px-4 py-6 md:px-6 md:py-10">
      <section className="wl-hero" aria-labelledby="wl-balance-label">
        <div>
          <span className="wl-hero__pill">
            <Sparkles className="size-4" aria-hidden="true" />
            {c.eyebrow}
          </span>
          <p id="wl-balance-label" className="wl-hero__label">
            {c.balanceLabel}
          </p>
          <p className="wl-hero__balance">
            <span className="wl-hero__amount">{formatEGPExact(wallet.balanceCents)}</span>
            <span className="wl-hero__currency">{c.currency}</span>
          </p>
          {wallet.pendingTopupCents > 0 ? (
            <p className="wl-hero__pending">
              <Hourglass className="size-4" aria-hidden="true" />
              {formatCopy(c.pending, { amount: formatEGPExact(wallet.pendingTopupCents) })}
            </p>
          ) : null}
          <p className="wl-hero__lead">{c.heroLead}</p>
        </div>
        <WalletArt className="wl-hero__art" />
      </section>

      <div className="wl-lift relative mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <section className="wl-card" aria-labelledby="wl-topup-title">
          <div className="wl-card__head">
            <span className="wl-card__icon" aria-hidden="true">
              <Wallet className="size-6" />
            </span>
            <div className="min-w-0">
              <h2 id="wl-topup-title" className="wl-card__title">
                {c.topupTitle}
              </h2>
              <p className="wl-card__lead">{c.topupLead}</p>
            </div>
          </div>
          <WalletTopup
            instapay={contact.instapay ?? null}
            vodafone={contact.vodafoneCash ?? null}
            initialAmountCents={initialAmountCents}
            backHref={safeBack(params.back)}
          />
        </section>

        <aside className="grid gap-4">
          <WalletRequests topups={wallet.topups} />
        </aside>
      </div>

      <WalletStatement transactions={wallet.transactions} />
    </main>
  );
}
