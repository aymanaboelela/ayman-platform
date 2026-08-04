import Link from 'next/link';
import { CornerUpRight, Phone, UserRound } from 'lucide-react';
import { copy } from '@ayman/contracts';
import { AdminConversationDetailSchema } from '@ayman/contracts/assistant/conversation';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { assistantPathLabels } from '@/lib/assistant-path';
import { InboxStatusChip, inboxTimeFormatter } from '../status-chip';
import { ThreadActions } from './thread-actions';

const c = copy.assistant.inbox;

export const metadata = { title: c.threadTitle };

/**
 * One conversation, and the box to answer it in.
 *
 * `adminGet` is uncached (`no-store`), so opening this always shows the
 * current thread — and the GET itself marks it read on the server, which is
 * why there is no separate "mark read" call for the client to forget.
 */
export default async function AdminInboxThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const thread = await adminGet(`/api/admin/conversations/${id}`, AdminConversationDetailSchema);
  const crumbs = assistantPathLabels(thread.entryPath);

  return (
    <>
      <Link
        href="/admin/inbox"
        className="mb-4 inline-flex items-center gap-1.5 text-[length:var(--fs-text-sm)] text-fg-muted transition-colors duration-[160ms] ease-out hover:text-fg"
      >
        <CornerUpRight className="size-3.5" aria-hidden="true" />
        {c.title}
      </Link>

      {/* Who, and how to reach them — the header answers both before he reads
          a word of the conversation. */}
      <header className="rounded-xl border border-line bg-surface-2 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-lg',
              thread.isGuest
                ? 'bg-[color-mix(in_oklch,var(--v-9),transparent_86%)] text-[color:var(--v-11)]'
                : 'bg-accent/12 text-accent-text',
            )}
          >
            <UserRound className="size-5" />
          </span>
          <span className="text-[length:var(--fs-title-4)] font-semibold text-fg">{thread.who}</span>
          <InboxStatusChip status={thread.status} unread={thread.unreadForAdmin} />
          <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {thread.isGuest ? c.guestBadge : c.studentBadge}
          </span>
        </div>

        <dl className="mt-3 grid gap-2 text-[length:var(--fs-text-sm)] sm:grid-cols-2">
          <div>
            <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.contactLabel}</dt>
            <dd className="mono mt-0.5 flex items-center gap-1.5 text-fg">
              <Phone className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
              {/*
                A guest's number, or nothing. A signed-in student's phone is on
                their profile and is deliberately not duplicated here — see the
                serializer: the inbox must not become a second, staler copy of
                the student record.
              */}
              {thread.guestPhone ?? c.noPhone}
            </dd>
          </div>
          {crumbs.length > 0 ? (
            <div>
              <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.pathLabel}</dt>
              <dd className="mt-0.5 text-fg">{crumbs.join(' ← ')}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <ol className="mt-5 flex flex-col gap-3">
        {thread.messages.map((message) => {
          const fromVisitor = message.author === 'visitor';
          return (
            <li
              key={message.id}
              className={cn('flex flex-col gap-1', fromVisitor ? 'items-start' : 'items-end')}
            >
              <span className="px-1 text-[length:var(--fs-text-xs)] text-fg-faint">
                {fromVisitor ? thread.who : copy.assistant.thread.ayman}
              </span>
              <div
                className={cn(
                  'max-w-[min(38rem,85%)] whitespace-pre-wrap rounded-2xl px-4 py-3',
                  'text-[length:var(--fs-text-sm)] leading-[1.75]',
                  fromVisitor
                    ? 'rounded-ss-md border border-line bg-surface-2 text-fg'
                    : 'rounded-se-md bg-accent text-[#1A1206]',
                )}
              >
                {/* A TEXT node. Visitor-supplied prose never becomes markup on
                    this screen — there is no HTML sink on this path at all. */}
                {message.body}
              </div>
              <time
                dateTime={message.createdAt}
                className="mono px-1 text-[length:var(--fs-mono-label)] text-fg-faint"
              >
                {inboxTimeFormatter.format(new Date(message.createdAt))}
              </time>
            </li>
          );
        })}
      </ol>

      <ThreadActions id={thread.id} status={thread.status} />
    </>
  );
}
