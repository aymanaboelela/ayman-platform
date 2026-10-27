import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download, MessageCircle, UserCheck } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { BOT_INTENTS } from '@ayman/contracts/wa-bot/intents';
import { LEAD_STATUSES, LeadListSchema, LeadQuerySchema, type LeadStatus } from '@ayman/contracts/wa-bot/schemas';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { ListControl, ListPager } from '@/components/admin/list-controls';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { MarketingTabs } from '../tabs';
import { LeadNotes, LeadStatusSelect } from './lead-row-controls';
import { LeadSearch } from './lead-search';
import { STATUS_TONE } from './status-tone';

const c = bot.admin;

export const metadata = { title: c.leadsTitle };

const PER_PAGE = 50;
const time = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * «المهتمين» — every number that wrote to the WhatsApp number with no account
 * behind it, and what became of it.
 *
 * Rows rather than a bare table: each lead is a person with a question, so
 * each row carries what they asked (coloured chips), their own words, a status
 * that can be changed in place, a note, and the button that opens the chat.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await getEntitlements())['whatsapp.bot']) notFound();

  const params = await searchParams;
  const filters = LeadQuerySchema.catch({}).parse({
    status: first(params.status) || undefined,
    intent: first(params.intent) || undefined,
    year: first(params.year) || undefined,
    q: first(params.q) || undefined,
  });
  const page = Math.max(1, Number(first(params.page)) || 1);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, String(value));
  const exportQuery = query.toString();
  query.set('page', String(page));
  query.set('perPage', String(PER_PAGE));

  const list = await adminGet(`/api/admin/wa-bot/leads?${query}`, LeadListSchema);
  const total = LEAD_STATUSES.reduce((sum, status) => sum + list.counts[status], 0);

  return (
    <>
      <MarketingTabs />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.leadsTitle}</h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.leadsLead}</p>
        </div>
        <a
          href={`/api/admin/wa-bot/leads.csv${exportQuery ? `?${exportQuery}` : ''}`}
          download
          className={cn(
            'inline-flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-1.5',
            'text-[length:var(--fs-text-sm)] font-medium text-fg',
            'transition-colors duration-[160ms] ease-out hover:border-line-strong hover:bg-surface-3',
          )}
        >
          <Download className="size-4 text-fg-muted" aria-hidden="true" />
          {c.exportCsv}
        </a>
      </div>

      {/* One tile per status, each a filter — the first question on this
          screen is «كام واحد اشترك؟», answered before any row is read. */}
      <nav aria-label={c.statsAria} className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile href={hrefWith(exportQuery, 'status', null)} active={!filters.status} label={c.statTotal} value={total} tone="accent" />
        {LEAD_STATUSES.map((status) => (
          <StatTile
            key={status}
            href={hrefWith(exportQuery, 'status', status)}
            active={filters.status === status}
            label={c.statuses[status]}
            value={list.counts[status]}
            tone={STATUS_TONE[status]}
          />
        ))}
      </nav>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <ListControl
          name="year"
          label={c.filterYear}
          value={filters.year ?? ''}
          options={[{ value: '', label: c.filterAll }, ...list.yearOptions]}
        />
        <ListControl
          name="intent"
          label={c.filterIntent}
          value={filters.intent ?? ''}
          options={[
            { value: '', label: c.filterAll },
            ...BOT_INTENTS.filter((i) => i !== 'greeting' && i !== 'thanks').map((intent) => ({
              value: intent,
              label: bot.labels[intent],
            })),
          ]}
        />
        <LeadSearch initial={filters.q ?? ''} />
      </div>

      {list.rows.length === 0 ? (
        <AdminEmpty spot="people" title={c.leadsEmpty} hint={c.leadsEmptyHint} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {list.rows.map((lead) => (
            <li
              key={lead.id}
              className={cn(
                'rounded-xl border bg-surface-2 p-4',
                lead.needsHuman ? 'border-[color-mix(in_oklch,var(--warn),transparent_50%)]' : 'border-line',
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklch,var(--ok),transparent_85%)] text-[color:var(--ok)]"
                >
                  <MessageCircle className="size-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mono text-[length:var(--fs-text-base)] font-semibold text-fg" dir="ltr">
                      {lead.phone}
                    </span>
                    {lead.pushName ? (
                      <span className="text-[length:var(--fs-text-sm)] text-fg-muted">{lead.pushName}</span>
                    ) : null}
                    {lead.yearLabel ? (
                      <span className="rounded-full border border-[color-mix(in_oklch,var(--info),transparent_60%)] bg-[color-mix(in_oklch,var(--info),transparent_90%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-[color:var(--info)]">
                        {lead.yearLabel}
                      </span>
                    ) : null}
                    {lead.userId ? (
                      <Link
                        href={`/admin/students/${encodeURIComponent(lead.userId)}`}
                        className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_oklch,var(--ok),transparent_60%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-[color:var(--ok)] hover:underline"
                      >
                        <UserCheck className="size-3" aria-hidden="true" />
                        {c.signedUp}
                      </Link>
                    ) : null}
                    {lead.needsHuman ? (
                      <span className="rounded-full border border-[color-mix(in_oklch,var(--warn),transparent_60%)] bg-[color-mix(in_oklch,var(--warn),transparent_90%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-[color:var(--warn)]">
                        {c.needsHuman}
                      </span>
                    ) : null}
                  </div>

                  {lead.intents.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {lead.intents.map((intent) => (
                        <span
                          key={intent}
                          className="rounded-full bg-accent/12 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-accent-text"
                        >
                          {(bot.labels as Record<string, string>)[intent] ?? intent}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <dl className="mt-2 grid gap-1 text-[length:var(--fs-text-sm)] sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-[length:var(--fs-text-xs)] text-fg-faint">
                        {c.colFirst} · <time dateTime={lead.firstMessageAt}>{time.format(new Date(lead.firstMessageAt))}</time>
                      </dt>
                      <dd className="line-clamp-2 text-fg">{lead.firstMessage}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[length:var(--fs-text-xs)] text-fg-faint">
                        {c.colLast} · <time dateTime={lead.lastMessageAt}>{time.format(new Date(lead.lastMessageAt))}</time> ·{' '}
                        {c.messagesCount.replace('{count}', String(lead.messageCount))}
                      </dt>
                      <dd className="line-clamp-2 text-fg">{lead.lastMessage}</dd>
                    </div>
                  </dl>

                  <LeadNotes id={lead.id} initial={lead.notes ?? ''} />
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-2">
                  <LeadStatusSelect id={lead.id} status={lead.status} />
                  <Link
                    href={`/admin/inbox/whatsapp/${lead.id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[length:var(--fs-text-sm)] font-medium text-[#1A1206]"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    {c.openChat}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ListPager
        page={page}
        perPage={PER_PAGE}
        rowCount={list.rowCount}
        labels={{ previous: c.pagerPrevious, next: c.pagerNext, of: c.pagerOf }}
      />
    </>
  );
}

function hrefWith(query: string, key: string, value: string | null): string {
  const next = new URLSearchParams(query);
  if (value === null) next.delete(key);
  else next.set(key, value);
  const out = next.toString();
  return out ? `?${out}` : '?';
}

function StatTile({
  href,
  active,
  label,
  value,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  value: number;
  tone: (typeof STATUS_TONE)[LeadStatus] | 'accent';
}) {
  const color = tone === 'accent' ? 'var(--a-9)' : `var(--${tone})`;
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      style={{ ['--tile' as string]: color }}
      className={cn(
        'rounded-xl border p-3 transition-colors duration-[160ms] ease-out',
        'border-[color-mix(in_oklch,var(--tile),transparent_65%)] bg-[color-mix(in_oklch,var(--tile),transparent_90%)]',
        active ? 'ring-2 ring-[color:var(--tile)]' : 'hover:bg-[color-mix(in_oklch,var(--tile),transparent_84%)]',
      )}
    >
      <span className="block text-[length:var(--fs-text-xs)] text-fg-muted">{label}</span>
      <span className="mono block text-[length:var(--fs-title-3)] font-semibold tabular-nums text-[color:var(--tile)]">
        {value}
      </span>
    </Link>
  );
}
