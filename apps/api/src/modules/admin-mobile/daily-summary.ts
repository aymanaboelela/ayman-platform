import { copy } from '@ayman/contracts/copy';
import { formatCopy } from '@ayman/contracts/format';
import type { PushPayload } from '../notifications/push.service';

const c = copy.notifications;

/** What the night summary is built from — today's row of the finance report,
 *  plus the queues still waiting. */
export interface DailySummaryInput {
  subscriptionCount: number;
  newCount: number;
  renewalCount: number;
  netCents: number;
  pending: number;
}

/**
 * «ملخص النهارده» — one tray line, three facts: what sold, what it came to,
 * and what is still waiting.
 *
 * The numbers are the finance screen's own (`FinanceDailyService.daily`), not
 * a second count written here: a push that says 1,200 and a screen that says
 * 1,150 for the same day is worse than no push at all. Free subscriptions are
 * left out of the count for the same reason the finance screen splits them —
 * they are access, not sales.
 *
 * A quiet day still sends. «مفيش اشتراكات النهارده» is an answer; silence
 * reads as "the summary broke".
 */
export function dailySummaryPayload(input: DailySummaryInput): PushPayload {
  const subs =
    input.subscriptionCount > 0
      ? formatCopy(c.dailySummarySubs, {
          n: input.subscriptionCount,
          fresh: input.newCount,
          renewal: input.renewalCount,
        })
      : c.dailySummaryNoSubs;
  const net = formatCopy(c.dailySummaryNet, { amount: Math.round(input.netCents / 100) });
  const pending =
    input.pending > 0
      ? formatCopy(c.dailySummaryPending, { n: input.pending })
      : c.dailySummaryNothingPending;

  return {
    title: c.dailySummaryTitle,
    body: [subs, net, pending].join(' · '),
    url: '/admin/finance',
    tag: 'ayman-daily-summary',
  };
}

/** What `OpsWatchService` should say about the WhatsApp sender, given what it
 *  saw last tick and what it sees now. */
export type WhatsappChange = 'down' | 'back' | null;

/**
 * Edges only, never levels: a phone that buzzes every five minutes for as
 * long as the sender is unlinked gets muted, and then the next real outage is
 * missed too.
 *
 * `previous === null` is the first tick after a boot. It says nothing: a
 * deploy restarts the API while the sender is whatever it was, and announcing
 * that state as news would page somebody on every release.
 *
 * `disabled` (no sidecar configured) is neither up nor down — a stack that
 * never had WhatsApp is not one that lost it.
 */
export function whatsappChange(previous: string | null, next: string): WhatsappChange {
  if (previous === null || previous === next) return null;
  if (previous === 'disabled' || next === 'disabled') return null;
  if (previous === 'connected') return 'down';
  if (next === 'connected') return 'back';
  return null;
}
