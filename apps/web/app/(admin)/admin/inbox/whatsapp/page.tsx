import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BellRing, MessageCircle, PauseCircle, UserRound, Users } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { listResponse } from '@ayman/contracts/admin/list';
import { WA_CHAT_FILTERS, WaChatFilterSchema, WaChatRowSchema, type ChatWho } from '@ayman/contracts/wa-bot/schemas';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { ListPager } from '@/components/admin/list-controls';
import { InboxTabs } from '../inbox-tabs';

const c = bot.admin;
const RowsSchema = listResponse(WaChatRowSchema);
const PER_PAGE = 50;

export const metadata = { title: c.inboxTitle };

const time = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const WHO_ICON: Record<ChatWho, typeof UserRound> = { student: UserRound, parent: Users, lead: MessageCircle };
const WHO_TONE: Record<ChatWho, string> = { student: 'var(--a-9)', parent: 'var(--info)', lead: 'var(--ok)' };

/**
 * «واتساب» — what the bot handed to a person, and every chat on the linked
 * number. «محتاجة رد» first: those are the questions somebody is waiting on.
 */
export default async function WhatsappInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getEntitlements())['whatsapp.bot']) notFound();

  const params = await searchParams;
  const rawFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const filter = WaChatFilterSchema.catch('handoff').parse(rawFilter || undefined);
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number(rawPage) || 1);

  const { rows, rowCount } = await adminGet(
    `/api/admin/wa-bot/chats?filter=${filter}&page=${page}&perPage=${PER_PAGE}`,
    RowsSchema,
  );

  return (
    <>
      <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{c.inboxTitle}</h1>
      <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{c.inboxLead}</p>

      <InboxTabs active="/admin/inbox/whatsapp" />

      <nav className="mt-4 flex flex-wrap gap-1.5">
        {WA_CHAT_FILTERS.map((option) => (
          <Link
            key={option}
            href={option === 'handoff' ? '?' : `?filter=${option}`}
            aria-current={option === filter ? 'page' : undefined}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-[length:var(--fs-text-sm)]',
              option === filter
                ? 'border-[color-mix(in_oklch,var(--ok),transparent_40%)] bg-[color-mix(in_oklch,var(--ok),transparent_86%)] text-[color:var(--ok)]'
                : 'border-line text-fg-muted hover:text-fg',
            )}
          >
            {c.inboxFilter[option]}
          </Link>
        ))}
        <Link
          href="/admin/marketing/bot"
          className="ms-auto rounded-lg px-3 py-1.5 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
        >
          {c.openBot}
        </Link>
      </nav>

      {rows.length === 0 ? (
        <AdminEmpty spot="inbox" title={c.inboxEmpty} hint={c.inboxEmptyHint} />
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5">
          {rows.map((row) => {
            const Icon = WHO_ICON[row.who];
            return (
              <li key={row.id}>
                <div
                  className={cn(
                    'relative flex items-start gap-3 rounded-xl border bg-surface-2 p-4',
                    'transition-colors duration-[160ms] ease-out hover:border-accent/50',
                    row.needsHuman
                      ? 'border-[color-mix(in_oklch,var(--warn),transparent_45%)]'
                      : row.unread
                        ? 'border-accent/40'
                        : 'border-line',
                  )}
                >
                  <span
                    aria-hidden="true"
                    style={{ ['--tone' as string]: WHO_TONE[row.who] }}
                    className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklch,var(--tone),transparent_82%)] text-[color:var(--tone)]"
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-fg">{row.name ?? row.pushName ?? row.phone}</span>
                      <span className="mono text-[length:var(--fs-mono-label)] text-fg-muted" dir="ltr">
                        {row.phone}
                      </span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                        {c.who[row.who]}
                      </span>
                      {row.needsHuman ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--warn),transparent_85%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] font-medium text-[color:var(--warn)]">
                          <BellRing className="size-3" aria-hidden="true" />
                          {c.needsHuman}
                        </span>
                      ) : null}
                      {row.unread ? (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-accent-text">
                          {c.unreadChip}
                        </span>
                      ) : null}
                      {row.botPaused ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
                          <PauseCircle className="size-3" aria-hidden="true" />
                          {c.botPausedChip}
                        </span>
                      ) : null}
                      {row.optedOut ? (
                        <span className="rounded-full bg-[color-mix(in_oklch,var(--err),transparent_86%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
                          {c.optedOutChip}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[length:var(--fs-text-sm)] text-fg">
                      {row.previewAuthor !== 'contact' ? (
                        <span className="text-fg-muted">{c.authors[row.previewAuthor]}: </span>
                      ) : null}
                      {row.preview}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <time dateTime={row.lastMessageAt} className="mono text-[length:var(--fs-mono-label)] text-fg-faint">
                      {time.format(new Date(row.lastMessageAt))}
                    </time>
                    <Link
                      href={`/admin/inbox/whatsapp/${row.id}`}
                      className={cn(
                        'rounded-md bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]',
                        'after:absolute after:inset-0 after:rounded-xl after:content-[""]',
                      )}
                    >
                      {c.openChat}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ListPager
        page={page}
        perPage={PER_PAGE}
        rowCount={rowCount}
        labels={{ previous: c.pagerPrevious, next: c.pagerNext, of: c.pagerOf }}
      />
    </>
  );
}
