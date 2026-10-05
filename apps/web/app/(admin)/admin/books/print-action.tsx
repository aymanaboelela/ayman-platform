'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Printer } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { printBookOrdersAction } from './actions';
import { useCourierEnabled } from './bulk-ship';
import { reportCourierHalf } from './courier-actions';

const c = copy.admin.books;

/**
 * «راح للمطبعة» — the hand-off BEFORE «اتشحن».
 *
 * ## Why it is its own button and not a second meaning for «اتشحن»
 *
 * The day has two hand-offs and they happen hours apart: «أنزّل PDF وأوديه
 * للمطبعة» in the morning, «أتأكد إنه هيشحن فعلاً» in the afternoon. Until this
 * existed both were one click, so the «مدفوعة» tab could not say which of its
 * rows had already gone — the one question it is opened for.
 *
 * ## Why there is no "the student will be notified" in the confirm
 *
 * Because they will not be, and the confirmation says so out loud. Every other
 * transition on this row sends something; this is the only one that does not,
 * and an admin who has learned that pressing things here messages students
 * deserves to be told when one does not.
 *
 * ## No `useRefreshBookOrdersUnshippedCount`
 *
 * Deliberate, and the one place on this screen where that hook is absent. The
 * sidebar badge counts `status: 'paid'` — parcels still owed — and an order at
 * the printer is still owed, so it stays on the badge. It is not a number this
 * button changes, and nudging a poll that will return the same value is noise.
 */
export function PrintAction({ id }: { id: string }) {
  const router = useRouter();
  /* On a stack with the courier integration the same press hands the order to
     their system — the printer gives the box to their agent, so the data has
     to be there first. Through the batch route, which already does both. */
  const courier = useCourierEnabled();
  const [pending, setPending] = useState(false);

  async function markPrinting() {
    const ask = courier ? formatCopy(c.bulkPrintCourierConfirm, { count: '1' }) : c.markPrintingConfirm;
    if (!window.confirm(ask)) return;
    setPending(true);
    const result = await printBookOrdersAction([id], courier);
    setPending(false);
    const row = result?.rows[0];
    if (row?.outcome === 'printing') toast.success(copy.admin.common.saved);
    else toast.error(row?.reason ?? c.actionFailed);
    if (result) reportCourierHalf(result);
    router.refresh();
  }

  return (
    <Button
      type="button"
      onClick={markPrinting}
      disabled={pending}
      /*
        Violet — the one hue not already spoken for on this row. Green is
        «اتشحن», blue is «وصل», amber is the product's action colour and red is
        «ارفض», and three buttons a tired thumb has to tell apart at arm's
        length cannot share a family.

        An inline `style`, not an arbitrary Tailwind class. `<Button>` sets
        `bg-accent` in its own class list, so overriding it from the outside
        needs `!important` — and an arbitrary-value utility carrying an
        `!important` flag AND an `oklch()` triple is three things that have to
        survive content detection to render at all. A style attribute beats the
        class either way and cannot be scanned out.
      */
      style={{ background: 'oklch(0.55 0.16 300)', color: '#fff' }}
    >
      <Printer className="size-4" aria-hidden />
      {pending ? c.markPrintingWorking : c.bulkPrintButton}
    </Button>
  );
}
