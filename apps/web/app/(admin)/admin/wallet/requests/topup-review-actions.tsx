'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Button } from '@ayman/ui/components/button';
import { Input } from '@ayman/ui/components/input';
import { Textarea } from '@ayman/ui/components/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { useRefreshWalletTopupsPendingCount } from '@/components/admin/wallet-topups-alerts';
import { parsePounds, poundsOf } from '@/lib/pounds';
import { formatEGPExact } from '@/lib/price';
import { approveTopupAction, rejectTopupAction } from '../actions';

const c = copy.admin.wallet;

const egp = (cents: number) => `${formatEGPExact(cents)} ج`;

/**
 * «قبول وشحن» / «رفض» for one pending request.
 *
 * Approving opens a confirm with the amount EDITABLE, prefilled with what the
 * student typed: the screenshot is the evidence, and when it says 250 and the
 * student wrote 300, 250 is what gets credited. The server takes the request
 * out of `pending` with a conditional update and the ledger refuses a second
 * credit for it — two admins pressing at once credit it once.
 */
export function TopupReviewActions({ id, amountCents }: { id: string; amountCents: number }) {
  const refreshBadge = useRefreshWalletTopupsPendingCount();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [amountText, setAmountText] = useState(poundsOf(amountCents));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = parsePounds(amountText);
  const cents = parsed.kind === 'valid' ? parsed.cents : 0;

  async function approve() {
    if (cents < 100) return;
    setBusy(true);
    const result = await approveTopupAction(id, cents === amountCents ? null : cents);
    setBusy(false);
    if (result.ok) {
      toast.success(formatCopy(c.approvedToast, { amount: egp(result.amountCents) }));
      setApproveOpen(false);
      refreshBadge();
    } else {
      toast.error(result.message === 'already-reviewed' ? c.alreadyReviewed : c.failed);
    }
  }

  async function reject() {
    if (reason.trim().length === 0) return;
    setBusy(true);
    const result = await rejectTopupAction(id, reason.trim());
    setBusy(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      setRejectOpen(false);
      setReason('');
      refreshBadge();
    } else {
      toast.error(result.message === 'already-reviewed' ? c.alreadyReviewed : c.failed);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogTrigger asChild>
          <Button type="button" disabled={busy}>
            {c.approve}
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={c.cancel}>
          <DialogHeader>
            <DialogTitle>{c.approveTitle}</DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.approveAmount}
            <Input
              inputMode="decimal"
              dir="ltr"
              value={amountText}
              invalid={parsed.kind === 'invalid'}
              onChange={(event) => setAmountText(event.target.value)}
              className="h-12 text-center text-[1.25rem] font-bold tabular-nums [unicode-bidi:isolate]"
            />
            <span className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.approveAmountHint}</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setApproveOpen(false)}>
              {c.cancel}
            </Button>
            <Button type="button" onClick={approve} disabled={busy || cents < 100}>
              {busy ? c.approving : formatCopy(c.approveConfirm, { amount: egp(cents) })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="danger" disabled={busy}>
            {c.reject}
          </Button>
        </DialogTrigger>
        <DialogContent closeLabel={c.cancel}>
          <DialogHeader>
            <DialogTitle>{c.rejectTitle}</DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {c.rejectReason}
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={c.rejectPlaceholder}
              rows={3}
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)}>
              {c.cancel}
            </Button>
            <Button type="button" variant="danger" onClick={reject} disabled={busy || reason.trim().length === 0}>
              {busy ? c.rejecting : c.rejectConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
