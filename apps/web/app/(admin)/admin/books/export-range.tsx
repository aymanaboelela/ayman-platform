'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
// The dedicated leaf module, never `@ayman/contracts/admin/book-orders` — see
// its own header note: this is a client component on the orders screen, and
// the full contract would ride into the bundle for one array of ids.
import {
  parseAdminBookOrderHeldIds,
  parseAdminBookOrderIds,
} from '@ayman/contracts/admin/book-orders-packing-ids';
import { apiGetNarrow } from '@/lib/api';
import { clearBookOrderHoldsAction } from './actions';
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
  filters,
  rowCount,
  batchable,
  compact = false,
}: {
  status: string;
  tabLabel: string;
  /**
   * The OTHER filters the screen is showing — «عربي / لغات», «الصف» and the
   * search box.
   *
   * «جالب إن واحد ناقص»: the file used to carry only the tab and the dates
   * while the list above it was also filtered by these three, so the two could
   * never be counted against each other. They ride along on both downloads.
   */
  filters?: { stream?: string; year?: number; q?: string };
  /**
   * How many orders this tab holds in TOTAL — `rowCount`, not the length of
   * the page. It is what the button can promise before it has asked the
   * server, and it is the number the sidebar badge shows.
   */
  rowCount: number;
  /**
   * Whether a batch action can apply to this tab at all. «اتشحن» and «وصل» act
   * on `paid`/`shipped` rows, so the select button is hidden everywhere else
   * rather than selecting rows every batch would skip.
   */
  batchable: boolean;
  /**
   * The صف-section variant — «تحميل الصف ده».
   *
   * Same three downloads, same filters, no date inputs: a section header has
   * room for two buttons and not for a range picker, and the range belongs to
   * the WHOLE run rather than to one year of it — the dates are set once in the
   * toolbar above and every per-year link inherits them through `filters`.
   *
   * ⚠️ It also drops «حدّد اللي في المدى». A select button per section would
   * REPLACE the selection each time it is pressed (see `useBulkSelectMany`), so
   * ticking سنة أولى and then سنة تانية would silently leave only the second —
   * on the control whose entire job is making sure no parcel is missed.
   */
  compact?: boolean;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [lifting, setLifting] = useState(false);
  const selectMany = useBulkSelectMany();
  const router = useRouter();

  const params = new URLSearchParams({ status });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (filters?.stream) params.set('stream', filters.stream);
  if (filters?.year !== undefined) params.set('year', String(filters.year));
  if (filters?.q) params.set('q', filters.q);

  /**
   * «حدّد اللي في المدى» — tick exactly the orders the file would contain.
   *
   * ⚠️ It ASKS THE SERVER, and used to filter the rows already rendered. The
   * page is fifty rows long: on a tab of fifty-two, the button said «(50)»
   * while the sidebar badge said «52», and a batch «اتشحن» quietly left the
   * last two unshipped — the screen showed nothing that said so. The ids come
   * out of the packing list itself, so the selection, the spreadsheet and the
   * PDF are the same set by construction.
   */
  async function selectInRange(): Promise<void> {
    setSelecting(true);
    try {
      const ids = await apiGetNarrow(
        `/api/admin/book-orders/packing-list?${params.toString()}`,
        parseAdminBookOrderIds,
      );
      if (ids.length === 0) {
        toast.message(c.bulkSelectRangeEmpty);
        return;
      }
      selectMany?.(ids);
    } catch {
      toast.error(c.actionFailed);
    } finally {
      setSelecting(false);
    }
  }

  /**
   * «ارفع الحجز عن المحجوزين» — the holds in THIS range, all of them.
   *
   * ## Why it is not the selection
   *
   * A held order is not in the packing list, so «حدّد اللي في المدى» cannot
   * tick it and the bulk button in the bar has nothing to act on. The admin
   * would have to find each held row by eye down a list of fifty and tick it by
   * hand — on the screen whose whole job is making sure no parcel is missed.
   *
   * ## Why it asks the server for the ids instead of counting rows
   *
   * Same reason `selectInRange` does: the page is fifty rows and the range is
   * not. A button that lifted the holds it can SEE would leave the ones on page
   * two held, and the only symptom would be two parcels missing from a print
   * run nobody counts.
   *
   * ⚠️ It does NOT select them afterwards. The next thing the admin presses is
   * «حدّد اللي في المدى», which now includes them — replacing the selection
   * here would quietly drop whatever he had already ticked.
   */
  async function liftHoldsInRange(): Promise<void> {
    setLifting(true);
    try {
      const ids = await apiGetNarrow(
        `/api/admin/book-orders/packing-list?${params.toString()}`,
        parseAdminBookOrderHeldIds,
      );
      if (ids.length === 0) {
        toast.message(c.bulkReviewOkRangeEmpty);
        return;
      }
      if (!window.confirm(formatCopy(c.bulkReviewOkRangeConfirm, { count: String(ids.length) }))) {
        return;
      }
      const result = await clearBookOrderHoldsAction(ids);
      if (!result) {
        toast.error(c.actionFailed);
        return;
      }
      toast.success(formatCopy(c.bulkReviewOkDone, { count: String(result.succeeded) }));
      /* The chips, the badges and the packing list are all server-rendered, so
         the holds only LOOK lifted after this. */
      router.refresh();
    } catch {
      toast.error(c.actionFailed);
    } finally {
      setLifting(false);
    }
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={`/admin/books/print?${params.toString()}`}
          target="_blank"
          rel="noopener"
          className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[length:var(--fs-text-xs)] text-accent-text transition-colors duration-[160ms] ease-out hover:bg-accent/20"
          title={c.exportPdfHint}
        >
          {c.exportPdf}
        </a>
        {batchable ? (
          <a
            href={`/admin/books/labels?${params.toString()}`}
            target="_blank"
            rel="noopener"
            className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[length:var(--fs-text-xs)] text-accent-text transition-colors duration-[160ms] ease-out hover:bg-accent/20"
            title={c.labelsHint}
          >
            {c.labelsButton}
          </a>
        ) : null}
        <a
          href={`/api/admin/book-orders/export?${params.toString()}`}
          className="rounded-full border border-line px-3 py-1 text-[length:var(--fs-text-xs)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
          title={c.exportHint}
        >
          {formatCopy(c.exportButton, { tab: tabLabel })}
        </a>
      </div>
    );
  }

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

        Shown on the tabs a batch can act on, and only inside the provider —
        `ExportRange` also renders on tabs that have no batch actions at all.
      */}
      {selectMany && batchable ? (
        <button
          type="button"
          onClick={() => void selectInRange()}
          disabled={selecting}
          className="rounded-full border border-line px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg disabled:opacity-60"
          title={c.bulkSelectRangeHint}
        >
          {selecting
            ? c.bulkSelectRangeWorking
            : /* With no dates the range IS the tab, and the tab's own total is
                 already known — so the button can name it instead of naming
                 the page it happens to be showing. */
              formatCopy(from || to ? c.bulkSelectRangeDates : c.bulkSelectRange, {
                n: String(rowCount),
              })}
        </button>
      ) : null}
      {/*
        «راجعتهم كلهم، كمّل» for the whole range.

        Beside «حدّد اللي في المدى» because it is the step BEFORE it: the holds
        come off, and only then does the range select the full run. On the same
        tabs, for the same reason — a hold on a rejected order is not a parcel
        waiting to be printed.

        Amber, matching `HeldBanner`: it is the toolbar's answer to the band the
        admin has been reading down the list.
      */}
      {selectMany && batchable ? (
        <button
          type="button"
          onClick={() => void liftHoldsInRange()}
          disabled={lifting}
          className="rounded-full px-3.5 py-1.5 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out disabled:opacity-60"
          style={{
            border: '1px solid color-mix(in oklch, var(--warn), transparent 55%)',
            background: 'color-mix(in oklch, var(--warn), transparent 88%)',
            color: 'var(--warn)',
          }}
          title={c.bulkReviewOkRangeHint}
        >
          {lifting ? c.bulkReviewOkRangeWorking : c.bulkReviewOkRange}
        </button>
      ) : null}
      <a
        href={`/api/admin/book-orders/export?${params.toString()}`}
        className="rounded-full border border-line px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg"
        title={c.exportHint}
      >
        {formatCopy(c.exportButton, { tab: tabLabel })}
      </a>
      {/*
        «وانا بعمل تحميل يتعمل PDF أحسن بشكل كويس كده» — the same list, laid
        out on A4.

        A new TAB and not a download: the page prints itself, and the file the
        admin keeps comes out of the browser's own «حفظ كـ PDF». That is what
        makes the Arabic correct — an Arabic PDF needs bidi and letter joining,
        and every Node PDF library would hand the print shop reversed, unjoined
        letters. The browser already does it perfectly.
      */}
      <a
        href={`/admin/books/print?${params.toString()}`}
        target="_blank"
        rel="noopener"
        className="rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-accent-text transition-colors duration-[160ms] ease-out hover:bg-accent/20"
        title={c.exportPdfHint}
      >
        {c.exportPdf}
      </a>
      {/*
        «هخده نص بس الكرت وتحطه على الشحنة» — the same run again, as cut-out
        cards rather than as a table.

        A SECOND button and not a mode on the first: the packing sheet is the
        desk's paper (ticked once while the boxes are filled) and this is the
        box's paper. Both get printed on the same day for the same run, so
        replacing one with the other would just mean visiting the screen twice.

        Only on the tabs a parcel can actually be shipped from — printing
        address cards for a REJECTED order is printing a label for a box nobody
        is sending. `batchable` is already exactly that set.
      */}
      {batchable ? (
        <a
          href={`/admin/books/labels?${params.toString()}`}
          target="_blank"
          rel="noopener"
          className="rounded-full border border-accent/40 bg-accent/10 px-3.5 py-1.5 text-[length:var(--fs-text-sm)] text-accent-text transition-colors duration-[160ms] ease-out hover:bg-accent/20"
          title={c.labelsHint}
        >
          {c.labelsButton}
        </a>
      ) : null}
    </div>
  );
}
