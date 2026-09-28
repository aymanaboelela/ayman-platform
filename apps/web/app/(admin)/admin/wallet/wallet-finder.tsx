'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, Search, Wallet } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import type { AdminWalletSearchRow } from '@ayman/contracts/admin/wallet';
import { cn } from '@ayman/ui/lib/cn';
import { formatEGPExact } from '@/lib/price';
import { searchWalletsAction } from './actions';

const c = copy.admin.wallet;

const DATE = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Africa/Cairo',
});

/** First letter of the name for the avatar well — the list is scanned by face. */
function initialOf(name: string): string {
  return name.trim().charAt(0) || '؟';
}

/**
 * The search box and the list under it.
 *
 * Debounced (250 ms, two characters) and sequence-guarded: a slow answer for
 * «مح» must not land over a fast one for «محمد» — the same shape as the honor
 * board's student picker. An empty box goes back to the recent wallets the
 * page rendered with.
 */
export function WalletFinder({ initial }: { initial: readonly AdminWalletSearchRow[] }) {
  const [q, setQ] = useState('');
  // The answer AND the query it answers — so a slow reply for «مح» is simply
  // not the answer for «محمد», and nothing has to be reset from an effect.
  const [results, setResults] = useState<{ q: string; rows: readonly AdminWalletSearchRow[] } | null>(null);
  const seq = useRef(0);
  const query = q.trim();

  useEffect(() => {
    if (query.length < 2) return;
    const mine = ++seq.current;
    const timer = window.setTimeout(() => {
      void searchWalletsAction(query).then((result) => {
        if (mine !== seq.current || !result) return;
        setResults({ q: query, rows: result.rows });
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const answered = results !== null && results.q === query;
  const rows = query.length < 2 ? initial : answered ? results.rows : (results?.rows ?? initial);
  const loading = query.length >= 2 && !answered;

  const searching = query.length >= 2;

  return (
    <section className="mt-6" aria-labelledby="wallet-finder-title">
      <label className="block max-w-2xl">
        <span id="wallet-finder-title" className="mb-1.5 block text-[length:var(--fs-text-sm)] font-medium text-fg">
          {c.searchLabel}
        </span>
        <span className="relative block">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-[color:var(--viz-6)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={c.searchPlaceholder}
            autoComplete="off"
            className={cn(
              'h-12 w-full rounded-lg border-2 border-[color-mix(in_oklab,var(--viz-6)_35%,var(--border))] bg-surface-1 ps-11 pe-10',
              'text-[1rem] text-fg md:text-[length:var(--fs-text-base)]',
              'transition-colors duration-[160ms] ease-out focus:border-[color:var(--viz-6)] focus:outline-none',
            )}
          />
          {loading ? (
            <Loader2
              className="absolute end-3 top-1/2 size-5 -translate-y-1/2 animate-spin text-fg-muted"
              aria-label={c.searching}
            />
          ) : null}
        </span>
      </label>

      <h2 className="mt-5 text-[length:var(--fs-text-base)] font-semibold text-fg">
        {searching ? c.resultsTitle : c.recentTitle}
      </h2>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-center text-fg-muted">
          {searching ? c.noResults : c.emptyRecent}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2.5 md:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/wallet/${encodeURIComponent(row.id)}`}
                className="group flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3.5 transition-colors duration-[160ms] hover:border-[color:var(--viz-6)] hover:bg-[color-mix(in_oklab,var(--viz-6)_6%,var(--n-2))]"
              >
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--viz-6)_18%,var(--n-2))] text-[length:var(--fs-text-lg)] font-bold text-[color:var(--viz-6)]"
                >
                  {initialOf(row.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-fg">{row.name}</span>
                  <span className="block truncate text-[length:var(--fs-text-xs)] text-fg-muted" dir="ltr">
                    {row.phone ?? row.email ?? ''}
                  </span>
                  <span className="block text-[length:var(--fs-text-xs)] text-fg-faint">
                    {row.lastMovedAt
                      ? formatCopy(c.lastMoved, { date: DATE.format(new Date(row.lastMovedAt)) })
                      : c.neverMoved}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--viz-6)_14%,var(--n-2))] px-2.5 py-1 text-[length:var(--fs-text-sm)] font-bold tabular-nums text-fg">
                    <Wallet className="size-3.5 text-[color:var(--viz-6)]" aria-hidden="true" />
                    {formatEGPExact(row.balanceCents)} ج
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[length:var(--fs-text-xs)] font-medium text-accent-text">
                    {c.open}
                    <ChevronLeft className="size-3.5" aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
