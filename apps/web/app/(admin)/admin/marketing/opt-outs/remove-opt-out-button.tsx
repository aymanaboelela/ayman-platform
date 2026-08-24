'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui';
import { AdminApiError } from '@/lib/admin-api';
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
          try {
            await removeOptOutAction(phone);
            toast.success(copy.admin.common.saved);
            router.refresh();
          } catch (err) {
            toast.error(err instanceof AdminApiError ? err.message : 'حصل خطأ');
          }
        })
      }
    >
      {c.removeOptOut}
    </Button>
  );
}
