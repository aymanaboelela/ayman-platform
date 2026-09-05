'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import { Textarea } from '@ayman/ui/components/textarea';
import type { ActionResult } from './actions';

/**
 * Anything Zod-shaped that can judge `{ reason }` — `RejectBookOrderSchema` or
 * `DeleteBookOrderSchema`, both passed in by the caller rather than imported
 * here.
 *
 * Structural, not `ZodType`, for one reason: the contracts package pulls Zod
 * through its own `@ayman/contracts/zod` wrapper, and typing the prop against
 * `zod`'s own exported class would tie this dialog to the two being the exact
 * same build forever. All this component needs is «قول لي إيه الغلط», which is
 * this shape.
 */
export interface ReasonSchema {
  safeParse(input: unknown):
    | { success: true }
    | { success: false; error: { issues: readonly { message: string }[] } };
}

/**
 * «اكتب السبب» — ONE dialog behind both «ارفض الطلب» and «احذف الطلب».
 *
 * ## Why it is shared, and not two dialogs that look alike
 *
 * The two differ in exactly three things: their words, their endpoint, and who
 * reads the text afterwards. Everything else — a required reason, the same
 * minimum length, the same 300-character ceiling, the same "don't submit an
 * empty box" rule — is identical, and identical validation living in two files
 * is validation that drifts. The first time one of them gains a `.trim()` the
 * other does not, the admin gets «اكتب سبب واضح» on one screen and a 400 with a
 * constraint name on the other.
 *
 * ## The reason is NOT optional, and it is NOT truncated
 *
 * `window.confirm` cannot take text, which is why this exists at all — but the
 * important half is that the box is judged by the CONTRACT the server will
 * judge it by (`schema`, passed in), so the message the admin reads here is the
 * message the API would have sent. The textarea deliberately carries no
 * `maxLength`: silently swallowing the 301st character of a sentence somebody
 * is writing for a student to read is worse than telling them it is too long,
 * so the counter turns red and the button locks instead.
 *
 * ## Colour
 *
 * A real, labelled, destructive button — `variant="danger"` — not an icon in a
 * ghost. Both of these actions are ones an admin should have to mean.
 */
export function ReasonDialog({
  triggerLabel,
  title,
  hint,
  reasonLabel,
  placeholder,
  submitLabel,
  submittingLabel,
  failedMessage,
  onSubmit,
  schema,
  disabled = false,
}: {
  triggerLabel: string;
  title: string;
  hint: string;
  reasonLabel: string;
  placeholder: string;
  submitLabel: string;
  submittingLabel: string;
  /** Shown as a toast when the action itself fails, distinct from the field
   *  error the schema produces before anything is sent. */
  failedMessage: string;
  onSubmit: (reason: string) => Promise<ActionResult>;
  schema: ReasonSchema;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /* The trimmed value is what is judged and what is sent — a box holding three
     spaces is an empty box, and the schema's own `.trim()` would otherwise
     accept it here and reject it on the server. */
  const value = reason.trim();
  const parsed = schema.safeParse({ reason: value });
  const invalid = !parsed.success;

  async function submit() {
    const checked = schema.safeParse({ reason: value });
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? failedMessage);
      return;
    }
    setError(null);
    setPending(true);
    const result = await onSubmit(value);
    setPending(false);
    if (result.ok) {
      toast.success(copy.admin.common.saved);
      setOpen(false);
      setReason('');
      return;
    }
    /* In the dialog AND as a toast: the dialog stays open on failure (the text
       the admin just wrote is still in it), so an error that only appeared
       behind it would be an error nobody saw. */
    setError(result.message || failedMessage);
    toast.error(result.message || failedMessage);
  }

  return (
    <>
      <Button
        type="button"
        variant="danger"
        disabled={disabled || pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {pending ? submittingLabel : triggerLabel}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent closeLabel={copy.admin.actions.cancel}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {/* The hint is the whole safety of both actions — one says the
              student reads this text verbatim, the other says the row is
              hidden rather than erased — so it sits in a tinted panel above
              the field rather than as grey small print under it. */}
          <p className="rounded-sm border border-line-subtle bg-surface-3 px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            {hint}
          </p>

          <label className="mt-3 flex flex-col gap-1.5 text-[length:var(--fs-text-sm)] text-fg">
            {reasonLabel}
            <Textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError(null);
              }}
              placeholder={placeholder}
              rows={3}
              aria-label={reasonLabel}
              aria-invalid={value.length > 0 && invalid ? true : undefined}
            />
          </label>

          {/* Digits only, deliberately: a counter is the one label that needs
              no translating, and there is no copy key for one. */}
          <p
            className={
              value.length > 300
                ? 'mt-1 text-[length:var(--fs-text-xs)] text-err'
                : 'mt-1 text-[length:var(--fs-text-xs)] text-fg-faint'
            }
            dir="ltr"
          >
            {value.length}/300
          </p>

          {error ? (
            <p role="alert" aria-live="polite" className="mt-1 text-[length:var(--fs-text-xs)] text-err">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {copy.admin.actions.cancel}
            </Button>
            <Button type="button" variant="danger" onClick={submit} disabled={pending || invalid}>
              {pending ? submittingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
