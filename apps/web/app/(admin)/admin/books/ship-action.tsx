'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { useRefreshBookOrdersUnshippedCount } from '@/components/admin/book-orders-alerts';
import { markBookOrderShippedAction } from './actions';

const c = copy.admin.books;

function messageFor(message: string): string {
  return message === 'already-shipped' ? c.alreadyShipped : c.actionFailed;
}

/**
 * «اتشحن» — records ONLY that the order shipped, nothing more. No
 * notification is sent to the student (Ayman handles that himself outside
 * the platform) — see the model note on `BookOrder.shippedAt`. Rendered
 * only for `status: 'paid'` rows.
 */
export function ShipAction({ id }: { id: string }) {
  /*
   * The sidebar badge counts exactly the rows this button removes, on a
   * 30-second poll. Without this the last owed parcel stays on the badge for
   * up to half a minute after it was marked shipped. «لغاية ما تضغط اتشحنت …
   * فيتشال الرقم.»
   */
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();
  const [shipping, setShipping] = useState(false);

  async function ship() {
    if (!window.confirm(c.shipConfirm)) return;
    setShipping(true);
    const result = await markBookOrderShippedAction(id);
    setShipping(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      refreshUnshippedCount();
    } else {
      toast.error(messageFor(result.message));
    }
  }

  return (
    <Button type="button" onClick={ship} disabled={shipping} className="!bg-[oklch(0.62_0.15_150)]">
      {shipping ? c.shipping : c.ship}
    </Button>
  );
}
