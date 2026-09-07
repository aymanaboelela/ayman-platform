'use client';

import { useState } from 'react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { useBulkSelectMany } from './bulk-ship';

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
export function ExportRange({
  status,
  tabLabel,
  selectable = [],
}: {
  status: string;
  tabLabel: string;
  /**
   * Every row on screen a batch action can apply to, with the date the export
   * filters on. Empty on tabs that have no such rows, which is what makes the
   * select button disappear rather than select nothing.
   */
  selectable?: { id: string; createdAt: string }[];
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const selectMany = useBulkSelectMany();

  const params = new URLSearchParams({ status });
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  /*
   * The SAME predicate the export runs, on the rows already rendered.
   *
   * `createdAt` is an ISO instant and the inputs are `YYYY-MM-DD`, so the
   * comparison is on the date prefix — string comparison is correct for ISO
   * dates and, unlike `new Date(from)`, cannot shift a row into the previous
   * day for an admin who is not on UTC. Both ends inclusive, matching the
   * spreadsheet: «من ٢٩ لـ ٥» has to contain the 5th, or the last day of the
   * run is the one order left behind.
   */
  const inRange = selectable.filter(({ createdAt }) => {
    const day = createdAt.slice(0, 10);
    return (!from || day >= from) && (!to || day <= to);
  });

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
      {/*
        «يدول هتعمل ليهم إن تم الشحن» — the export IS the packing list, so the
        run that comes back from the courier is defined by the same two dates.
        Ticking those rows again by hand is the step where a batch of thirty
        loses one, and it is the only step of the loop the screen was not
        helping with.

        Hidden until the provider is present AND something matches, so it can
        never be a button whose only outcome is an empty selection.
      */}
      {selectMany && inRange.length > 0 ? (
        <button
          type="button"
          onClick={() => selectMany(inRange.map((row) => row.id))}
          className="rounded-full border border-line px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
          title={c.bulkSelectRangeHint}
        >
          {formatCopy(c.bulkSelectRange, { n: String(inRange.length) })}
        </button>
      ) : null}
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
