'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';

const c = copy.admin.books;

/**
 * «هتقول انت عايز من يوم كام لـ يوم كام … عشان أعرف أوديه للمطبعة».
 *
 * The export used to be one link for the whole tab, which is the right
 * default and the wrong tool for the actual job: he takes ONE run to the
 * printer and needs the orders from those days, not every order ever placed.
 *
 * ## Why two plain date inputs and not a picker
 *
 * `<input type="date">` is native, keyboard-friendly, localised by the
 * browser, and needs no library. The question is «من إمتى لإمتى» — a range
 * picker would be more chrome around the same two values.
 *
 * ## Why both are optional
 *
 * Leaving both empty is the previous behaviour exactly (the whole tab), so
 * nothing regressed for anyone who just wants the list. `from` alone means
 * «من التاريخ ده لغاية دلوقتي», which is the common case when he is catching
 * up after a few days.
 *
 * ## Why it is a link, not a fetch
 *
 * The response is a file with a `Content-Disposition`. Letting the browser
 * navigate to it is what makes the download work — including the session
 * cookie, which a `fetch` here would have to re-attach and then turn into a
 * blob for no gain.
 */
export function ExportRange({ status, tabLabel }: { status: string; tabLabel: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams({ status });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
        {c.exportFrom}
        <input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          // The end of a range can never be before its start; enforcing it
          // here is one fewer empty spreadsheet to explain.
          max={to || undefined}
          className="rounded-sm border border-line bg-surface-2 px-2 py-1 text-fg"
        />
      </label>
      <label className="flex items-center gap-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
        {c.exportTo}
        <input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          min={from || undefined}
          className="rounded-sm border border-line bg-surface-2 px-2 py-1 text-fg"
        />
      </label>
      <a
        href={`/api/admin/book-orders/export?${params.toString()}`}
        className="rounded-full border border-line px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
        title={c.exportHint}
      >
        {formatCopy(c.exportButton, { tab: tabLabel })}
      </a>
    </div>
  );
}
