'use client';

import { useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { cn } from '@ayman/ui/lib/cn';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { Input } from '@ayman/ui/components/input';
import { Label } from '@ayman/ui/components/label';
import { useRefreshBookOrdersUnshippedCount } from '@/components/admin/book-orders-alerts';
import { formatEGP } from '@/lib/price';
import { uploadBookOrderScreenshot } from '@/lib/upload-client';
import { markBookOrderPaidAction } from './actions';

const c = copy.admin.books;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «سجّل الدفع» — the way out of «بدأ ومكملش الدفع».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ## What was missing
 *
 * That tab had no door. `address_only → paid` could only ever happen through
 * the PUBLIC flow — the student coming back and uploading a screenshot — so an
 * order paid on WhatsApp, in cash, or by a parent over the phone stayed there
 * forever: `markPrinting`, `markShipped` and the bulk ship all take `paid` rows
 * by name, so the parcel had no way to be sent at all. The only workaround was
 * deleting the row and re-typing it through «أضف طلب كتاب», which throws away
 * its date, its id and its history.
 *
 * ## One question, two answers
 *
 * «في الدفع ممكن يبقى دفع وممكن يبقى مجاني» — so it is ONE dialog with a
 * two-way choice, not two buttons on the row. The admin is answering «اتحصّل
 * منه إيه؟» once, and the answer decides what the row says afterwards:
 *
 *   - **فلوس** — the order keeps the number it was quoted at. The transfer
 *     details are OPTIONAL, same as the create dialog's: money that arrived in
 *     cash has no sender number and no screenshot to attach, and demanding one
 *     would push the admin back to the workaround this replaces.
 *   - **مجاني** — the basket is waived. The dialog names the number being given
 *     up before it is signed, because a giveaway is a real negative: the copies
 *     still cost what they cost and «مكسب الكتب» will show it.
 *
 * The two choices are labelled buttons and not a switch, unlike the create
 * dialog's «مجاني» toggle: there the default (a normal paid order) is the
 * overwhelming case and the switch is an exception. Here both answers are real
 * and neither is a default, so an unanswered switch would be a decision made by
 * whoever forgot to touch it.
 */
export function MarkOrderPaidDialog({
  id,
  /** What the order is quoted at right now — the number the money answer
   *  confirms, and the number the free answer gives up. */
  amountCents,
}: {
  id: string;
  amountCents: number;
}) {
  const refreshUnshippedCount = useRefreshBookOrdersUnshippedCount();
  const [open, setOpen] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [senderPhone, setSenderPhone] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setIsFree(false);
    setSenderPhone('');
    setFile(null);
    setError(null);
  }

  async function submit() {
    setPending(true);
    setError(null);

    /* Uploaded from the browser, exactly like `CreateBookOrderDialog` — a
       Server Action body is capped at 1 MB and a phone screenshot is routinely
       larger, so the file never goes through the action. Skipped entirely on a
       giveaway: there is no transfer to prove, and attaching a stale picture
       would be proof of a payment that did not happen. */
    let screenshotKey: string | null = null;
    if (!isFree && file) {
      const uploaded = await uploadBookOrderScreenshot(file);
      if (!uploaded.ok) {
        setPending(false);
        setError(c.createUploadFailed);
        return;
      }
      screenshotKey = uploaded.value.screenshotKey;
    }

    const result = await markBookOrderPaidAction(id, {
      isFree,
      senderPhone: !isFree && senderPhone.trim().length > 0 ? senderPhone.trim() : null,
      screenshotKey,
    });
    setPending(false);

    if (result.ok) {
      setOpen(false);
      reset();
      toast.success(copy.admin.common.saved);
      /* The row lands in the shipping queue, so the sidebar's «الكتب» badge is
         one higher than it was a moment ago — the same refresh every action
         that moves a row in or out of `paid` runs. */
      refreshUnshippedCount();
    } else {
      setError(result.message);
    }
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
        <Button
          type="button"
          /* Its own colour — «الفلوس وصلت» is the one button on an unpaid row
             that moves it forward, and it must not read as another neutral
             action beside «تعديل». */
          className="!bg-[oklch(0.62_0.15_150)] !text-white"
        >
          {c.markPaid}
        </Button>
      </DialogTrigger>

      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.markPaidDialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.markPaidHint}</p>

          <div>
            <p className="mb-1.5 text-[length:var(--fs-text-sm)] font-medium text-fg">
              {c.markPaidModeLabel}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: false, label: c.markPaidModeMoney },
                { value: true, label: c.markPaidModeFree },
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={isFree === option.value}
                  onClick={() => setIsFree(option.value)}
                  className={cn(
                    'rounded-sm border px-3 py-2 text-[length:var(--fs-text-sm)] transition-colors duration-[160ms] ease-out',
                    isFree === option.value
                      ? 'border-accent bg-accent/10 font-medium text-accent-text'
                      : 'border-line-subtle bg-surface-3 text-fg-muted hover:border-line-strong',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {isFree ? (
            <p className="rounded-sm border border-[color-mix(in_oklch,var(--warn),transparent_60%)] bg-[color-mix(in_oklch,var(--warn),transparent_90%)] px-3 py-2 text-[length:var(--fs-text-sm)] leading-relaxed text-fg">
              {formatCopy(c.markPaidFreeHint, { amount: formatEGP(amountCents) })}
            </p>
          ) : (
            <>
              <p className="mono text-[length:var(--fs-text-sm)] text-fg">
                {formatCopy(c.markPaidAmount, { amount: formatEGP(amountCents) })}
              </p>

              <div>
                <Label htmlFor={`book-pay-sender-${id}`}>{c.createSenderPhoneLabel}</Label>
                <Input
                  id={`book-pay-sender-${id}`}
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="01xxxxxxxxx"
                  value={senderPhone}
                  onChange={(event) => setSenderPhone(event.target.value)}
                />
              </div>

              <div>
                <Label htmlFor={`book-pay-screenshot-${id}`}>{c.createScreenshotLabel}</Label>
                <input
                  id={`book-pay-screenshot-${id}`}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <label
                  htmlFor={`book-pay-screenshot-${id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-line px-3 py-2 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-150 ease-out hover:border-accent/40"
                >
                  <ImagePlus className="size-4 shrink-0" aria-hidden="true" strokeWidth={2} />
                  {file ? file.name : c.createScreenshotHint}
                </label>
              </div>
            </>
          )}

          {error ? (
            <p role="alert" aria-live="polite" className="text-[length:var(--fs-text-xs)] text-err">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {copy.admin.actions.cancel}
            </Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? c.markPaidSubmitting : c.markPaidSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
