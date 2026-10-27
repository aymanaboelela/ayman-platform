'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { adminReferralsCopy as c } from '@ayman/contracts/copy/admin-referrals';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { voidReferralAction } from './actions';

/**
 * «إلغاء» on one referral. A reason is required (3+ characters, the API's
 * rule too): a void can take money back out of two students' wallets, and the
 * audit row should say why somebody decided that.
 */
export function VoidReferralButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await voidReferralAction(id, reason.trim());
      if (result.ok) {
        toast.success(c.voided);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="danger" size="sm">
          {c.voidAction}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={c.voidCancel}>
        <DialogHeader>
          <DialogTitle>{c.voidTitle}</DialogTitle>
          <DialogDescription>{c.voidHint}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`void-${id}`}>{c.voidReason}</Label>
          <Textarea
            id={`void-${id}`}
            value={reason}
            maxLength={300}
            placeholder={c.voidReasonPlaceholder}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            {c.voidCancel}
          </Button>
          <Button variant="danger" onClick={confirm} disabled={pending || reason.trim().length < 3}>
            {c.voidConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
