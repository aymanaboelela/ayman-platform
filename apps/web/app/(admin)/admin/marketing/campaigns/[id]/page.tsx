import Link from 'next/link';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import {
  CampaignDetailSchema,
  RECIPIENT_STATUSES,
  RecipientRowSchema,
  type RecipientStatus,
} from '@ayman/contracts/marketing/campaign';
import { copy } from '@ayman/contracts/copy/admin';
import { adminGetOrNotFound } from '@/lib/admin-api';
import { CampaignDetailView } from './campaign-detail';

const c = copy.marketing;

export const metadata = { title: c.title };

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status: rawStatus } = await searchParams;
  const status: RecipientStatus | 'all' = RECIPIENT_STATUSES.includes(rawStatus as RecipientStatus)
    ? (rawStatus as RecipientStatus)
    : 'all';

  const campaign = await adminGetOrNotFound(`/api/admin/marketing/campaigns/${id}`, CampaignDetailSchema);
  const recipients = await adminGetOrNotFound(
    `/api/admin/marketing/campaigns/${id}/recipients?status=${status}`,
    z.array(RecipientRowSchema),
  );

  return (
    <>
      <Link
        href="/admin/marketing/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-[length:var(--fs-text-sm)] text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4" aria-hidden="true" />
        {c.detailBack}
      </Link>

      <CampaignDetailView campaign={campaign} recipients={recipients} recipientFilter={status} />
    </>
  );
}
