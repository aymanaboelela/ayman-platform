'use client';

import { useState } from 'react';
import { toast } from 'sonner';
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
import type { ActionResult } from '@/app/(admin)/admin/courses/actions';

/**
 * A destructive action behind a dialog that names its consequence.
 *
 * The course-level buttons use `window.confirm`, which cannot state a number.
 * Deleting a lesson twelve students have watched destroys twelve progress
 * rows, and «متأكد؟» does not say so. `consequence` is that sentence, rendered
 * only when there IS one — a confirmation that always warns teaches the
 * instructor to click through it without reading.
 */
export function ConfirmButton({
  label,
  title,
  body,
  consequence,
  className,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  consequence?: string | null;
  className?: string;
  onConfirm: () => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    const result = await onConfirm();
    setPending(false);
    setOpen(false);
    if (result.ok) {
      toast.success(copy.admin.actions.delete);
    } else {
      // The API's 409 for "this has student attempts" arrives here as a full
      // Arabic sentence naming the constraint, not a status code.
      toast.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={className}
          // `stopPropagation`, NOT `preventDefault`.
          //
          // The trigger can sit inside a <summary>, which toggles on any click
          // within it, so the click must not reach the summary. But
          // `preventDefault()` cancels the click's default action for the whole
          // propagation path — including Radix's own trigger behaviour, so the
          // dialog never opened at all. Caught by the E2E: the row's delete
          // button did nothing and the failure pointed at the dialog assertion.
          //
          // Stopping propagation keeps the summary from seeing the click while
          // leaving Radix's handler on THIS element free to run.
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </button>
      </DialogTrigger>
      {/* `closeLabel` is required, not optional — the dialog's own X button is
          icon-only and would otherwise reach a screen reader unnamed. */}
      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        {consequence ? (
          <p className="text-[length:var(--fs-text-sm)] text-err">{consequence}</p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" size="sm">
              {copy.admin.common.cancel}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() => void run()}
          >
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
