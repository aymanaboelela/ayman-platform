'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
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
  const [shipping, setShipping] = useState(false);

  async function ship() {
    if (!window.confirm(c.shipConfirm)) return;
    setShipping(true);
    const result = await markBookOrderShippedAction(id);
    setShipping(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
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
