import Link from 'next/link';
import { MessageSquareText, Phone, Send, UserRound } from 'lucide-react';
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
  unread: c.filterUnread,
  open: c.filterOpen,
  answered: c.filterAnswered,
  closed: c.filterClosed,
  all: c.filterAll,
};

/**
 * `/admin/inbox` — every question a HUMAN asked him.
 *
 * `adminGet` (uncached), like every other admin list: a cached admin read is
 * indistinguishable from a lost write, and this is the screen where a student
 * is waiting on the other end.
 *
 * ## What this screen no longer is
 *
 * It had a second half — «اللي بعتّه», the threads the platform opened in his
 * name — as a tab above the status filters. It is gone, and the API has no
 * `scope` parameter any more: automated messages live at `/admin/outreach`,
 * which shows each one with the facts it was composed from. The exception he
 * asked for is in the API's `INBOX_WHERE`: an automated thread a student
 * ANSWERED is a conversation, and it appears here like any other.
 *
 * ## The default filter is «غير مقروءة», not «الكل» and no longer «محتاجة رد»
 *
 * The screen exists to surface what he has not seen. Opening a thread is what
 * clears it — that is the whole of the change — and the sidebar badge counts
 * exactly this list, so the number and the screen cannot disagree.
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

      {/*
        Where the automated half went. One line, because a screen that quietly
        stopped showing something owes its reader a sentence — and because the
        first question «فين اللي بعتّه؟» otherwise has no answer anywhere on
        the page.
      */}
      <p className="mt-1 flex flex-wrap items-center gap-1 text-[length:var(--fs-text-xs)] text-fg-faint">
        <Send className="size-3" aria-hidden="true" />
        {c.systemNote}
        <Link
          href="/admin/outreach"
          className="text-accent-text underline-offset-2 hover:underline"
        >
          {c.systemLink}
        </Link>
      </p>

      {/* Real tabs, not a `<select>`: five options, and which one is active is
          the single most useful thing this header can say at a glance. */}
      <nav className="mt-4 flex flex-wrap gap-1.5">
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
                  A STRETCHED LINK, not a `<Link>` wrapped round the card.

                  The whole row still opens the thread — that large target is
                  what a tired thumb needs and the decision has not changed —
                  but the name inside it is now its own link into the student's
                  record, and an `<a>` inside an `<a>` is invalid HTML that
                  browsers resolve by dropping one of them. So the card is a
                  plain container, the «المحادثة» button carries
                  `after:absolute after:inset-0` to claim the whole area, and
                  the name sits above it on `relative z-10`.
                */}
                <div
                  className={cn(
                    'relative flex items-start gap-3 rounded-xl border bg-surface-2 p-4',
                    'transition-colors duration-[160ms] ease-out hover:border-accent/50',
                    'focus-within:border-accent/50',
                    row.unreadForAdmin ? 'border-accent/40' : 'border-line',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-10 shrink-0 place-items-center rounded-lg',
                      row.origin === 'outreach'
                        ? 'bg-accent/20 text-accent-text'
                        : row.isGuest
                          ? 'bg-[color-mix(in_oklch,var(--e-tint),transparent_86%)] text-[color:var(--e-ink)]'
                          : 'bg-accent/12 text-accent-text',
                    )}
                  >
                    {/* Three states, three glyphs: a stranger, a student's
                        question, and a thread the platform opened that they
                        then answered. */}
                    {row.origin === 'outreach' ? (
                      <Send className="size-5" />
                    ) : row.isGuest ? (
                      <UserRound className="size-5" />
                    ) : (
                      <MessageSquareText className="size-5" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/*
                        «لو ضغطت على الاسم بتاع الشخص أقدر إني أدخل البروفايل
                        الشخصي بتاعه». A guest has no record to open and stays
                        plain text — a link that 404s would be worse than none.
                      */}
                      {row.userId ? (
                        <Link
                          href={`/admin/students/${row.userId}`}
                          title={c.openProfile}
                          className={cn(
                            'relative z-10 text-[length:var(--fs-text-base)] font-semibold text-fg',
                            // A DOTTED underline at rest, not only on hover.
                            // Half these names are links and half are not, and
                            // hover cannot tell them apart on a phone — a name
                            // that opens a record has to look different from
                            // one that does not before it is touched.
                            'underline decoration-dotted decoration-fg-faint underline-offset-4',
                            'hover:text-accent-text hover:decoration-solid hover:decoration-current',
                          )}
                        >
                          {row.who}
                        </Link>
                      ) : (
                        <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">
                          {row.who}
                        </span>
                      )}
                      <InboxStatusChip status={row.status} unread={row.unreadForAdmin} />
                      {row.origin === 'outreach' ? (
                        <span className="rounded-full border border-accent/40 bg-accent/12 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-accent-text">
                          {c.outreachBadge}
                        </span>
                      ) : null}
                      {/*
                        The rows worth looking at first: the platform wrote to
                        someone and they answered. It is also the ONLY reason
                        an automated thread is on this screen at all.
                      */}
                      {row.origin === 'outreach' && row.hasVisitorReply ? (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg">
                          {c.repliedBadge}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                        {row.isGuest ? c.guestBadge : c.studentBadge}
                      </span>
                    </div>

                    {crumbs.length > 0 ? (
                      <span className="mt-1 block text-[length:var(--fs-text-xs)] text-fg-muted">
                        {/* What they were reading when they gave up — the whole
                            reason `entryPath` is stored. */}
                        {c.pathLabel} {crumbs.join(' ← ')}
                      </span>
                    ) : null}

                    <span className="mt-1.5 block line-clamp-2 text-[length:var(--fs-text-sm)] text-fg">
                      {/* «إنت:» when the last word in the thread was his own —
                          otherwise a row where he already replied reads as a
                          student saying something he has not answered. */}
                      {row.previewAuthor === 'admin' ? (
                        <span className="text-fg-muted">{c.previewYou} </span>
                      ) : null}
                      {row.preview}
                    </span>

                    {row.guestPhone ? (
                      <span className="mono mt-1.5 flex items-center gap-1.5 text-[length:var(--fs-mono-label)] text-fg-muted">
                        <Phone className="size-3" aria-hidden="true" />
                        {row.guestPhone}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <time
                      dateTime={row.lastMessageAt}
                      className="mono text-[length:var(--fs-mono-label)] text-fg-faint"
                    >
                      {inboxTimeFormatter.format(new Date(row.lastMessageAt))}
                    </time>
                    <Link
                      href={`/admin/inbox/${row.id}`}
                      className={cn(
                        'rounded-md bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)]',
                        'font-medium text-[#1A1206]',
                        // Claims the whole card as the tap target — see above.
                        'after:absolute after:inset-0 after:rounded-xl after:content-[""]',
                      )}
                    >
                      {c.threadTitle}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
