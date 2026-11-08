'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Check, Copy, ImageIcon, RotateCcw, Trash2, X, type LucideIcon } from 'lucide-react';
import type { AdminReservation } from '@ayman/contracts/center-reservations';
import { reservationsCopy } from '@ayman/contracts/copy/center-reservations';
import { copy } from '@ayman/contracts/copy/admin';
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
import { Textarea } from '@ayman/ui/components/textarea';
import { cn } from '@ayman/ui/lib/cn';
import { ROW_BUTTON, ROW_BUTTON_TONE, tone } from '../centers-ui';
import { deleteReservationAction, reviewReservationAction } from './actions';

const a = reservationsCopy.admin;

function RowButton({
  color,
  icon: Icon,
  children,
  className,
  ...props
}: {
  color: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" style={tone(color)} className={cn(ROW_BUTTON, ROW_BUTTON_TONE, className)} {...props}>
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

/** «نسخ اللينك» — the public page's address, to paste into a post or a group. */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <RowButton
      color="var(--viz-3)"
      icon={copied ? Check : Copy}
      className="md:h-10"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error(a.actionFailed);
        }
      }}
    >
      {copied ? a.copied : a.copyLink}
    </RowButton>
  );
}

/** The transfer screenshot, large, in a dialog — a thumbnail is not enough to read an amount. */
export function ScreenshotButton({ src, title }: { src: string; title: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group relative block size-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-3"
          aria-label={a.screenshot}
        >
          <img src={src} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-[color-mix(in_oklab,var(--n-1)_75%,transparent)] py-1 text-fg">
            <ImageIcon className="size-4" aria-hidden="true" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent closeLabel={copy.admin.common.cancel} className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <img src={src} alt={a.screenshot} className="max-h-[75dvh] w-full rounded-lg object-contain" />
        <a href={src} target="_blank" rel="noreferrer" className="text-center text-[length:var(--fs-text-sm)] text-accent-text underline">
          {a.openFull}
        </a>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The decisions on one row. Which buttons show follows the status, so there
 * is never a button the API would refuse: «تأكيد» on anything not cancelled
 * («دفع كاش» when there is no screenshot), «رفض» only while it is waiting.
 */
export function ReservationActions({ reservation }: { reservation: AdminReservation }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { status } = reservation;

  async function run(action: Parameters<typeof reviewReservationAction>[1], why?: string) {
    setBusy(true);
    const result = await reviewReservationAction(reservation.id, action, why);
    setBusy(false);
    if (result.ok) {
      toast.success(a.status[action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : action === 'cancel' ? 'cancelled' : 'submitted']);
      setRejectOpen(false);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  }

  async function remove() {
    if (!window.confirm(a.deleteConfirm)) return;
    setBusy(true);
    const result = await deleteReservationAction(reservation.id);
    setBusy(false);
    if (result.ok) router.refresh();
    else toast.error(result.message);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== 'confirmed' && status !== 'cancelled' ? (
        <RowButton color="var(--ok)" icon={Check} disabled={busy} onClick={() => void run('confirm')}>
          {reservation.hasScreenshot ? a.confirm : a.confirmCash}
        </RowButton>
      ) : null}

      {status === 'submitted' || status === 'started' ? (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger asChild>
            <RowButton color="var(--err)" icon={X} disabled={busy}>
              {a.reject}
            </RowButton>
          </DialogTrigger>
          <DialogContent closeLabel={copy.admin.common.cancel} className="max-w-[460px]">
            <DialogHeader>
              <DialogTitle>{a.rejectSubmit}</DialogTitle>
              <DialogDescription>
                {reservation.fullName} — #{reservation.number}
              </DialogDescription>
            </DialogHeader>
            <label htmlFor={`reject-${reservation.id}`} className="text-[length:var(--fs-text-sm)] font-medium text-fg">
              {a.rejectReason}
            </label>
            <Textarea
              id={`reject-${reservation.id}`}
              value={reason}
              maxLength={300}
              rows={3}
              placeholder={a.rejectReasonPlaceholder}
              onChange={(event) => setReason(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="danger" disabled={busy} onClick={() => void run('reject', reason)}>
                {a.rejectSubmit}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {status === 'confirmed' || status === 'rejected' || status === 'cancelled' ? (
        <RowButton color="var(--info)" icon={RotateCcw} disabled={busy} onClick={() => void run('reopen')}>
          {a.reopen}
        </RowButton>
      ) : null}

      {status !== 'cancelled' ? (
        <RowButton color="var(--warn)" icon={Ban} disabled={busy} onClick={() => void run('cancel')}>
          {a.cancel}
        </RowButton>
      ) : null}

      <RowButton color="var(--n-9)" icon={Trash2} disabled={busy} onClick={() => void remove()}>
        {a.delete}
      </RowButton>
    </div>
  );
}
