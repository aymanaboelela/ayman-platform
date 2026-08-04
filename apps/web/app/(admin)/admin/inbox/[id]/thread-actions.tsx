'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { CheckCircle2, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { copy } from '@ayman/contracts';
import {
  MESSAGE_MAX,
  type ConversationStatus,
} from '@ayman/contracts/assistant/conversation';
import { Button, Field, FieldLabel, Textarea } from '@ayman/ui';
import { replyAction, setStatusAction } from '../actions';

const c = copy.assistant.inbox;

/**
 * Answering and closing — the only two things this screen writes.
 *
 * Both go through Server Actions rather than a browser `fetch`, so the session
 * cookie and the CSRF header are `adminSend`'s problem rather than this
 * component's, and the revalidation that follows a write happens on the server
 * that performed it.
 *
 * ## Closing is a separate act from replying
 *
 * They are not combined into "reply and close", tempting as that is. A reply
 * usually invites another question — the visitor may follow up, which reopens
 * the thread — and a button that silently ended the conversation every time he
 * answered would make following up impossible without him noticing why.
 */
export function ThreadActions({ id, status }: { id: string; status: ConversationStatus }) {
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const isClosed = status === 'closed';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || message.trim().length === 0) return;

    startTransition(async () => {
      const result = await replyAction(id, message);
      if (result.ok) {
        // Cleared only on success: a failed send that also emptied the box
        // would lose what he wrote, which is the one outcome worse than the
        // failure itself.
        setMessage('');
        toast.success(c.reply);
        return;
      }
      toast.error(c.replyFailed);
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      const result = await setStatusAction(id, isClosed ? 'open' : 'closed');
      if (!result.ok) toast.error(c.replyFailed);
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
      {isClosed ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[length:var(--fs-text-sm)] text-fg-muted">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {c.closed}
          </p>
          <Button type="button" variant="secondary" disabled={pending} onClick={toggleStatus}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {c.reopen}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field name="reply">
            <FieldLabel htmlFor="inbox-reply">{c.replyLabel}</FieldLabel>
            <Textarea
              id="inbox-reply"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={c.replyPlaceholder}
              rows={4}
              required
              // The same ceiling the contract enforces, so the limit is felt
              // while typing rather than discovered on submit.
              maxLength={MESSAGE_MAX}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit" disabled={pending || message.trim().length === 0}>
              <Send className="size-4" aria-hidden="true" />
              {pending ? c.replying : c.reply}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={toggleStatus}>
              {pending ? c.closing : c.close}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
