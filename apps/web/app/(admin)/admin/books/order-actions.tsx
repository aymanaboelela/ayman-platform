'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  DeleteBookOrderSchema,
  RejectBookOrderSchema,
} from '@ayman/contracts/admin/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { useRefreshBookOrdersUnshippedCount } from '@/components/admin/book-orders-alerts';
import {
  deleteBookOrderAction,
  markBookOrderDeliveredAction,
  rejectBookOrderAction,
  restoreBookOrderAction,
} from './actions';
import { ReasonDialog } from './reason-dialog';

const c = copy.admin.books;

/**
 * The rest of the shipping desk's day, as four buttons on a row.
 *
 * «اتشحن» lives next door in `ship-action.tsx` and is untouched. These are what
 * happens after it — or instead of it.
 *
 * ## Every one of them refreshes the sidebar badge
 *
 * The badge counts `status: 'paid'` on a 30-second poll, and all four of these
 * can take a row out of that set: delivering it, rejecting it, hiding it — and
 * restoring one puts it back. Without the nudge the number an admin just
 * changed keeps contradicting them for up to half a minute. «لغاية ما تضغط
 * اتشحنت … فيتشال الرقم» applies to each of these for the same reason.
 */

/**
 * «وصل» — confirm the book ARRIVED. On `paid` or `shipped` rows, because both
 * are real: an order handed to a courier arrives, and an order Ayman delivered
 * himself was never «اتشحن» at all.
 *
 * `window.confirm` and not a dialog: there is nothing to type. But the
 * confirmation says the student is notified, because pressing this SENDS them a
 * notification — a confirm that only said «متأكد؟» would be hiding the one
 * consequence that cannot be undone.
 */
export function DeliverAction({ id }: { id: string }) {
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();
  const [pending, setPending] = useState(false);

  async function deliver() {
    if (!window.confirm(c.deliverConfirm)) return;
    setPending(true);
    const result = await markBookOrderDeliveredAction(id);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      refreshUnshippedCount();
    } else {
      toast.error(result.message === 'already-delivered' ? c.alreadyDelivered : c.actionFailed);
    }
  }

  return (
    <Button
      type="button"
      onClick={deliver}
      disabled={pending}
      /* Its own colour, distinct from «اتشحن»'s green: the two sit side by side
         on a paid row and are one click apart in consequence — one is
         bookkeeping, the other tells a student their book is at the door. */
      className="!bg-[oklch(0.58_0.13_240)] !text-white"
    >
      {pending ? c.delivering : c.deliver}
    </Button>
  );
}

/** «ارفض الطلب» — the student sees the reason, verbatim. */
export function RejectOrderAction({ id }: { id: string }) {
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();

  return (
    <ReasonDialog
      triggerLabel={c.reject}
      title={c.rejectDialogTitle}
      hint={c.rejectDialogHint}
      reasonLabel={c.rejectReasonLabel}
      placeholder={c.rejectReasonPlaceholder}
      submitLabel={c.rejectSubmit}
      submittingLabel={c.rejectSubmitting}
      failedMessage={c.rejectFailed}
      schema={RejectBookOrderSchema}
      onSubmit={async (reason) => {
        const result = await rejectBookOrderAction(id, reason);
        if (result.ok) refreshUnshippedCount();
        return result;
      }}
    />
  );
}

/** «احذف الطلب» — soft, internal, and reversible from «المحذوفة». */
export function RemoveOrderAction({ id }: { id: string }) {
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();

  return (
    <ReasonDialog
      triggerLabel={c.remove}
      title={c.removeDialogTitle}
      hint={c.removeDialogHint}
      reasonLabel={c.removeReasonLabel}
      placeholder={c.removeReasonPlaceholder}
      submitLabel={c.removeSubmit}
      submittingLabel={c.removeSubmitting}
      failedMessage={c.removeFailed}
      schema={DeleteBookOrderSchema}
      onSubmit={async (reason) => {
        const result = await deleteBookOrderAction(id, reason);
        if (result.ok) refreshUnshippedCount();
        return result;
      }}
    />
  );
}

/**
 * «رجّعه» — only ever rendered on the «المحذوفة» tab, where it is the ONE thing
 * to do with a row. Accent, not danger: this is the way back.
 */
export function RestoreOrderAction({ id }: { id: string }) {
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();
  const [pending, setPending] = useState(false);

  async function restore() {
    if (!window.confirm(c.restoreConfirm)) return;
    setPending(true);
    const result = await restoreBookOrderAction(id);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      refreshUnshippedCount();
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Button type="button" onClick={restore} disabled={pending}>
      {pending ? c.restoring : c.restore}
    </Button>
  );
}
