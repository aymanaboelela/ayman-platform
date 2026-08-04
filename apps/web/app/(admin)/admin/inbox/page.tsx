import Link from 'next/link';
import { MessageSquareText, Phone, UserRound } from 'lucide-react';
import { copy } from '@ayman/contracts';
import {
  AdminConversationRowSchema,
  INBOX_FILTERS,
  InboxFilterSchema,
  type InboxFilter,
} from '@ayman/contracts/assistant/conversation';
import { listResponse } from '@ayman/contracts/admin/list';
import { cn } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { assistantPathLabels } from '@/lib/assistant-path';
import { InboxStatusChip, inboxTimeFormatter } from './status-chip';

const c = copy.assistant.inbox;
const RowsSchema = listResponse(AdminConversationRowSchema);

export const metadata = { title: c.title };

const FILTER_LABELS: Record<InboxFilter, string> = {
  open: c.filterOpen,
  answered: c.filterAnswered,
  closed: c.filterClosed,
  all: c.filterAll,
};

/**
 * `/admin/inbox` — every question المساعد could not answer.
 *
 * `adminGet` (uncached), like every other admin list: a cached admin read is
 * indistinguishable from a lost write, and this is the screen where a student
 * is waiting on the other end.
 *
 * The default filter is `open`, not `all`. The screen exists to surface what
 * still needs an answer; an all-threads-ever list buries that under everything
 * already dealt with, and the badge in the sidebar would then be pointing at a
 * page that does not obviously agree with it.
 */
export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  // Through the schema, not `as InboxFilter`: this value lands in a query
  // string the API re-validates, and a junk value should read as the default
  // rather than as an error page.
  const filter = InboxFilterSchema.parse(raw ?? undefined);

  const { rows, rowCount } = await adminGet(
    `/api/admin/conversations?filter=${filter}`,
    RowsSchema,
  );

  return (
    <>
      <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
        {c.eyebrow}
      </p>
      <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.subtitle}</p>

      {/* Real tabs, not a `<select>`: four options, and which one is active is
          the single most useful thing this header can say at a glance. */}
      <nav className="mt-5 flex flex-wrap gap-1.5">
        {INBOX_FILTERS.map((option) => (
          <Link
            key={option}
            href={`/admin/inbox?filter=${option}`}
            aria-current={option === filter ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[length:var(--fs-text-sm)]',
              'transition-colors duration-[160ms] ease-out',
              option === filter
                ? 'border-accent bg-accent text-[#1A1206]'
                : 'border-line text-fg-muted hover:border-accent/40 hover:text-fg',
            )}
          >
            {FILTER_LABELS[option]}
          </Link>
        ))}
      </nav>

      {rowCount === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
          <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.empty}</p>
          <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
            {c.emptyHint}
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => {
            const crumbs = assistantPathLabels(row.entryPath);
            return (
              <li key={row.id}>
                {/*
                  The whole row is the link, and it still carries a visible
                  action on the end. Both, deliberately: the large target is
                  what a tired thumb needs, and the button is what makes it
                  obvious the row goes somewhere.
                */}
                <Link
                  href={`/admin/inbox/${row.id}`}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border bg-surface-2 p-4',
                    'transition-colors duration-[160ms] ease-out hover:border-accent/50',
                    row.unreadForAdmin ? 'border-accent/40' : 'border-line',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-lg',
                      row.isGuest
                        ? 'bg-[color-mix(in_oklch,var(--v-9),transparent_86%)] text-[color:var(--v-11)]'
                        : 'bg-accent/12 text-accent-text',
                    )}
                  >
                    {row.isGuest ? (
                      <UserRound className="size-5" />
                    ) : (
                      <MessageSquareText className="size-5" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">
                        {row.who}
                      </span>
                      <InboxStatusChip status={row.status} unread={row.unreadForAdmin} />
                      <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                        {row.isGuest ? c.guestBadge : c.studentBadge}
                      </span>
                    </span>

                    {crumbs.length > 0 ? (
                      <span className="mt-1 block text-[length:var(--fs-text-xs)] text-fg-muted">
                        {/* What they were reading when they gave up — the whole
                            reason `entryPath` is stored. */}
                        {c.pathLabel} {crumbs.join(' ← ')}
                      </span>
                    ) : null}

                    <span className="mt-1.5 block line-clamp-2 text-[length:var(--fs-text-sm)] text-fg">
                      {row.preview}
                    </span>

                    {row.guestPhone ? (
                      <span className="mono mt-1.5 flex items-center gap-1.5 text-[length:var(--fs-mono-label)] text-fg-muted">
                        <Phone className="size-3" aria-hidden="true" />
                        {row.guestPhone}
                      </span>
                    ) : null}
                  </span>

                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <time
                      dateTime={row.lastMessageAt}
                      className="mono text-[length:var(--fs-mono-label)] text-fg-faint"
                    >
                      {inboxTimeFormatter.format(new Date(row.lastMessageAt))}
                    </time>
                    <span className="rounded-md bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]">
                      {c.threadTitle}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
