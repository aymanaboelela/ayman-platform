'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button, Input } from '@ayman/ui';
import { AdminApiError } from '@/lib/admin-api';
import { addOptOutAction } from '../actions';

const c = copy.marketing;

/** Add a number by hand — someone who asked to be left alone through any
 *  channel other than replying «قف» on WhatsApp itself. */
export function AddOptOutForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await addOptOutAction(phone, reason || null);
        setPhone('');
        setReason('');
        toast.success(copy.admin.common.saved);
        router.refresh();
      } catch (err) {
        setError(err instanceof AdminApiError ? err.message : 'حصل خطأ، حاول تاني');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <Input
          dir="ltr"
          placeholder="01012345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div>
        <Input placeholder={c.colReason} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <Button disabled={pending || !phone} onClick={submit}>
        {c.addOptOut}
      </Button>
      {error ? <p className="w-full text-[color:var(--err)]">{error}</p> : null}
    </div>
  );
}
