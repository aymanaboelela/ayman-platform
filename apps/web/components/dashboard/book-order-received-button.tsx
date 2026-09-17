'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy';
import { cn } from '@ayman/ui/lib/cn';
import { apiPostVoid } from '@/lib/api';

const c = copy.books.mine;

/**
 * «استلمت الكتاب» — the student closing their own order.
 *
 * ## Why the student presses this and not the admin
 *
 * `delivered` was only ever reachable from the admin screen, which means the
 * date on it recorded when somebody at a desk got round to ticking a row — not
 * when the parcel arrived. The person who knows that is holding the book.
 *
 * It also gives the shipping desk the one number it never had: an order sitting
 * in «في الطريق» for two weeks with no confirmation is the one worth chasing
 * the courier about, and until now it looked exactly like one that arrived on
 * the second day.
 *
 * ## Why it is not a confirmation dialog
 *
 * Pressing it says something that already happened, and the cost of a misclick
 * is that an order closes a few days early — which the student can raise on the
 * support link that appears the moment it does. An «متأكد؟» in front of that is
 * a step for every honest press to pay for a mistake almost nobody makes.
 *
 * ## The refresh
 *
 * `router.refresh()` and not local state: the card's status chip, its note and
 * its «كلّم الدعم» link are all server-rendered from the same order, so the
 * honest way to show the new state is to let the server render it. See the
 * `staleTimes` note in `next.config` — a browser-side write owes a refresh on
 * this platform.
 *
 * ⚠️ The button is REMOVED by that refresh, because the card only renders it
 * for `shipped`. So there is no "already pressed" state to design — which is
 * also why a failure has to say so out loud, below.
 */
export function BookOrderReceivedButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);

  async function confirm(): Promise<void> {
    setSending(true);
    try {
      await apiPostVoid(`/api/book-orders/${orderId}/received`);
      toast.success(c.confirmReceivedDone);
      startTransition(() => router.refresh());
    } catch {
      /* ⚠️ A toast, not an inline error. The order is untouched and the student
         can press again in a second; an error that stays on the card would read
         as a problem with the ORDER rather than with one request. */
      toast.error(c.confirmReceivedFailed);
    } finally {
      setSending(false);
    }
  }

  const busy = sending || pending;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy}
        className={cn(
          'inline-flex min-h-11 items-center justify-center rounded-full px-4',
          'border border-accent/40 bg-accent/10 text-accent-text',
          'text-[length:var(--fs-text-sm)] font-semibold',
          'transition-colors duration-[160ms] ease-out hover:bg-accent/20',
          'disabled:opacity-60',
        )}
      >
        {busy ? c.confirmReceivedWorking : c.confirmReceived}
      </button>
      {/* Says what the button is FOR. Without it «استلمت الكتاب» beside «في
          الطريق» reads as a status the card is contradicting. */}
      <p className="mt-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
        {c.confirmReceivedHint}
      </p>
    </div>
  );
}
