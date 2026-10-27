import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Bot, Inbox, Smartphone } from 'lucide-react';
import { copy as bot } from '@ayman/contracts/copy/wa-bot';
import { WhatsappDeviceSchema } from '@ayman/contracts/marketing/campaign';
import { BotAnswerRowSchema, BotSettingsReadSchema } from '@ayman/contracts/wa-bot/schemas';
import { cn } from '@ayman/ui/lib/cn';
import { adminGet, adminGetOrNull } from '@/lib/admin-api';
import { getEntitlements } from '@/lib/entitlements';
import { MarketingTabs } from '../tabs';
import { BotSettingsForm } from './settings-form';
import { BotAnswers } from './answers';
import { BotPreview } from './preview';

const c = bot.admin;

export const metadata = { title: c.botTitle };

/**
 * «الرد الآلي» — the switches, the answers, and a place to try both.
 *
 * The dry run sits beside the settings on purpose: every change to an answer
 * is one message away from being seen exactly as a phone would receive it,
 * with today's prices filled in, before a single student does.
 */
export default async function BotPage() {
  if (!(await getEntitlements())['whatsapp.bot']) notFound();

  const [read, answers, device] = await Promise.all([
    adminGet('/api/admin/wa-bot/settings', BotSettingsReadSchema),
    adminGet('/api/admin/wa-bot/answers', z.array(BotAnswerRowSchema)),
    adminGetOrNull('/api/admin/marketing/device', WhatsappDeviceSchema),
  ]);
  const linked = device?.state === 'connected';

  return (
    <>
      <MarketingTabs />

      <div className="mb-5 flex flex-wrap items-start gap-4">
        <span
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklch,var(--ok),transparent_82%)] text-[color:var(--ok)]"
        >
          <Bot className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.botTitle}</h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.botLead}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/admin/marketing/device"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[length:var(--fs-text-xs)] font-medium',
                linked
                  ? 'border-[color-mix(in_oklch,var(--ok),transparent_55%)] bg-[color-mix(in_oklch,var(--ok),transparent_88%)] text-[color:var(--ok)]'
                  : 'border-[color-mix(in_oklch,var(--warn),transparent_55%)] bg-[color-mix(in_oklch,var(--warn),transparent_88%)] text-[color:var(--warn)]',
              )}
            >
              <Smartphone className="size-3.5" aria-hidden="true" />
              {c.deviceLink}: {linked ? (device?.phone ?? '') : c.deviceDown}
            </Link>
            <Link
              href="/admin/inbox/whatsapp"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg"
            >
              <Inbox className="size-3.5" aria-hidden="true" />
              {c.inboxTitle}
            </Link>
            <Link
              href="/admin/marketing/leads"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg"
            >
              {c.openLeads}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BotSettingsForm initial={read.settings} modelAvailable={read.modelAvailable} />
        <BotPreview />
      </div>

      <BotAnswers rows={answers} />
    </>
  );
}
