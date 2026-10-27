import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Bot, Smartphone, UserRound } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { WaChatDetailSchema, type WaChatMessage } from '@ayman/contracts/wa-bot/schemas';
import { cn } from '@ayman/ui/lib/cn';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { ChatControls } from './chat-controls';

const c = bot.admin;

export const metadata = { title: c.inboxTitle };

const time = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  timeZone: 'Africa/Cairo',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * One WhatsApp chat: everything said both ways, who said it — them, the bot,
 * the team from here, or somebody on the handset — and the box that answers
 * from the linked number.
 */
export default async function WhatsappChatPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getEntitlements())['whatsapp.bot']) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const chat = await adminGetOrNotFound(`/api/admin/wa-bot/chats/${encodeURIComponent(id)}`, WaChatDetailSchema);
  const title = chat.name ?? chat.pushName ?? chat.phone;

  return (
    <>
      <Link
        href="/admin/inbox/whatsapp"
        className="inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.back}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{title}</h1>
        <span className="mono text-fg-muted" dir="ltr">
          {chat.phone}
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted">
          {c.who[chat.who]}
        </span>
        {chat.yearLabel ? (
          <span className="rounded-full bg-[color-mix(in_oklch,var(--info),transparent_86%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-[color:var(--info)]">
            {chat.yearLabel}
          </span>
        ) : null}
        {chat.leadStatus ? (
          <Link
            href="/admin/marketing/leads"
            className="rounded-full bg-accent/12 px-2 py-0.5 text-[length:var(--fs-text-xs)] text-accent-text hover:underline"
          >
            {c.tabLeads} · {c.statuses[chat.leadStatus]}
          </Link>
        ) : null}
        {chat.userId ? (
          <Link
            href={`/admin/students/${encodeURIComponent(chat.userId)}`}
            className="rounded-full border border-line px-2 py-0.5 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg"
          >
            {c.openProfile}
          </Link>
        ) : null}
        {chat.optedOut ? (
          <span className="rounded-full bg-[color-mix(in_oklch,var(--err),transparent_86%)] px-2 py-0.5 text-[length:var(--fs-text-xs)] text-[color:var(--err)]">
            {c.optedOutChip}
          </span>
        ) : null}
      </div>

      {chat.silentUntil ? (
        <p className="mt-2 text-[length:var(--fs-text-sm)] text-fg-muted">
          {c.silentUntil.replace('{time}', time.format(new Date(chat.silentUntil)))}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="min-w-0 rounded-xl border border-line bg-surface-1 p-4">
          {chat.messages.length === 0 ? (
            <p className="text-center text-fg-muted">{c.noMessages}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {chat.messages.map((message) => (
                <Bubble key={message.id} message={message} />
              ))}
            </ol>
          )}
        </section>

        <ChatControls id={chat.id} needsHuman={chat.needsHuman} botPaused={chat.botPaused} />
      </div>
    </>
  );
}

function Bubble({ message }: { message: WaChatMessage }) {
  const ours = message.author !== 'contact';
  const Icon = message.author === 'bot' ? Bot : message.author === 'phone' ? Smartphone : UserRound;
  return (
    <li className={cn('flex', ours ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3.5 py-2.5',
          ours
            ? 'rounded-se-sm bg-[color-mix(in_oklch,var(--ok),transparent_84%)]'
            : 'rounded-ss-sm border border-line bg-surface-2',
          message.status === 'failed' && 'border border-[color-mix(in_oklch,var(--err),transparent_40%)]',
        )}
      >
        {ours ? (
          <p className="mb-1 flex items-center gap-1 text-[length:var(--fs-text-xs)] font-medium text-fg-muted">
            <Icon className="size-3.5" aria-hidden="true" />
            {c.authors[message.author]}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words [unicode-bidi:plaintext] text-[length:var(--fs-text-sm)] text-fg">
          {message.body}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[length:var(--fs-mono-label)] text-fg-faint">
          <time dateTime={message.createdAt} className="mono">
            {time.format(new Date(message.createdAt))}
          </time>
          {message.intents.map((intent) => (
            <span key={intent} className="rounded-full bg-accent/12 px-1.5 text-accent-text">
              {(bot.labels as Record<string, string>)[intent] ?? intent}
            </span>
          ))}
          {message.status === 'failed' ? <span className="text-[color:var(--err)]">{c.failed}</span> : null}
        </p>
      </div>
    </li>
  );
}
