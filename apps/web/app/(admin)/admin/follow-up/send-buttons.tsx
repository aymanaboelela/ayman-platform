'use client';

import { useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
// `import type`, so this module never loads `outreach/follow-up` at runtime:
// that file builds Zod schemas, and this one is a client component. The one
// VALUE it needs from there — the per-press ceiling — arrives as a prop from
// the server page instead. Same reasoning as `client-barrel.test.ts`'s second
// rule, applied a route earlier than it is enforced.
import type { FollowUpQuery, IdleQuery } from '@ayman/contracts/outreach/follow-up';
import { Button } from '@ayman/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ayman/ui/components/dialog';
import {
  sendAllFollowUpAction,
  sendAllSubscribeAction,
  sendFollowUpAction,
  sendSubscribeAction,
  type SendOutcome,
} from './actions';

const c = copy.admin.followUp;

/**
 * Turns one press into one sentence.
 *
 * ## Why a skip is not an error toast, and not silence either
 *
 * Three of the four numbers the API returns are SUCCESSFUL non-sends — the
 * message was already sent, the student is at their daily ceiling, or they were
 * written to this week. Reporting any of them as a failure would teach the
 * admin to re-press until something breaks; reporting none of them would let
 * «ابعت للكل» answer «اتبعت لـ ٠ طالب» with no explanation of why. So each one
 * gets its own line, and the bulk path adds them up.
 */
function report(outcome: SendOutcome, bulk: boolean): void {
  if (!outcome.ok) {
    toast.error(c.sendFailed);
    return;
  }

  if (bulk) {
    const skipped = outcome.duplicate + outcome.capped + outcome.cooled;
    if (outcome.sent === 0) {
      toast(skipped > 0 ? c.sentAllNone : formatCopy(c.sentAll, { sent: 0 }));
      return;
    }
    toast.success(
      skipped > 0
        ? `${formatCopy(c.sentAll, { sent: outcome.sent })} ${formatCopy(c.sentAllSkipped, { skipped })}`
        : formatCopy(c.sentAll, { sent: outcome.sent }),
    );
    return;
  }

  if (outcome.sent > 0) toast.success(c.sentOne);
  else if (outcome.duplicate > 0) toast(c.sentDuplicate);
  else if (outcome.capped > 0) toast(c.sentCapped);
  // Everything zero means the student left the selection between the page load
  // and the press — a good outcome, and the only one worth its own sentence.
  else toast(c.sentNotListed);
}

/** The per-row button. One student, no dialog — see `BroadcastForm`'s own note
 *  on why a single recipient does not earn a confirmation step. */
export function SendRowButton({
  input,
}: {
  input: { kind: 'follow-up'; userId: string; courseId: string; window: number } | { kind: 'subscribe'; userId: string };
}) {
  const [sending, start] = useTransition();

  return (
    <Button
      type="button"
      size="sm"
      disabled={sending}
      onClick={() =>
        start(async () => {
          const outcome =
            input.kind === 'follow-up'
              ? await sendFollowUpAction({
                  userId: input.userId,
                  courseId: input.courseId,
                  window: input.window,
                })
              : await sendSubscribeAction({ userId: input.userId });
          report(outcome, false);
        })
      }
      className="gap-1.5"
    >
      <Send className="size-4 shrink-0" aria-hidden="true" />
      {sending ? c.sending : c.send}
    </Button>
  );
}

/**
 * «ابعت للكل» — behind a dialog that restates the number, exactly as
 * `/admin/broadcast` does for «كل الطلبة».
 *
 * The count shown is the `rowCount` the page was rendered with, not a fresh
 * read: the server re-resolves the filter anyway when the press lands, so a
 * second read here would only add a number that can also be stale. What the
 * dialog owes the admin is the ORDER OF MAGNITUDE and the fact that the
 * cooldown will trim it, and it says both.
 */
export function SendAllButton({
  count,
  max,
  query,
}: {
  count: number;
  /** `OUTREACH_SEND_ALL_MAX`, passed rather than imported — see the note on
   *  the type-only import at the top of this file. */
  max: number;
  query: { kind: 'follow-up'; value: FollowUpQuery } | { kind: 'subscribe'; value: IdleQuery };
}) {
  const [open, setOpen] = useState(false);
  const [sending, start] = useTransition();

  if (count === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="secondary" className="gap-1.5" onClick={() => setOpen(true)}>
        <Send className="size-4 shrink-0" aria-hidden="true" />
        {c.sendAll}
      </Button>
      <DialogContent closeLabel={copy.common.close}>
        <DialogHeader>
          <DialogTitle>{c.confirmTitle}</DialogTitle>
          <DialogDescription>
            {formatCopy(c.confirmBody, { count })}
            {count > max ? ` ${formatCopy(c.confirmCap, { max })}` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            disabled={sending}
            onClick={() =>
              start(async () => {
                const outcome =
                  query.kind === 'follow-up'
                    ? await sendAllFollowUpAction(query.value)
                    : await sendAllSubscribeAction(query.value);
                report(outcome, true);
                setOpen(false);
              })
            }
          >
            {sending ? c.sending : c.confirmSend}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              {c.confirmCancel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
