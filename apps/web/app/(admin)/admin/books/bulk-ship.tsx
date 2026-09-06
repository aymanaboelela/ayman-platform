'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { BulkBookOrderResult } from '@ayman/contracts/admin/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts';
import { Button } from '@ayman/ui/components/button';
import { useRefreshBookOrdersUnshippedCount } from '@/components/admin/book-orders-alerts';
import { shipBookOrdersAction, deliverBookOrdersAction } from './actions';

const c = copy.admin.books;

/**
 * Selection state for «اشحن المحدد» — «لما أقول اتشحن أو أحدد أكتر من واحد
 * برضه أقدر أضغط على شحن مرة واحدة».
 *
 * ## Why a context rather than lifting the list into a client component
 *
 * The orders page is a Server Component that renders ~500 lines of row markup
 * with several dialogs inside it. Making it a client component to hold one
 * `Set<string>` would ship all of that to the browser and drag the row data
 * through the RSC boundary for no other reason. A tiny provider wrapping the
 * list, with a checkbox and a bar as its only clients, keeps the page server-
 * rendered.
 *
 * ## Why the selection is not in the URL
 *
 * Every other filter on this page is (`nuqs`, shallow: false) — deliberately
 * not this one. A selection is a scratchpad for one action taken seconds from
 * now, and putting it in the URL would make each checkbox a navigation, reload
 * the list under the admin's cursor, and leave a link that "restores" a
 * selection of orders whose statuses have since changed.
 */
interface BulkContext {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
}

const Ctx = createContext<BulkContext | null>(null);

export function BulkShipProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const value = useMemo<BulkContext>(
    () => ({
      selected,
      toggle: (id) =>
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [selected],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <BulkBar onCleared={() => setSelected(new Set())} />
    </Ctx.Provider>
  );
}

/**
 * One row's checkbox. Rendered only on rows an action can actually apply to —
 * a checkbox on a delivered order is a control that can only ever produce
 * «اتشحن قبل كده».
 */
export function OrderCheckbox({ id, label }: { id: string; label: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
      <input
        type="checkbox"
        checked={ctx.selected.has(id)}
        onChange={() => ctx.toggle(id)}
        className="size-4 accent-[color:var(--accent)]"
        aria-label={formatCopy(c.bulkSelectOne, { name: label })}
      />
      {c.bulkSelect}
    </label>
  );
}

/**
 * The result toast.
 *
 * ⚠️ It NAMES the rows that did not go through, rather than counting them.
 * «٨ اتشحنوا و٢ لأ» sends the admin back to re-read ten rows to find which
 * two; the two names are the entire actionable content of the response, and
 * `notice_failed` in particular means "the book left but the student was not
 * told", which is a phone call he has to make.
 */
function report(result: BulkBookOrderResult): void {
  if (result.succeeded > 0) {
    toast.success(formatCopy(c.bulkShipped, { count: String(result.succeeded) }));
  }
  for (const row of result.rows) {
    if (row.outcome === 'notice_failed') {
      toast.error(`${row.fullName} — ${row.reason ?? ''}`, { duration: 10_000 });
    }
  }
  const skipped = result.rows.filter((row) => row.outcome === 'skipped');
  if (skipped.length > 0) {
    toast.message(
      formatCopy(c.bulkSkipped, {
        names: skipped.map((row) => row.fullName || row.id.slice(0, 8)).join('، '),
      }),
    );
  }
}

function BulkBar({ onCleared }: { onCleared: () => void }) {
  const ctx = useContext(Ctx);
  const router = useRouter();
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();
  const [busy, setBusy] = useState(false);

  if (!ctx || ctx.selected.size === 0) return null;
  const ids = [...ctx.selected];

  async function run(action: (ids: string[]) => Promise<BulkBookOrderResult | null>) {
    setBusy(true);
    const result = await action(ids);
    setBusy(false);
    if (!result) {
      toast.error(c.actionFailed);
      return;
    }
    report(result);
    onCleared();
    refreshUnshippedCount();
    router.refresh();
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-1 mt-3 flex flex-wrap items-center gap-2 rounded-t-lg border border-line bg-surface-3 px-3 py-2 shadow-lg">
      <span className="text-[length:var(--fs-text-sm)] font-medium text-fg">
        {formatCopy(c.bulkSelected, { count: String(ids.length) })}
      </span>
      <div className="ms-auto flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(formatCopy(c.bulkShipConfirm, { count: String(ids.length) }))) return;
            void run(shipBookOrdersAction);
          }}
        >
          {busy ? c.bulkWorking : c.bulkShipButton}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(formatCopy(c.bulkDeliverConfirm, { count: String(ids.length) }))) return;
            void run(deliverBookOrdersAction);
          }}
        >
          {c.bulkDeliverButton}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCleared}>
          {c.bulkClear}
        </Button>
      </div>
    </div>
  );
}
