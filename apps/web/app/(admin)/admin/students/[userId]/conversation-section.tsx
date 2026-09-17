'use client';

import { useActionState, useRef } from 'react';
import Link from 'next/link';
import type { AdminStudentConversation } from '@ayman/contracts/admin/students';
import { copy } from '@ayman/contracts/copy/admin';
import { MESSAGE_MAX } from '@ayman/contracts/assistant/conversation';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import { cn } from '@ayman/ui/lib/cn';
import { messageStudentAction, type ActionResult } from '../actions';

const IDLE: ActionResult = { ok: true };
const c = copy.admin.students;

/** Western digits, day and hour, no year — the same rule every timestamp on
 *  this platform follows. Formatted on demand inside a client component is
 *  safe here (unlike `GradingPaper`'s header) because nothing renders it on
 *  the server: the list is client-rendered from the first paint. */
const stampFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export interface ConversationSectionProps {
  userId: string;
  conversation: AdminStudentConversation;
}

/**
 * «المحادثة» — the thread with this student, on their own record.
 *
 * ## Why it is here
 *
 * Reaching a student from their record meant reading their phone number off
 * the screen and opening WhatsApp; reaching them from the grading queue — the
 * screen where "who is this, and can I say something to them" actually comes
 * up — meant finding them by name in `/admin/inbox` first. The conversation is
 * the platform's own channel: the student sees it in the same المساعد panel
 * they already use, they can reply in it, and it emits the notification that
 * tells them it arrived. A WhatsApp message can promise none of that.
 *
 * ## A transcript and a box, not an inbox
 *
 * The last thirty messages, oldest first, and one composer. The full thread
 * lives at `/admin/inbox/:id` and this links to it when there is more —
 * building a second inbox inside a record page is how a product ends up with
 * two places to read the same conversation and an unread count that means two
 * things.
 *
 * ## The composer resets itself
 *
 * The `<form>` is reset from INSIDE the action on success, not by a
 * `useEffect` watching `state`: `IDLE` is `{ ok: true }`, so an effect would
 * fire on the very first render and clear a message being typed. Same pattern
 * as `SetPasswordSection` and the ban dialogs.
 */
export function ConversationSection({ userId, conversation }: ConversationSectionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async (_previous, formData) => {
      const result = await messageStudentAction(userId, conversation.conversationId, formData);
      if (result.ok) formRef.current?.reset();
      return result;
    },
    IDLE,
  );

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{c.conversationTitle}</CardTitle>
        {conversation.conversationId ? (
          <Link
            href={`/admin/inbox/${conversation.conversationId}`}
            className="text-[length:var(--fs-text-sm)] text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            {c.conversationOpenFull}
          </Link>
        ) : null}
      </CardHeader>

      <CardBody className="flex flex-col gap-3">
        {conversation.messages.length === 0 ? (
          <p className="text-[length:var(--fs-text-sm)] text-fg-muted">{c.conversationEmpty}</p>
        ) : (
          <>
            {conversation.truncated && conversation.conversationId ? (
              <Link
                href={`/admin/inbox/${conversation.conversationId}`}
                className="text-[length:var(--fs-text-xs)] text-fg-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {c.conversationTruncated}
              </Link>
            ) : null}

            {/*
              `max-h` + `overflow-y-auto`: this is a panel in a column of other
              panels, and thirty bubbles would push «سجل الحساب» below a fold
              that moves every time anyone sends a message. The scroll is on
              the transcript, never on the page.
            */}
            <ol className="flex max-h-[22rem] flex-col gap-2 overflow-y-auto">
              {conversation.messages.map((message) => (
                <li
                  key={message.id}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-lg border p-2.5',
                    // His own messages carry the accent, the student's stay
                    // neutral — the same direction-by-colour the inbox uses,
                    // so a transcript read in two places reads the same way.
                    message.author === 'admin'
                      ? 'border-accent/30 bg-accent/10'
                      : 'border-line bg-surface-3',
                  )}
                >
                  <span className="text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
                    {message.author === 'admin' ? c.conversationYou : c.conversationStudent}
                    {' · '}
                    <span className="tabular-nums">
                      {stampFormatter.format(new Date(message.createdAt))}
                    </span>
                  </span>
                  {/* `whitespace-pre-wrap`: a message is plain text the student
                      typed with their own line breaks, and collapsing them
                      turns a list of three questions into one paragraph. */}
                  <span className="whitespace-pre-wrap break-words text-[length:var(--fs-text-sm)] text-fg">
                    {message.body}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        <form ref={formRef} action={action} className="flex flex-col gap-2">
          <label className="sr-only" htmlFor="student-message">
            {c.messagePlaceholder}
          </label>
          <textarea
            id="student-message"
            name="body"
            rows={3}
            required
            maxLength={MESSAGE_MAX}
            placeholder={c.messagePlaceholder}
            className="w-full rounded-lg border border-line bg-surface-2 p-2.5 text-[length:var(--fs-text-sm)] text-fg"
          />
          <div className="flex items-center justify-between gap-2">
            {state.ok ? (
              <span aria-live="polite" className="text-[length:var(--fs-text-xs)] text-fg-muted" />
            ) : (
              <span aria-live="polite" className="text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
                {state.message}
              </span>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? c.messageSending : c.messageSend}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
