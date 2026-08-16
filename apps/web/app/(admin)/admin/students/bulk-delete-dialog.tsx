'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import type { AdminStudentRow, AdminStudentBulkDeleteFailure } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
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
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { Textarea } from '@ayman/ui/components/textarea';
import { toast } from 'sonner';
import { bulkDeleteStudentsAction } from './actions';

const c = copy.admin.students;

/** How many accounts the body lists by name before it summarises the rest. */
const NAMED_LIMIT = 8;

const FAILURE_COPY: Record<AdminStudentBulkDeleteFailure['reason'], string> = {
  self: c.bulkDeleteReasonSelf,
  'last-admin': c.bulkDeleteReasonLastAdmin,
  'authored-content': c.bulkDeleteReasonAuthored,
  'not-found': c.bulkDeleteReasonMissing,
};

export interface BulkDeleteDialogProps {
  /** The selected rows, in the order they appear in the table. */
  rows: AdminStudentRow[];
  /** Called with the ids that must STAY selected — the ones that refused. */
  onDone: (keepSelected: string[]) => void;
}

/**
 * مسح مجموعة من قائمة الطلبة.
 *
 * ## The confirmation is a word, not an email
 *
 * The single-account dialog makes the operator retype that account's address,
 * because the id in the URL is unreadable and the email is the only thing in
 * the flow that says WHICH account. Twenty addresses cannot do that job — it
 * would be transcription, not verification, and the first thing anyone would
 * do is paste them.
 *
 * So the two halves of the confirmation are split. WHICH is answered by the
 * body: every account is listed by name and email, right there, above the
 * button. THAT-I-MEANT-IT is answered by typing «امسح» — a word the operator
 * cannot produce by pressing Enter on a focused dialog, which is the actual
 * accident this guards against.
 *
 * ## Failures stay selected
 *
 * A run that deletes nineteen of twenty leaves the one that refused ticked,
 * with its reason named in the toast. The next action is then obvious and the
 * operator never has to reconstruct a selection by hand to find the row that
 * did not go.
 */
export function BulkDeleteDialog({ rows, onDone }: BulkDeleteDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const named = rows.slice(0, NAMED_LIMIT);
  const rest = rows.length - named.length;

  // The same two conditions the server enforces: the word must match, and the
  // reason must be long enough for `AdminStudentBulkDeleteSchema` (min 8) to
  // accept it. Checked here so the button is honest about being disabled,
  // never INSTEAD of there.
  const ready = confirmWord.trim() === c.bulkDeleteConfirmWord && reason.trim().length >= 8;

  function reset() {
    setConfirmWord('');
    setReason('');
    setError(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await bulkDeleteStudentsAction(
        rows.map((row) => row.id),
        reason.trim(),
      );

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOpen(false);
      reset();

      /*
       * ONE toast, whichever way the run went. Two — a success and an error —
       * would stack for the ordinary partial case and make the operator read
       * the same outcome twice to piece it together.
       *
       * The description names every refused account and why. «مقدرناش نمسح
       * البعض» would leave them to work out which of twenty rows is still
       * there, which is the whole question they have at that moment.
       */
      const refusals = result.failed.map(
        (failure) => `${failure.name || failure.userId} — ${FAILURE_COPY[failure.reason]}`,
      );

      if (result.deleted.length > 0) {
        toast.success(formatCopy(c.bulkDeleteSuccess, { n: result.deleted.length }), {
          description:
            refusals.length > 0
              ? [formatCopy(c.bulkDeletePartial, { n: refusals.length }), ...refusals].join('\n')
              : undefined,
        });
      } else {
        toast.error(c.bulkDeleteNoneDeleted, { description: refusals.join('\n') });
      }

      onDone(result.failed.map((failure) => failure.userId));
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="danger" className="gap-2">
          <Trash2 className="size-4" aria-hidden="true" />
          {c.bulkDelete}
        </Button>
      </DialogTrigger>

      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{formatCopy(c.bulkDeleteTitle, { n: rows.length })}</DialogTitle>
          <DialogDescription>{c.bulkDeleteBody}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
              {c.bulkDeleteListLabel}
            </p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-[var(--r-md)] border border-line bg-surface-2 p-2.5">
              {named.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline gap-x-2 text-[length:var(--fs-text-sm)] text-fg"
                >
                  <span className="font-medium">{row.fullName}</span>
                  {/* The PHONE, not the email: this list exists so an
                      operator can confirm they are destroying the right
                      accounts, and a phone-only student has no address to
                      show. Every row here comes from a student profile, where
                      the number is NOT NULL. */}
                  <span dir="ltr" className="text-[length:var(--fs-text-xs)] text-fg-muted">
                    {row.phone}
                  </span>
                </li>
              ))}
              {rest > 0 ? (
                <li className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  {formatCopy(c.bulkDeleteListMore, { n: rest })}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-delete-reason">{c.bulkDeleteReason}</Label>
            <Textarea
              id="bulk-delete-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              required
              placeholder={c.bulkDeleteReasonPlaceholder}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-delete-confirm">{c.bulkDeleteConfirmLabel}</Label>
            <Input
              id="bulk-delete-confirm"
              value={confirmWord}
              onChange={(event) => setConfirmWord(event.target.value)}
              autoComplete="off"
              // The dialog's own submit is a button, not a form: Enter in this
              // field must not be a way to complete the operation.
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault();
              }}
            />
          </div>

          {error ? (
            <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {copy.admin.actions.cancel}
          </Button>
          <Button type="button" variant="danger" disabled={!ready || pending} onClick={submit}>
            {pending ? copy.admin.actions.saving : c.bulkDeleteConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
