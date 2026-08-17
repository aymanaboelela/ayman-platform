import Link from 'next/link';
import { Check, Eye, MessageSquareReply } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui';
import { cn } from '@ayman/ui/lib/cn';
import { listResponse } from '@ayman/contracts/admin/list';
import { SiteSettingsSchema } from '@ayman/contracts/admin/settings';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import {
  OUTREACH_LOG_FILTERS,
  OutreachLogFilterSchema,
  OutreachLogRowSchema,
  OutreachPreviewSchema,
  OutreachStatsSchema,
  type OutreachLogFilter,
  type OutreachLogRow,
} from '@ayman/contracts/outreach/admin';
import type { OutreachKind } from '@ayman/contracts/outreach/kinds';
import { adminGet } from '@/lib/admin-api';
import { AymanAvatar } from '@/components/assistant/ayman-avatar';
import { OutreachSettingsForm } from './outreach-settings-form';

const c = copy.admin.outreach;
const RowsSchema = listResponse(OutreachLogRowSchema);

export const metadata = { title: c.title };

const KIND_LABELS: Record<OutreachKind, string> = {
  quiz_result: c.kindQuizResult,
  quiz_nudge: c.kindQuizNudge,
  lesson_praise: c.kindLessonPraise,
  whatsapp_invite: c.kindWhatsappInvite,
};

const FILTER_LABELS: Record<OutreachLogFilter, string> = {
  all: c.filterAll,
  ...KIND_LABELS,
};

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * `/admin/outreach` — every word the platform has said in the instructor's
 * name.
 *
 * ## Why this screen exists
 *
 * Because a system that writes to students as someone owes that someone a
 * place to read all of it. Nothing else on the platform can show him: the
 * inbox's «اللي بعتّه» tab shows the THREADS, but a thread is a conversation
 * and this is a record — every message, its full text, and the facts it was
 * composed from, so he can check that what went out was true.
 *
 * ## The order of the sections, which is the design
 *
 * What was said → does it sound like me → do I want it to keep happening. A
 * settings page that led with the switches would be asking him to configure
 * something he had never seen; leading with the log means the toggles at the
 * bottom are a decision about evidence he has just read.
 *
 * `adminGet` throughout, never a `'use cache'` loader: an admin reading his
 * own outreach from a cache is indistinguishable from a message that never
 * went out.
 */
export default async function AdminOutreachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  // Through the schema, not `as`: this lands in a query string the API
  // re-validates, and junk should read as the default rather than as an error
  // page.
  const filter = OutreachLogFilterSchema.parse(raw ?? undefined);

  const [log, stats, preview, settings] = await Promise.all([
    adminGet(`/api/admin/outreach?filter=${filter}`, RowsSchema),
    adminGet('/api/admin/outreach/stats', OutreachStatsSchema),
    adminGet('/api/admin/outreach/preview', OutreachPreviewSchema),
    adminGet('/api/admin/settings', SiteSettingsSchema),
  ]);

  return (
    <>
      <header className="mb-6">
        <p className="text-[length:var(--fs-mono-label)] uppercase tracking-wide text-accent-text">
          {c.eyebrow}
        </p>
        <h1 className="mt-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
        <p className="mt-1.5 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
          {c.lead}
        </p>
      </header>

      {/*
        Four numbers, and the fourth is the only one that means anything on its
        own: «ردّوا عليك». Sent and seen say the machinery works; replies say
        the messages did.
      */}
      <dl className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={c.statSent} value={stats.sent} />
        <Stat label={c.statRecent} value={stats.sentRecent} />
        <Stat label={c.statSeen} value={stats.seen} />
        <Stat label={c.statReplied} value={stats.replied} hint={c.statRepliedHint} accent />
      </dl>

      {/*
        The one rule on this screen that SUBTRACTS work, so it is the one that
        has to be stated. Without it the first question it produces — «ليه
        مبعتش عن امتحان امبارح؟» — has no answer anywhere in the product.
      */}
      {stats.activeSince ? (
        <p className="-mt-4 mb-8 text-[length:var(--fs-text-xs)] text-fg-muted">
          {formatCopy(c.activeSince, {
            date: timeFormatter.format(new Date(stats.activeSince)),
          })}
        </p>
      ) : null}

      <section className="mb-8">
        <h2 className="text-[length:var(--fs-title-4)] font-semibold text-fg">{c.logTitle}</h2>

        <nav className="mt-3 flex flex-wrap gap-1.5">
          {OUTREACH_LOG_FILTERS.map((option) => (
            <Link
              key={option}
              href={`/admin/outreach?filter=${option}`}
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

        {log.rowCount === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-12 text-center">
            <p className="text-[length:var(--fs-title-4)] font-medium text-fg">{c.logEmpty}</p>
            <p className="mx-auto mt-2 max-w-[34rem] text-[length:var(--fs-text-sm)] text-fg-muted">
              {c.logEmptyHint}
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {log.rows.map((row) => (
              <SentMessage key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{c.previewTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-4 max-w-[var(--w-prose)] text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
            {c.previewLead}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {preview.samples.map((sample, index) => (
              <article
                // Index is a legitimate key here: the list is a fixed-length
                // rendering of a pure function, never reordered and never
                // filtered.
                key={`${sample.kind}-${index}`}
                className="rounded-lg border border-line bg-surface-2 p-4"
              >
                <p className="mb-2 flex items-center gap-2 text-[length:var(--fs-text-xs)] text-fg-muted">
                  <span className="rounded-full border border-line px-2 py-0.5">
                    {KIND_LABELS[sample.kind]}
                  </span>
                  {formatCopy(c.previewSample, { n: (index % 3) + 1 })}
                </p>
                <MessageBody body={sample.body} />
              </article>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card className="max-w-[var(--w-prose)]">
        <CardHeader>
          <CardTitle>{c.settingsTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-5 text-[length:var(--fs-text-sm)] leading-[1.75] text-fg-muted">
            {c.settingsLead}
          </p>
          <OutreachSettingsForm defaultValues={settings.outreach} />
        </CardBody>
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        accent ? 'border-accent/35 bg-accent/8' : 'border-line bg-surface-2',
      )}
    >
      <dt className="text-[length:var(--fs-text-xs)] text-fg-muted">{label}</dt>
      <dd
        className={cn(
          'mono mt-1 text-[length:var(--fs-title-3)] font-semibold',
          accent ? 'text-accent-text' : 'text-fg',
        )}
      >
        {value}
      </dd>
      {hint ? (
        <p className="mt-1 text-[length:var(--fs-text-xs)] text-fg-faint">{hint}</p>
      ) : null}
    </div>
  );
}

/** One sent message: who, why, the words, and whether it landed. */
function SentMessage({ row }: { row: OutreachLogRow }) {
  return (
    <li className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <AymanAvatar size="sm" />
        <span className="text-[length:var(--fs-text-base)] font-semibold text-fg">
          {row.studentName}
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
          {KIND_LABELS[row.kind]}
        </span>

        {/* Two independent facts, not one status: a message can be read and
            unanswered, and only the second is worth celebrating. */}
        {row.seen ? (
          <Flag icon={Eye} label={c.seen} />
        ) : (
          <span className="text-[length:var(--fs-text-xs)] text-fg-faint">{c.unseen}</span>
        )}
        {row.replied ? <Flag icon={MessageSquareReply} label={c.replied} accent /> : null}

        <time
          dateTime={row.createdAt}
          className="mono ms-auto text-[length:var(--fs-mono-label)] text-fg-faint"
        >
          {timeFormatter.format(new Date(row.createdAt))}
        </time>
      </div>

      <p className="mt-2 text-[length:var(--fs-text-xs)] text-fg-muted">
        <span className="text-fg-faint">{c.whyLabel} </span>
        {reasonFor(row)}
      </p>

      <div className="mt-3 rounded-lg border border-line-subtle bg-surface-1 p-3.5">
        <MessageBody body={row.body} />
      </div>

      <Link
        href={`/admin/inbox/${row.conversationId}`}
        className="mt-3 inline-flex min-h-11 items-center text-[length:var(--fs-text-sm)] text-accent-text hover:underline"
      >
        {c.openThread}
      </Link>
    </li>
  );
}

function Flag({
  icon: Icon,
  label,
  accent = false,
}: {
  icon: typeof Check;
  label: string;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--fs-text-xs)]',
        accent ? 'border-accent/40 bg-accent/12 text-accent-text' : 'border-line text-fg-muted',
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * `whitespace-pre-wrap`, everywhere a body is shown.
 *
 * The messages are written in paragraphs with a bulleted list of topics in the
 * middle. Collapsed to one run of text that list becomes a wall — and this
 * screen exists so he can judge whether the writing sounds like him, which is
 * a judgement he cannot make about text rendered differently from how the
 * student saw it.
 *
 * ⚠️ AND `wrap-anywhere` WITH IT. `pre-wrap` wraps at SPACES and nowhere else,
 * so one long token cannot break and pushes the box wider than its column.
 * These messages carry a WhatsApp link — measured, 53 characters with no space
 * in them — and it made this card 432px wide inside a 378px column on a phone:
 * 57px hanging off the inline start, with no scroll container anywhere above
 * it, so the text was unreachable rather than merely ugly.
 *
 * ⚠️ `wrap-anywhere` (`overflow-wrap: anywhere`), NOT `break-words`
 * (`overflow-wrap: break-word`) — and the difference is the whole fix. Measured
 * on the broken page, in the browser, one style at a time:
 *
 *   as shipped                 card 432px, inline-start −57  (broken)
 *   + overflow-wrap: break-word   card 432px, inline-start −57  (NO CHANGE)
 *   + overflow-wrap: anywhere     card 338px, inline-start  37  (fixed)
 *
 * `break-word` breaks the line but does NOT reduce the element's min-content
 * contribution, so the auto-sized column keeps reserving the whole URL's width.
 * `anywhere` reduces it, which is what lets the column shrink. Reaching for the
 * obvious `break-words` here would have shipped a change that did nothing.
 *
 * Neither is `break-all`, which would also break ordinary Arabic words.
 */
function MessageBody({ body }: { body: string }) {
  return (
    <p className="whitespace-pre-wrap wrap-anywhere text-[length:var(--fs-text-sm)] leading-[1.8] text-fg">
      {body}
    </p>
  );
}

/**
 * WHY this message was sent, from the facts snapshot rather than from the
 * message text.
 *
 * Reading the reason back out of the prose would be guessing at what the
 * composer meant; `facts` is what it was actually handed.
 */
function reasonFor(row: OutreachLogRow): string {
  switch (row.facts.kind) {
    case 'quiz_result': {
      const reason = formatCopy(c.whyQuizResult, {
        quiz: row.facts.quizTitle,
        score: row.facts.scorePercent,
      });
      const topics = row.facts.weakTopics
        .map((topic) => topic.name)
        .filter((name): name is string => name !== null);
      return topics.length > 0
        ? `${reason} — ${formatCopy(c.whyFocus, { topics: topics.join('، ') })}`
        : reason;
    }
    case 'quiz_nudge':
      return formatCopy(c.whyQuizNudge, { lesson: row.facts.lessonTitle });
    case 'lesson_praise':
      return formatCopy(c.whyLessonPraise, { lesson: row.facts.lessonTitle });
    case 'whatsapp_invite':
      return c.whyWhatsappInvite;
  }
}
