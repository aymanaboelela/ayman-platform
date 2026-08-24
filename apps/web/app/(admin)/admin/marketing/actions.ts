'use server';

import { revalidatePath } from 'next/cache';
import {
  AudiencePreviewSchema,
  CampaignDetailSchema,
  CampaignRowSchema,
  OptOutRowSchema,
  WhatsappDeviceSchema,
  type Audience,
  type CampaignCreate,
  type CampaignPatch,
} from '@ayman/contracts/marketing/campaign';
import type { Pacing } from '@ayman/contracts/marketing/pacing';
import { z } from 'zod';
import { MediaAssetSchema } from '@ayman/contracts/admin/media';
import { adminGetOrNull, adminSend, adminSendVoid } from '@/lib/admin-api';

/**
 * Every write behind «التسويق», as Server Actions.
 *
 * `revalidatePath`, not `updateTag` — this section has no `'use cache'`
 * loader anywhere in it (every read is `adminGet`, always `no-store`, exactly
 * like `/admin/students`), so there is no tag for a write to invalidate. What
 * DOES need clearing is the Router Cache: without `revalidatePath`, pressing
 * «ابدأ» and landing back on the list would show the row exactly as it was
 * before the click until a hard reload.
 */

const CAMPAIGNS_PATH = '/admin/marketing/campaigns';
const campaignPath = (id: string) => `${CAMPAIGNS_PATH}/${encodeURIComponent(id)}`;

export async function previewAudienceAction(audience: Audience, pacing: Pacing) {
  return adminSend('POST', '/api/admin/marketing/audience-preview', { audience, pacing }, AudiencePreviewSchema);
}

export async function createCampaignAction(input: CampaignCreate) {
  const row = await adminSend('POST', '/api/admin/marketing/campaigns', input, CampaignRowSchema);
  revalidatePath(CAMPAIGNS_PATH);
  return row;
}

export async function patchCampaignAction(id: string, input: CampaignPatch) {
  const detail = await adminSend(
    'PATCH',
    `/api/admin/marketing/campaigns/${encodeURIComponent(id)}`,
    input,
    CampaignDetailSchema,
  );
  revalidatePath(campaignPath(id));
  revalidatePath(CAMPAIGNS_PATH);
  return detail;
}

export async function startCampaignAction(id: string) {
  const row = await adminSend(
    'POST',
    `/api/admin/marketing/campaigns/${encodeURIComponent(id)}/start`,
    undefined,
    CampaignRowSchema,
  );
  revalidatePath(campaignPath(id));
  revalidatePath(CAMPAIGNS_PATH);
  return row;
}

export async function pauseCampaignAction(id: string) {
  const row = await adminSend(
    'POST',
    `/api/admin/marketing/campaigns/${encodeURIComponent(id)}/pause`,
    undefined,
    CampaignRowSchema,
  );
  revalidatePath(campaignPath(id));
  revalidatePath(CAMPAIGNS_PATH);
  return row;
}

export async function cancelCampaignAction(id: string) {
  const row = await adminSend(
    'POST',
    `/api/admin/marketing/campaigns/${encodeURIComponent(id)}/cancel`,
    undefined,
    CampaignRowSchema,
  );
  revalidatePath(campaignPath(id));
  revalidatePath(CAMPAIGNS_PATH);
  return row;
}

export async function deleteCampaignAction(id: string) {
  await adminSendVoid('DELETE', `/api/admin/marketing/campaigns/${encodeURIComponent(id)}`);
  revalidatePath(CAMPAIGNS_PATH);
}

export async function linkDeviceAction() {
  return adminSend('POST', '/api/admin/marketing/device/link', undefined, WhatsappDeviceSchema);
}

export async function unlinkDeviceAction() {
  await adminSendVoid('POST', '/api/admin/marketing/device/unlink');
  revalidatePath('/admin/marketing/device');
}

/** Polled by the device panel — no state changes, so nothing to revalidate. */
export async function deviceStatusAction() {
  return adminGetOrNull('/api/admin/marketing/device', WhatsappDeviceSchema);
}

/**
 * The image picker's data source — the same `/api/admin/media` list the
 * media library page reads, trimmed to what a thumbnail grid needs. Not
 * `adminGet` directly: this file's callers are CLIENT components (the
 * campaign form), and `adminGet` reaches `next/headers` and can never be
 * imported from one — see that module's own note.
 */
export async function listMediaForPickerAction() {
  const { rows } = await adminGetOrNull(
    '/api/admin/media?perPage=60',
    z.object({ rows: z.array(MediaAssetSchema), rowCount: z.number() }),
  ) ?? { rows: [] };
  return rows.filter((row) => row.archivedAt === null);
}

export async function addOptOutAction(phone: string, reason: string | null) {
  const row = await adminSend('POST', '/api/admin/marketing/opt-outs', { phone, reason }, OptOutRowSchema);
  revalidatePath('/admin/marketing/opt-outs');
  return row;
}

export async function removeOptOutAction(phone: string) {
  await adminSendVoid('DELETE', `/api/admin/marketing/opt-outs/${encodeURIComponent(phone)}`);
  revalidatePath('/admin/marketing/opt-outs');
}
