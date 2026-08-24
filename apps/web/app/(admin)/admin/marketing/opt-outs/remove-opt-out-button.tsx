'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import { removeOptOutAction } from '../actions';

const c = copy.marketing;

export function RemoveOptOutButton({ phone }: { phone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeOptOutAction(phone);
          if (result.ok) {
            toast.success(copy.admin.common.saved);
            router.refresh();
          } else {
            toast.error(result.message);
          }
        })
      }
    >
      {c.removeOptOut}
    </Button>
  );
}
