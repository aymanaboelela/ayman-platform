'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { MediaAssetSchema } from '@ayman/contracts/admin/media';
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
import { AdminApiError, adminGetOrNull, adminSend, adminSendVoid } from '@/lib/admin-api';

/**
 * Every write behind «التسويق», as Server Actions.
 *
 * ## `ActionResult<T>`, not a thrown error
 *
 * Every mutating action below returns `{ ok: true, data }` or `{ ok: false,
 * message }` instead of letting `AdminApiError` propagate. The reason is not
 * ergonomics — it is that FIVE client components in this section need to
 * branch on the failure, and the only class that carries a useful message is
 * `AdminApiError`, defined in `admin-api.ts` alongside `import { headers }
 * from 'next/headers'`. A client component that imports that class for an
 * `instanceof` check drags the whole module into the browser bundle, and
 * Turbopack refuses the build outright — caught by CI, not by `tsc` or by
 * `next dev` (Turbopack's dev server tree-shakes past it; only the production
 * build resolves the whole module graph and fails). Catching the error HERE,
 * on the server side where the class is safe to touch, and handing back a
 * plain serialisable object is the fix `students/actions.ts` already
 * standardised on (`ActionResult`) — this file follows the same shape.
 *
 * `revalidatePath`, not `updateTag` — this section has no `'use cache'`
 * loader anywhere in it (every read is `adminGet`, always `no-store`, exactly
 * like `/admin/students`), so there is no tag for a write to invalidate. What
 * DOES need clearing is the Router Cache: without `revalidatePath`, pressing
 * «ابدأ» and landing back on the list would show the row exactly as it was
 * before the click until a hard reload.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function attempt<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    return { ok: false, message: error instanceof AdminApiError ? error.message : 'حصل خطأ، حاول تاني' };
  }
}

const CAMPAIGNS_PATH = '/admin/marketing/campaigns';
const campaignPath = (id: string) => `${CAMPAIGNS_PATH}/${encodeURIComponent(id)}`;

/** Live-priced as the audience form changes. Like `deviceStatusAction`: a
 *  read the client already treats as best-effort, not a mutation that needs
 *  `ActionResult`'s toast-worthy failure message. */
export async function previewAudienceAction(audience: Audience, pacing: Pacing) {
  return adminSend(
    'POST',
    '/api/admin/marketing/audience-preview',
    { audience, pacing },
    AudiencePreviewSchema,
  ).catch(() => null);
}

export async function createCampaignAction(input: CampaignCreate) {
  return attempt(async () => {
    const row = await adminSend('POST', '/api/admin/marketing/campaigns', input, CampaignRowSchema);
    revalidatePath(CAMPAIGNS_PATH);
    return row;
  });
}

export async function patchCampaignAction(id: string, input: CampaignPatch) {
  return attempt(async () => {
    const detail = await adminSend(
      'PATCH',
      `/api/admin/marketing/campaigns/${encodeURIComponent(id)}`,
      input,
      CampaignDetailSchema,
    );
    revalidatePath(campaignPath(id));
    revalidatePath(CAMPAIGNS_PATH);
    return detail;
  });
}

export async function startCampaignAction(id: string) {
  return attempt(async () => {
    const row = await adminSend(
      'POST',
      `/api/admin/marketing/campaigns/${encodeURIComponent(id)}/start`,
      undefined,
      CampaignRowSchema,
    );
    revalidatePath(campaignPath(id));
    revalidatePath(CAMPAIGNS_PATH);
    return row;
  });
}

export async function pauseCampaignAction(id: string) {
  return attempt(async () => {
    const row = await adminSend(
      'POST',
      `/api/admin/marketing/campaigns/${encodeURIComponent(id)}/pause`,
      undefined,
      CampaignRowSchema,
    );
    revalidatePath(campaignPath(id));
    revalidatePath(CAMPAIGNS_PATH);
    return row;
  });
}

export async function cancelCampaignAction(id: string) {
  return attempt(async () => {
    const row = await adminSend(
      'POST',
      `/api/admin/marketing/campaigns/${encodeURIComponent(id)}/cancel`,
      undefined,
      CampaignRowSchema,
    );
    revalidatePath(campaignPath(id));
    revalidatePath(CAMPAIGNS_PATH);
    return row;
  });
}

export async function deleteCampaignAction(id: string) {
  return attempt(async () => {
    await adminSendVoid('DELETE', `/api/admin/marketing/campaigns/${encodeURIComponent(id)}`);
    revalidatePath(CAMPAIGNS_PATH);
  });
}

export async function linkDeviceAction() {
  return attempt(() => adminSend('POST', '/api/admin/marketing/device/link', undefined, WhatsappDeviceSchema));
}

export async function unlinkDeviceAction() {
  return attempt(async () => {
    await adminSendVoid('POST', '/api/admin/marketing/device/unlink');
    revalidatePath('/admin/marketing/device');
  });
}

/** Polled by the device panel. Answers `null` on failure rather than an
 *  `ActionResult` — a poll that misses a beat should stay silent, not toast. */
export async function deviceStatusAction() {
  return adminGetOrNull('/api/admin/marketing/device', WhatsappDeviceSchema).catch(() => null);
}

/**
 * The image picker's data source — the same `/api/admin/media` list the
 * media library page reads, trimmed to what a thumbnail grid needs. Not
 * `adminGet` directly: this file's callers are CLIENT components (the
 * campaign form), and `adminGet` reaches `next/headers` and can never be
 * imported from one — see that module's own note.
 */
export async function listMediaForPickerAction() {
  const { rows } = (await adminGetOrNull(
    '/api/admin/media?perPage=60',
    z.object({ rows: z.array(MediaAssetSchema), rowCount: z.number() }),
  ).catch(() => null)) ?? { rows: [] };
  return rows.filter((row) => row.archivedAt === null);
}

export async function addOptOutAction(phone: string, reason: string | null) {
  return attempt(async () => {
    const row = await adminSend('POST', '/api/admin/marketing/opt-outs', { phone, reason }, OptOutRowSchema);
    revalidatePath('/admin/marketing/opt-outs');
    return row;
  });
}

export async function removeOptOutAction(phone: string) {
  return attempt(async () => {
    await adminSendVoid('DELETE', `/api/admin/marketing/opt-outs/${encodeURIComponent(phone)}`);
    revalidatePath('/admin/marketing/opt-outs');
  });
}
