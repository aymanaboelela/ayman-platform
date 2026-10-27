import type { LeadStatus } from '@ayman/contracts/wa-bot/schemas';

/**
 * One colour per lead status, from the semantic tokens: a new lead is news
 * (`info`), one somebody is talking to is in progress (`warn`), a subscription
 * is the win (`ok`), and «مفيش اهتمام» is the quiet one (`err`, muted on the
 * row by the badge's own wash).
 */
export const STATUS_TONE: Record<LeadStatus, 'info' | 'warn' | 'ok' | 'err'> = {
  new: 'info',
  contacted: 'warn',
  subscribed: 'ok',
  not_interested: 'err',
};
