'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { useRefreshPaymentsPendingCount } from '@/components/admin/payments-alerts';
import { approvePaymentAction, rejectPaymentAction } from './actions';

const c = copy.admin.payments;

function messageFor(message: string): string {
  return message === 'already-reviewed' ? c.alreadyReviewed : c.actionFailed;
}

/** Approve / reject for one pending row. Rendered only for `status: 'pending'`. */
export function PaymentReviewActions({ id }: { id: string }) {
  /*
   * The sidebar badge counts exactly the rows these two buttons remove, and it
   * polls on a 30-second timer. Without this the last pending claim stays on
   * the badge for up to half a minute after it was approved — the admin is told
   * about their own action, late. «لما أوافق أو أرفض يبقى الرقم ده خلاص يتشال
   * على طول.»
   */
  const refreshPendingCount = useRefreshPaymentsPendingCount();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);

  async function approve() {
    setApproving(true);
    const result = await approvePaymentAction(id);
    setApproving(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      refreshPendingCount();
    } else {
      toast.error(messageFor(result.message));
    }
  }

  async function reject() {
    if (reason.trim().length === 0) return;
    setRejecting(true);
    const result = await rejectPaymentAction(id, reason.trim());
    setRejecting(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      setOpen(false);
      setReason('');
      refreshPendingCount();
    } else {
      toast.error(messageFor(result.message));
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" onClick={approve} disabled={approving || rejecting} className="!bg-[oklch(0.62_0.15_150)]">
        {approving ? c.approving : c.approve}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="danger" disabled={approving || rejecting}>
            {c.reject}
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={c.rejectCancel}>
          <DialogHeader>
            <DialogTitle>{c.rejectPromptTitle}</DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.rejectReasonLabel}
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={c.rejectReasonPlaceholder}
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {c.rejectCancel}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={reject}
              disabled={rejecting || reason.trim().length === 0}
            >
              {rejecting ? c.rejecting : c.rejectConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
