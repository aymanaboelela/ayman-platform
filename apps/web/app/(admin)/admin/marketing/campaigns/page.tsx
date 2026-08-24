import Link from 'next/link';
import { z } from 'zod';
import { CampaignRowSchema } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge, Card, CardBody } from '@ayman/ui';
import { adminGet } from '@/lib/admin-api';
import { MarketingTabs } from '../tabs';

const c = copy.marketing;

export const metadata = { title: c.title };

const STATUS_TONE = {
  draft: 'neutral',
  running: 'ok',
  paused: 'warn',
  done: 'neutral',
  cancelled: 'err',
} as const;

const STATUS_LABEL = {
  draft: c.statusDraft,
  running: c.statusRunning,
  paused: c.statusPaused,
  done: c.statusDone,
  cancelled: c.statusCancelled,
} as const;

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  dateStyle: 'medium',
});

/**
 * «التسويق ← حملات واتساب» — every campaign, oldest concerns first: is
 * anything running right now, and did the last one finish clean.
 */
export default async function MarketingCampaignsPage() {
  const rows = await adminGet('/api/admin/marketing/campaigns', z.array(CampaignRowSchema));

  return (
    <>
      <MarketingTabs />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-[length:var(--fs-title-2)] font-semibold text-fg">{c.title}</h1>
          <p className="max-w-[var(--w-prose)] text-fg-muted">{c.lead}</p>
        </div>
        <Link href="/admin/marketing/campaigns/new" className="rounded-sm bg-accent px-4 py-2 font-medium text-[#1A1206]">
          {c.newCampaign}
        </Link>
      </div>

      <Card>
        <CardBody className="divide-y divide-line-subtle p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-fg-muted">{c.listEmpty}</p>
          ) : (
            rows.map((row) => (
              <Link
                key={row.id}
                href={`/admin/marketing/campaigns/${row.id}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-[160ms] ease-out hover:bg-surface-2"
              >
                <span className="flex-1 min-w-[12rem] font-medium text-fg">{row.name}</span>

                <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>

                <span className="mono text-[length:var(--fs-text-xs)] text-fg-muted">
                  {formatCopy(c.progressLabel, { sent: row.counts.sent, total: row.counts.total })}
                </span>

                <span className="text-[length:var(--fs-text-xs)] text-fg-muted">
                  {timeFormatter.format(new Date(row.createdAt))}
                </span>
              </Link>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}
