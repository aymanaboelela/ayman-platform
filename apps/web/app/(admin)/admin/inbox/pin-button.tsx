'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, PinOff } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { apiPatch } from '@/lib/api';

const c = copy.assistant.inbox;

/**
 * «تثبيت فوق» / «إلغاء التثبيت» — on each inbox row and in the thread header.
 * `relative z-10` so it sits above the row's stretched link.
 */
export function PinButton({ id, pinned, withLabel = false }: { id: string; pinned: boolean; withLabel?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const label = pinned ? c.unpin : c.pin;

  function toggle() {
    startTransition(async () => {
      try {
        await apiPatch(`/api/admin/conversations/${id}/pin`, { pinned: !pinned });
        router.refresh();
      } catch {
        toast.error(copy.assistant.escalate.failed);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      className={cn(
        'relative z-10 inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[length:var(--fs-text-xs)]',
        'transition-colors duration-[160ms] ease-out disabled:opacity-60',
        pinned
          ? 'border-accent/50 bg-accent/12 text-accent-text'
          : 'border-line bg-surface-1 text-fg-muted hover:border-accent/50 hover:text-accent-text',
      )}
    >
      {pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
      {withLabel ? label : null}
    </button>
  );
}
