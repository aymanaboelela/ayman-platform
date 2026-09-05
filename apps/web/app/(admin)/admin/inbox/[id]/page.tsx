import Link from 'next/link';
import { CornerUpRight, MessageCircle, Phone, UserRound } from 'lucide-react';
import { copy } from '@ayman/contracts';
import {
  AdminConversationDetailSchema,
  assistantTranscriptTrimmed,
  parseAssistantTranscript,
} from '@ayman/contracts/assistant/conversation';
import { waMeHref } from '@ayman/contracts/whatsapp';
import { cn } from '@ayman/ui';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { assistantPathLabels } from '@/lib/assistant-path';
import { AssistantTranscript } from './assistant-transcript';
import { MessageBubble } from './message-bubble';
import { InboxStatusChip } from '../status-chip';
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
  const thread = await adminGetOrNotFound(`/api/admin/conversations/${id}`, AdminConversationDetailSchema);
  const crumbs = assistantPathLabels(thread.entryPath);
  /*
   * `null` when there is no number, and the button is then not rendered at
   * all — rather than an anchor to `https://wa.me/` that opens WhatsApp's
   * marketing page. `waMeHref` is the one place that conversion lives; see
   * `@ayman/contracts/whatsapp`.
   */
  const whatsapp = waMeHref(thread.contactPhone);

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
                ? 'bg-[color-mix(in_oklch,var(--e-tint),transparent_86%)] text-[color:var(--e-ink)]'
                : 'bg-accent/12 text-accent-text',
            )}
          >
            <UserRound className="size-5" />
          </span>
          {/*
            The name IS the way into the record — «لو ضغطت على الاسم بتاع
            الشخص أقدر إني أدخل البروفايل الشخصي بتاعه». `userId` has been on
            this shape since it was written, with a doc-comment saying it
            "links to their record"; nothing linked. A guest has no record and
            stays plain text.
          */}
          {thread.userId ? (
            <Link
              href={`/admin/students/${thread.userId}`}
              title={c.openProfile}
              className={cn(
                'text-[length:var(--fs-title-4)] font-semibold text-fg',
                // Dotted at rest — a name that opens a record must look
                // different from a guest's, which does not, before it is
                // touched. Same rule as the list.
                'underline decoration-dotted decoration-fg-faint underline-offset-4',
                'hover:text-accent-text hover:decoration-solid hover:decoration-current',
              )}
            >
              {thread.who}
            </Link>
          ) : (
            <span className="text-[length:var(--fs-title-4)] font-semibold text-fg">
              {thread.who}
            </span>
          )}
          <InboxStatusChip status={thread.status} unread={thread.unreadForAdmin} />
          <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
            {thread.isGuest ? c.guestBadge : c.studentBadge}
          </span>
          {/* `null` for a guest — see `hasActiveSubscription`'s own note on
              why that is neither badge rather than "مش مشترك". */}
          {thread.hasActiveSubscription !== null ? (
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium',
                thread.hasActiveSubscription
                  ? 'border-[oklch(0.62_0.15_150)]/40 bg-[oklch(0.62_0.15_150)]/12 text-[oklch(0.62_0.15_150)]'
                  : 'border-line text-fg-muted',
              )}
            >
              {thread.hasActiveSubscription ? c.subscribedBadge : c.notSubscribedBadge}
            </span>
          ) : null}
        </div>

        <dl className="mt-3 grid gap-2 text-[length:var(--fs-text-sm)] sm:grid-cols-2">
          <div>
            <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.contactLabel}</dt>
            <dd className="mono mt-0.5 flex items-center gap-1.5 text-fg">
              <Phone className="size-3.5 shrink-0 text-fg-faint" aria-hidden="true" />
              {/*
                A guest's typed number or a student's account phone — joined
                live in the same query, not copied. The LIST still shows
                neither for a student, and that rule has not changed; see
                `AdminConversationDetailSchema.contactPhone`.
              */}
              {thread.contactPhone ?? c.noPhone}
            </dd>
          </div>
          {crumbs.length > 0 ? (
            <div>
              <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{c.pathLabel}</dt>
              <dd className="mt-0.5 text-fg">{crumbs.join(' ← ')}</dd>
            </div>
          ) : null}
        </dl>

        {/*
          WhatsApp and not a phone call, asked for in as many words — «تقولي
          خيارين يكلمه واتساب يا أرن عليه. بس خليها واتساب أحسن». There is no
          `tel:` anywhere in this product and this is not the place to start.

          `rel="noreferrer"` with `target="_blank"`: the destination is another
          origin and there is nothing it needs to know about this one.

          Deliberately NOT wired to `recordWhatsappOpened()` — that is the
          student-side ping to `/api/profile/whatsapp-opened`, and firing it
          here would stamp `whatsappOpenedAt` on the INSTRUCTOR's profile,
          which is the column the outreach sweeper filters channel invites on.
        */}
        {whatsapp || thread.userId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {whatsapp ? (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-lg px-4',
                  'bg-[#25D366] text-[length:var(--fs-text-sm)] font-medium text-[#0B1F14]',
                  'transition-opacity duration-[160ms] ease-out hover:opacity-90',
                )}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {c.whatsapp}
              </a>
            ) : null}
            {thread.userId ? (
              <Link
                href={`/admin/students/${thread.userId}`}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4',
                  'text-[length:var(--fs-text-sm)] text-fg-muted',
                  'transition-colors duration-[160ms] ease-out hover:border-accent/40 hover:text-fg',
                )}
              >
                <UserRound className="size-4" aria-hidden="true" />
                {c.openProfile}
              </Link>
            ) : null}
          </div>
        ) : null}
      </header>

      {/*
        Each bubble is a CLIENT component now — «ردّ بإيموجي» needs a press
        handler, and a long press needs pointer events. Only the bubble
        crosses; the header, the crumbs and the actions below stay on the
        server.
      */}
      <ol className="mt-5 flex flex-col gap-4">
        {thread.messages.map((message) => {
          /*
            ── THE ASSISTANT TRANSCRIPT, told apart from the student's words ──

            A handoff out of المساعد writes the exchange into the thread as its
            own message, authored `visitor` because the enum has two members
            (see `serializeAssistantTranscript`). Parsed HERE, on the server,
            and drawn as a record rather than as a bubble — «محتاج أعرف هو سأل
            على إيه» is only answered if he can also tell which half of it a
            machine said.

            A body that does not parse is every message ever written before
            this format existed, and it falls through to the bubble untouched.
          */
          const turns = parseAssistantTranscript(message.body);
          if (turns) {
            return (
              <AssistantTranscript
                key={message.id}
                turns={turns}
                trimmed={assistantTranscriptTrimmed(message.body)}
                createdAt={message.createdAt}
              />
            );
          }
          return (
            <MessageBubble
              key={message.id}
              conversationId={thread.id}
              message={message}
              who={thread.who}
            />
          );
        })}
      </ol>

      <ThreadActions id={thread.id} status={thread.status} />
    </>
  );
}
