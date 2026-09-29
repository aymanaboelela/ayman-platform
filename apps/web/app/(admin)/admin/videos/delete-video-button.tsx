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
  body,
}: {
  videoId: string;
  courseId: string | null;
  disabled?: boolean;
  /** Overrides the dialog text — a kept video is not a «leftover». */
  body?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  /*
   * ⚠️ The refusal is said INSIDE the dialog, not only in a toast.
   *
   * «هنا حذف مش شغّال»: a press that was refused said so in a corner toast,
   * gone in four seconds, while the owner's eyes were on the button. The API's
   * refusals name the fix («لسه بيترفع… استنى لما يخلص»), so they belong where
   * he is looking.
   */
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    const result = await deleteVideoAction(videoId, courseId);
    setPending(false);
    if (result.ok) {
      setOpen(false);
      toast.success(c.deleted);
      router.refresh();
    } else {
      // Stays open: the admin is still looking at the video they meant.
      setError(result.message);
      toast.error(result.message);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
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
          <DialogDescription>{body ?? (courseId === null ? c.deleteOrphanBody : c.deleteBody)}</DialogDescription>
        </DialogHeader>
        {error !== null ? (
          <p
            role="alert"
            className="rounded-md border border-[color-mix(in_oklab,var(--err)_40%,var(--border))] bg-[color-mix(in_oklab,var(--err)_9%,var(--n-2))] px-3 py-2 text-[length:var(--fs-text-sm)] text-err"
          >
            {error}
          </p>
        ) : null}
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
