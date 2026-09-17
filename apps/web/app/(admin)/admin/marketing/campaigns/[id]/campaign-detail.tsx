'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type {
  CampaignDetail,
  RecipientFilter,
  RecipientRow,
  RecipientStatus,
} from '@ayman/contracts/marketing/campaign';
import { RECIPIENT_FILTERS } from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { formatCopy } from '@ayman/contracts/format';
import { Badge } from '@ayman/ui/components/badge';
import { Button } from '@ayman/ui/components/button';
import { Card, CardBody, CardHeader, CardTitle } from '@ayman/ui/components/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@ayman/ui/components/table';
import { cancelCampaignAction, deleteCampaignAction, pauseCampaignAction, startCampaignAction, type ActionResult } from '../../actions';
import { formatEstimate } from '../../format-estimate';

const c = copy.marketing;

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

const RECIPIENT_STATUS_LABEL: Record<RecipientStatus, string> = {
  pending: c.recipientFilterPending,
  sent: c.recipientFilterSent,
  failed: c.recipientFilterFailed,
  skipped: c.recipientFilterSkipped,
};

/** The tabs. `undelivered` is not a status — see `RECIPIENT_FILTERS`. */
const FILTER_LABEL: Record<RecipientFilter, string> = {
  ...RECIPIENT_STATUS_LABEL,
  all: c.recipientFilterAll,
  undelivered: c.recipientFilterUndelivered,
};

const timeFormatter = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * One campaign, in full: what it will say, who is left, and the three
 * buttons that change its state.
 *
 * `campaign` and `recipients` arrive as server-fetched props rather than
 * being fetched here — after every action this component calls
 * `router.refresh()`, which re-runs the server component and hands back
 * fresh props, rather than each action separately re-fetching and
 * re-parsing the same two payloads.
 */
export function CampaignDetailView({
  campaign,
  recipients,
  recipientFilter,
}: {
  campaign: CampaignDetail;
  recipients: RecipientRow[];
  recipientFilter: RecipientFilter;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult<unknown>>, successMessage: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(successMessage);
        router.refresh();
      } else {
        setError(result.message);
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-[length:var(--fs-title-2)] font-semibold text-fg">{campaign.name}</h1>
            <Badge tone={STATUS_TONE[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
          </div>
          <p className="mono text-[length:var(--fs-text-sm)] text-fg-muted">
            {formatCopy(c.progressLabel, { sent: campaign.counts.sent, total: campaign.counts.total })}
            {campaign.counts.pending > 0 ? ` · ${formatCopy(c.pendingLabel, { n: campaign.counts.pending })}` : ''}
            {campaign.counts.failed > 0 ? ` · ${formatCopy(c.failedLabel, { n: campaign.counts.failed })}` : ''}
            {campaign.counts.skipped > 0 ? ` · ${formatCopy(c.skippedLabel, { n: campaign.counts.skipped })}` : ''}
          </p>
          {/*
            «اتبعت» on its own is what let a campaign that reached nobody read
            as a flawless run. The delivered count sits beside it, and turns
            red on its own when nothing at all has been acknowledged — which
            is a different statement from «٠ فشل» and the one that is true.
          */}
          {campaign.counts.sent > 0 ? (
            <p
              className={
                campaign.counts.delivered === 0
                  ? 'mono text-[length:var(--fs-text-sm)] font-medium text-err'
                  : 'mono text-[length:var(--fs-text-sm)] text-fg-muted'
              }
            >
              {campaign.counts.delivered === 0
                ? c.deliveredNone
                : formatCopy(c.deliveredLabel, { n: campaign.counts.delivered })}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          {campaign.status === 'draft' || campaign.status === 'paused' ? (
            <Button disabled={pending} onClick={() => run(() => startCampaignAction(campaign.id), 'الحملة بدأت')}>
              {campaign.status === 'paused' ? c.resumeButton : c.startButton}
            </Button>
          ) : null}
          {campaign.status === 'running' ? (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => pauseCampaignAction(campaign.id), 'الحملة وقفت')}
            >
              {c.pauseButton}
            </Button>
          ) : null}
          {campaign.status !== 'cancelled' && campaign.status !== 'done' ? (
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (confirm(c.cancelConfirm)) run(() => cancelCampaignAction(campaign.id), 'الحملة اتلغت');
              }}
            >
              {c.cancelButton}
            </Button>
          ) : null}
          {campaign.status === 'draft' ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (confirm(c.deleteConfirm)) {
                  startTransition(async () => {
                    const result = await deleteCampaignAction(campaign.id);
                    if (result.ok) {
                      router.push('/admin/marketing/campaigns');
                    } else {
                      setError(result.message);
                    }
                  });
                }
              }}
            >
              {c.deleteButton}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-[color:var(--err)]">{error}</p> : null}

      {/*
        A campaign that stopped itself and cannot say why reads as a bug in
        the runner, and the operator's correct-looking response is to press
        «كمّل» — which is the one thing that must not happen when the reason
        is that nothing is reaching anybody.
      */}
      {campaign.pausedReason ? (
        <Card>
          <CardBody>
            <p className="text-[length:var(--fs-text-sm)] font-medium text-err">{c.pausedReasonTitle}</p>
            <p className="mt-1 text-[length:var(--fs-text-sm)] text-fg-muted">{campaign.pausedReason}</p>
          </CardBody>
        </Card>
      ) : null}

      {campaign.status === 'running' && campaign.nextSendAt ? (
        <p className="text-[length:var(--fs-text-sm)] text-fg-muted">
          {formatCopy(c.nextSendAt, { time: timeFormatter.format(new Date(campaign.nextSendAt)) })}
          {' · '}
          {formatCopy(c.audienceEstimate, { duration: formatEstimate(campaign.estimateMinutes) })}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{c.previewTitle}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="whitespace-pre-wrap rounded-[var(--r-lg)] border border-line-subtle bg-surface-2 p-3 text-[length:var(--fs-text-sm)]">
            {campaign.preview || campaign.body}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{c.recipientsTitle}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="flex gap-1 border-b border-line-subtle px-4 py-2">
            {RECIPIENT_FILTERS.map((status) => (
              <a
                key={status}
                href={`/admin/marketing/campaigns/${campaign.id}?status=${status}`}
                className={
                  status === recipientFilter
                    ? 'rounded-sm bg-surface-3 px-2 py-1 text-[length:var(--fs-text-xs)] font-medium text-fg'
                    : 'rounded-sm px-2 py-1 text-[length:var(--fs-text-xs)] text-fg-muted hover:text-fg'
                }
              >
                {FILTER_LABEL[status]}
              </a>
            ))}
          </div>

          <TableWrapper className="rounded-none border-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{c.colPhone}</TableHead>
                  <TableHead>{c.colRecipientStatus}</TableHead>
                  <TableHead>{c.colSentAt}</TableHead>
                  <TableHead>{c.colDeliveredAt}</TableHead>
                  <TableHead>{c.colError}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="mono" dir="ltr">
                      {row.phone}
                      {row.name ? <span className="mx-2 text-fg-muted">{row.name}</span> : null}
                    </TableCell>
                    <TableCell>{RECIPIENT_STATUS_LABEL[row.status]}</TableCell>
                    <TableCell className="mono">
                      {row.sentAt ? timeFormatter.format(new Date(row.sentAt)) : '—'}
                    </TableCell>
                    {/*
                      A sent row with no delivery time is the one worth
                      seeing, so it is marked rather than left as a quiet
                      dash next to a confident «اتبعت».
                    */}
                    <TableCell
                      className={row.status === 'sent' && !row.deliveredAt ? 'mono text-err' : 'mono'}
                    >
                      {row.deliveredAt
                        ? timeFormatter.format(new Date(row.deliveredAt))
                        : row.status === 'sent'
                          ? '—'
                          : ''}
                    </TableCell>
                    <TableCell className="text-fg-muted">{row.error ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrapper>
        </CardBody>
      </Card>
    </div>
  );
}
