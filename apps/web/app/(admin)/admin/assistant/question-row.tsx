'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MessageCircleQuestion, Sparkles, UserRound } from 'lucide-react';
import type { AssistantQuestion, AssistantQuestionContext } from '@ayman/contracts/assistant/questions';
import { copy } from '@ayman/contracts/copy/admin';
import { Badge } from '@ayman/ui/components/badge';
import { Card, CardBody } from '@ayman/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ayman/ui/components/dialog';
import { cn } from '@ayman/ui/lib/cn';
import { questionContextAction } from './actions';

const c = copy.admin.assistantQuestions;

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * One row of «أسئلة الطلبة», and the dialog it opens onto.
 *
 * ## Why the row is a button and not a plain card
 *
 * The list already shows the question and the answer in full — nothing about
 * clicking a row reveals text that was hidden. What it reveals is CONTEXT:
 * what else this student asked around the same time, and — for the rows that
 * matter most — whether the escalation to «كلّم م. أيمن» actually became a
 * real conversation, with a direct link into the inbox to find out. Before
 * this, an escalated row that never turned into a conversation was
 * indistinguishable from one that did; the only way to know was to
 * cross-reference `/admin/inbox` by name and guess at the time.
 *
 * ## Fetched on open, not with the list
 *
 * The list can be 50 rows; the context call does two extra queries per
 * question (siblings + the nearest conversation). Paying that cost for every
 * row on every page load would be fifty queries nobody asked for, for a
 * detail the admin looks at on a handful of rows per sitting.
 */
export function QuestionRow({ row }: { row: AssistantQuestion }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<AssistantQuestionContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && context === null && !loading) {
      setLoading(true);
      setError(null);
      questionContextAction(row.id)
        .then((result) => {
          if (result.ok) setContext(result.data);
          else setError(result.message);
        })
        .finally(() => setLoading(false));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
      <button type="button" className="block w-full text-start">
        <Card className="transition-colors duration-[160ms] ease-out hover:border-accent/40">
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[length:var(--fs-text-xs)] text-fg-muted">
              <span className="flex items-center gap-1.5">
                <UserRound className="size-3.5" aria-hidden="true" />
                {row.studentName ?? c.visitor}
              </span>
              <span>{timeFormatter.format(new Date(row.askedAt))}</span>
              <span
                className={cn('flex items-center gap-1.5', row.provider ? 'text-fg-muted' : 'text-fg-faint')}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                {row.provider ? c.byModel : c.byScript}
              </span>
              {row.escalated ? <EscalationBadge row={row} className="ms-auto" /> : null}
            </div>

            <p className="flex gap-2 text-[length:var(--fs-text-sm)] font-medium leading-[1.7] text-fg">
              <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="wrap-anywhere">{row.question}</span>
            </p>

            {/* The answer is the smaller half on purpose: this screen is read
                to find out what was ASKED. */}
            <p className="whitespace-pre-wrap wrap-anywhere rounded-lg border border-line-subtle bg-surface-2 px-3 py-2 text-[length:var(--fs-text-xs)] leading-[1.75] text-fg-muted">
              {row.answer}
            </p>
          </CardBody>
        </Card>
      </button>
      </DialogTrigger>

      <DialogContent closeLabel={copy.admin.common.close}>
        <DialogHeader>
          <DialogTitle>{c.detailTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <QuestionCard row={row} />

          {row.escalated ? <ConversationLine row={row} conversationId={context?.conversation?.id ?? row.conversationId} /> : null}

          <div>
            <p className="mb-2 text-[length:var(--fs-text-sm)] font-medium text-fg">{c.siblingsTitle}</p>

            {row.isGuest ? (
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.siblingsGuestNote}</p>
            ) : loading ? (
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">…</p>
            ) : error ? (
              <p className="text-[length:var(--fs-text-xs)] text-[color:var(--err)]">{error}</p>
            ) : context && context.siblings.length === 0 ? (
              <p className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.siblingsEmpty}</p>
            ) : context ? (
              <ul className="flex flex-col gap-2">
                {context.siblings.map((sibling) => (
                  <li key={sibling.id}>
                    <QuestionCard row={sibling} compact />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuestionCard({ row, compact = false }: { row: AssistantQuestion; compact?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border border-line-subtle p-3',
        compact ? 'bg-surface-2' : 'bg-surface-1',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--fs-text-xs)] text-fg-muted">
        <span>{timeFormatter.format(new Date(row.askedAt))}</span>
        {row.escalated ? <EscalationBadge row={row} /> : null}
      </div>
      <p className="text-[length:var(--fs-text-sm)] font-medium text-fg">{row.question}</p>
      <p className="whitespace-pre-wrap wrap-anywhere text-[length:var(--fs-text-xs)] text-fg-muted">{row.answer}</p>
    </div>
  );
}

/**
 * The signal this whole feature exists to surface: an escalation that never
 * became a real conversation looks different — and reads more urgently —
 * than one that did.
 */
function EscalationBadge({ row, className }: { row: AssistantQuestion; className?: string }) {
  if (row.isGuest) {
    return (
      <span className={cn('rounded-full border border-line px-2 py-0.5 font-medium text-fg-muted', className)}>
        {c.guestUnreachable}
      </span>
    );
  }
  if (row.conversationId) {
    return (
      <Badge tone="ok" className={className}>
        {c.hasConversation}
      </Badge>
    );
  }
  return (
    <Badge tone="warn" className={className}>
      {c.needsAttention}
    </Badge>
  );
}

function ConversationLine({
  row,
  conversationId,
}: {
  row: AssistantQuestion;
  conversationId: string | null | undefined;
}) {
  if (row.isGuest) return null;
  if (!conversationId) {
    return <p className="text-[length:var(--fs-text-sm)] font-medium text-[color:var(--warn)]">{c.needsAttention}</p>;
  }
  return (
    <Link
      href={`/admin/inbox/${conversationId}`}
      className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-[length:var(--fs-text-sm)] font-medium text-accent-text hover:bg-accent/20"
    >
      {c.openConversation}
    </Link>
  );
}
