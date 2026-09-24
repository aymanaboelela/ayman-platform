'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Check, Copy, Trash2, Undo2 } from 'lucide-react';
import type { AdminUnlockCodeRow } from '@ayman/contracts/admin/unlock-codes';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
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
import { deleteUnlockCodeAction, revokeUnlockCodeAction, type ActionResult } from './actions';
import { copyText } from './clipboard';

const c = copy.admin.unlockCodes;

/**
 * The copy button beside a code. `compact` is the icon-only square the table
 * uses; the mobile card and the «الكود جاهز» ticket spell the word out,
 * because there the button is a row of its own and an unlabelled square reads
 * as decoration.
 */
export function CopyCodeButton({
  code,
  compact = false,
  className,
}: {
  code: string;
  compact?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function run() {
    if (!(await copyText(code))) {
      toast.error(c.errorGeneric);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={run}
      aria-label={copied ? c.copied : c.copy}
      title={copied ? c.copied : c.copy}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-medium',
        'transition-colors duration-[160ms] ease-out',
        compact ? 'size-9 md:size-8' : 'h-10 px-3 text-[length:var(--fs-text-sm)] md:h-8',
        copied
          ? 'border-[color-mix(in_oklab,var(--ok)_45%,var(--border))] bg-[color-mix(in_oklab,var(--ok)_12%,var(--n-2))] text-ok'
          : 'border-line bg-surface-3 text-fg-muted hover:border-accent/50 hover:text-accent-text',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {compact ? null : copied ? c.copied : c.copy}
    </button>
  );
}

/**
 * «إلغاء» / «سحب» / «حذف» on one code — each behind a confirm, because two of
 * the three take something away from a student who already has it, and the
 * third cannot be undone.
 *
 * What a row offers follows `redeemedAt`, not only `status`: the API deletes
 * any code nobody typed, INCLUDING one already cancelled, so a revoked-unused
 * row keeps its «حذف» and a revoked-used one — history — offers nothing.
 */
export function CodeRowActions({ row }: { row: AdminUnlockCodeRow }) {
  const neverUsed = row.redeemedAt === null;
  const student = row.redeemedBy?.name ?? c.deletedStudent;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {row.status === 'unused' ? (
        <ConfirmAction
          trigger={
            <>
              <Ban className="size-4" aria-hidden="true" />
              {c.revoke}
            </>
          }
          triggerTone="warn"
          title={formatCopy(c.revokeTitle, { code: row.code })}
          body={c.revokeBodyUnused}
          confirm={c.revokeConfirm}
          done={c.revokeDone}
          run={() => revokeUnlockCodeAction(row.id)}
        />
      ) : null}
      {row.status === 'used' ? (
        <ConfirmAction
          trigger={
            <>
              <Undo2 className="size-4" aria-hidden="true" />
              {c.revokeUsed}
            </>
          }
          triggerTone="err"
          title={formatCopy(c.revokeTitle, { code: row.code })}
          body={formatCopy(c.revokeBodyUsed, { student })}
          confirm={c.revokeUsedConfirm}
          done={c.revokeUsedDone}
          run={() => revokeUnlockCodeAction(row.id)}
        />
      ) : null}
      {neverUsed ? (
        <ConfirmAction
          trigger={
            <>
              <Trash2 className="size-4" aria-hidden="true" />
              {c.delete}
            </>
          }
          triggerTone="err"
          title={formatCopy(c.deleteTitle, { code: row.code })}
          body={c.deleteBody}
          confirm={c.deleteConfirm}
          done={c.deleteDone}
          run={() => deleteUnlockCodeAction(row.id)}
        />
      ) : null}
    </div>
  );
}

const TRIGGER_TONE = {
  warn: 'border-[color-mix(in_oklab,var(--warn)_45%,var(--border))] bg-[color-mix(in_oklab,var(--warn)_10%,var(--n-2))] text-warn hover:bg-[color-mix(in_oklab,var(--warn)_18%,var(--n-2))]',
  err: 'border-[color-mix(in_oklab,var(--err)_45%,var(--border))] bg-[color-mix(in_oklab,var(--err)_9%,var(--n-2))] text-err hover:bg-[color-mix(in_oklab,var(--err)_16%,var(--n-2))]',
} as const;

function ConfirmAction({
  trigger,
  triggerTone,
  title,
  body,
  confirm,
  done,
  run,
}: {
  trigger: ReactNode;
  triggerTone: keyof typeof TRIGGER_TONE;
  title: string;
  body: string;
  confirm: string;
  done: string;
  run: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function go() {
    setPending(true);
    const result = await run();
    setPending(false);
    if (result.ok) {
      setOpen(false);
      toast.success(done);
      router.refresh();
    } else {
      // The dialog stays open: the admin is still looking at the code they
      // meant to act on, and can press again once the throttle clears.
      toast.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 md:h-8',
            'text-[length:var(--fs-text-sm)] font-medium transition-colors duration-[160ms] ease-out',
            TRIGGER_TONE[triggerTone],
          )}
        >
          {trigger}
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              {c.back}
            </Button>
          </DialogClose>
          <Button variant="danger" onClick={go} disabled={pending}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
