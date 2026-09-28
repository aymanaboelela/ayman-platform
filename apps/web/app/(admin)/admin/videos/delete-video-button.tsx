'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { deleteVideoAction } from './actions';

const c = copy.admin.videos;

/**
 * «امسح» on one video, behind a confirm — the one delete in the admin that no
 * backup can undo, because the bytes were never in one.
 *
 * `disabled` while the video is still uploading or encoding: the API refuses
 * then too, but a button that looks pressable and answers «لسه» is worse than
 * one that says so by not being pressable.
 */
export function DeleteVideoButton({
  videoId,
  courseId,
  disabled = false,
}: {
  videoId: string;
  courseId: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function go() {
    setPending(true);
    const result = await deleteVideoAction(videoId, courseId);
    setPending(false);
    if (result.ok) {
      setOpen(false);
      toast.success(c.deleted);
      router.refresh();
    } else {
      // Stays open: the admin is still looking at the video they meant.
      toast.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          title={disabled ? c.busy : c.delete}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 md:h-9',
            'text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms] ease-out',
            'border-[color-mix(in_oklab,var(--err)_45%,var(--border))] bg-[color-mix(in_oklab,var(--err)_9%,var(--n-2))] text-err',
            'hover:bg-[color-mix(in_oklab,var(--err)_16%,var(--n-2))]',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {c.delete}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{c.deleteTitle}</DialogTitle>
          <DialogDescription>{courseId === null ? c.deleteOrphanBody : c.deleteBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              {c.back}
            </Button>
          </DialogClose>
          <Button variant="danger" onClick={go} disabled={pending}>
            {c.deleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
