'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PackageCheck, Printer, Truck } from 'lucide-react';
import type { BulkBookOrderResult } from '@ayman/contracts/admin/book-orders';
import { parseAdminBookOrderIds } from '@ayman/contracts/admin/book-orders-packing-ids';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { useRefreshBookOrdersUnshippedCount } from '@/components/admin/book-orders-alerts';
import { apiGetNarrow } from '@/lib/api';
import { courierBookOrdersAction, printBookOrdersAction, shipBookOrdersAction } from './actions';

const c = copy.admin.books;

/** The API takes at most this many ids per batch — `BulkBookOrderActionSchema`. */
const BATCH = 100;

type Kind = 'print' | 'courier' | 'ship';

/**
 * «زرار فوق: ابعت الكل» — the whole tab in one press, instead of selecting.
 *
 * ## The whole TAB, not the page
 *
 * The ids come from the packing list — the same server query «حدّد الكل»
 * and the PDF use — so a tab of 120 orders sends 120, not the 50 on screen,
 * and the stream/صف/search filters on screen narrow it exactly as they narrow
 * the list. A held order is not in that query, so it is never sent anywhere.
 *
 * ## In batches of a hundred
 *
 * The bulk routes take 100 ids at a time; a bigger tab goes as several calls
 * and the toast adds them up.
 */
export function TabActions({
  status,
  filters,
  count,
  courierEnabled,
}: {
  status: string;
  filters: { stream?: string; year?: number; q?: string };
  /** The tab's total, for the button label. The confirm uses the real id
   *  count, which leaves out held orders. */
  count: number;
  courierEnabled: boolean;
}) {
  const router = useRouter();
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();
  const [busy, setBusy] = useState<Kind | null>(null);

  const actions: Kind[] =
    status === 'paid'
      ? ['print']
      : status === 'printing' || status === 'returned'
        ? courierEnabled
          ? ['courier', 'ship']
          : ['ship']
        : [];
  if (actions.length === 0 || count === 0) return null;

  async function run(kind: Kind) {
    setBusy(kind);
    try {
      const params = new URLSearchParams({ status });
      if (filters.stream) params.set('stream', filters.stream);
      if (filters.year !== undefined) params.set('year', String(filters.year));
      if (filters.q) params.set('q', filters.q);
      const ids = await apiGetNarrow(`/api/admin/book-orders/packing-list?${params.toString()}`, parseAdminBookOrderIds);
      if (ids.length === 0) {
        toast.message(c.allEmpty);
        return;
      }
      const ask =
        kind === 'print' ? c.bulkPrintConfirm : kind === 'courier' ? c.bulkCourierConfirm : c.bulkShipConfirm;
      if (!window.confirm(formatCopy(ask, { count: String(ids.length) }))) return;

      let succeeded = 0;
      const skipped: string[] = [];
      for (let start = 0; start < ids.length; start += BATCH) {
        const chunk = ids.slice(start, start + BATCH);
        let result: BulkBookOrderResult | { error: string } | null;
        if (kind === 'print') result = await printBookOrdersAction(chunk);
        else if (kind === 'courier') result = await courierBookOrdersAction(chunk);
        else result = await shipBookOrdersAction(chunk);
        if (!result) {
          toast.error(c.actionFailed);
          break;
        }
        if ('error' in result) {
          toast.error(result.error);
          break;
        }
        succeeded += result.succeeded;
        for (const row of result.rows) {
          if (row.outcome === 'skipped') skipped.push(row.fullName || row.id.slice(0, 8));
        }
      }

      if (succeeded > 0) {
        const done = kind === 'print' ? c.bulkPrinted : kind === 'courier' ? c.bulkCourierDone : c.bulkShipped;
        toast.success(formatCopy(done, { count: String(succeeded) }));
      }
      if (skipped.length > 0) {
        toast.message(formatCopy(c.bulkSkipped, { names: skipped.join('، ') }), { duration: 12_000 });
      }
      refreshUnshippedCount();
      router.refresh();
    } catch {
      toast.error(c.actionFailed);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((kind) => {
        const label =
          kind === 'print' ? c.allToPrinter : kind === 'courier' ? c.allToCourier : c.allShip;
        const Icon = kind === 'print' ? Printer : kind === 'courier' ? Truck : PackageCheck;
        /* The courier is the main move on «في المطبعة» when the stack has it;
           «اتشحن الكل» beside it is the quiet one. */
        const quiet = kind === 'ship' && courierEnabled;
        const tone =
          kind === 'print' ? 'oklch(0.55 0.16 300)' : kind === 'courier' ? 'oklch(0.55 0.13 190)' : 'oklch(0.58 0.15 150)';
        return (
          <Button
            key={kind}
            type="button"
            variant={quiet ? 'secondary' : 'primary'}
            disabled={busy !== null}
            onClick={() => void run(kind)}
            style={quiet ? undefined : { background: tone, color: '#fff' }}
          >
            <Icon className="size-4" aria-hidden />
            {busy === kind ? c.allWorking : formatCopy(label, { n: count })}
          </Button>
        );
      })}
    </div>
  );
}
