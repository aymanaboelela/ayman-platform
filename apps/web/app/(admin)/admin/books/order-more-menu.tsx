'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, HandHeart, MoreHorizontal, PackageCheck, Trash2 } from 'lucide-react';
import type { BookOrderStatus } from '@ayman/contracts/book-orders';
import { copy } from '@ayman/contracts/copy/admin';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ayman/ui/components/dropdown-menu';
import { useRefreshBookOrdersUnshippedCount } from '@/components/admin/book-orders-alerts';
import { markBookOrderDeliveredAction, markBookOrderShippedAction } from './actions';
import { RejectOrderAction, RemoveOrderAction } from './order-actions';

const c = copy.admin.books;

/**
 * «المزيد» — what a row CAN do but almost never does.
 *
 * «لو فيه زراير مالهاش لازمة أشيلها»: every card used to carry «ارفض» and
 * «احذف» as two red outlined buttons, plus «اتشحن» and «وصل» on rows where
 * neither is the next step. Nine controls a card, and the one that mattered —
 * the next step — was the same size as the one that deletes the order.
 *
 * So the card shows its next step, «تعديل» and «واتساب», and everything else
 * lives here. Nothing was removed: «اتشحن» from a paid row is the copy handed
 * over without a print run, «اتسلّم باليد» is the book Ayman gave himself, and
 * both judgements open the same reason dialogs as before.
 */
export function OrderMoreMenu({ id, status }: { id: string; status: BookOrderStatus }) {
  const router = useRouter();
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();
  const [rejecting, setRejecting] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function shipNow() {
    if (!window.confirm(c.shipConfirm)) return;
    const result = await markBookOrderShippedAction(id);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      refreshUnshippedCount();
      router.refresh();
    } else toast.error(result.message === 'already-shipped' ? c.alreadyShipped : c.actionFailed);
  }

  async function deliverNow() {
    if (!window.confirm(c.deliverConfirm)) return;
    const result = await markBookOrderDeliveredAction(id);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      refreshUnshippedCount();
      router.refresh();
    } else toast.error(result.message === 'already-delivered' ? c.alreadyDelivered : c.actionFailed);
  }

  const canShip = status === 'paid';
  const canDeliver = status === 'paid' || status === 'printing';
  const canReject = status !== 'delivered' && status !== 'rejected';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-10 items-center gap-1.5 rounded-sm border border-line bg-surface-3 px-3 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:bg-surface-4 hover:text-fg md:h-8"
          aria-label={c.moreActions}
        >
          <MoreHorizontal className="size-4" aria-hidden />
          {c.moreActions}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canShip ? (
            <DropdownMenuItem onSelect={() => void shipNow()}>
              <PackageCheck className="size-4" aria-hidden />
              {c.shipSkipPrinter}
            </DropdownMenuItem>
          ) : null}
          {canDeliver ? (
            <DropdownMenuItem onSelect={() => void deliverNow()}>
              <HandHeart className="size-4" aria-hidden />
              {c.deliverByHand}
            </DropdownMenuItem>
          ) : null}
          {canShip || canDeliver ? <DropdownMenuSeparator className="my-1 h-px bg-line-subtle" /> : null}
          {canReject ? (
            <DropdownMenuItem onSelect={() => setRejecting(true)} className="text-[color:var(--err)]">
              <Ban className="size-4" aria-hidden />
              {c.reject}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setRemoving(true)} className="text-[color:var(--err)]">
            <Trash2 className="size-4" aria-hidden />
            {c.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RejectOrderAction id={id} open={rejecting} onOpenChange={setRejecting} />
      <RemoveOrderAction id={id} open={removing} onOpenChange={setRemoving} />
    </>
  );
}
