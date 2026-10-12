'use server';

import { copy } from '@ayman/contracts/copy/admin';
import { DokployError, dokployConfigured } from '@/lib/provisioning/dokploy';
import { isControlPlaneOwner } from '@/lib/provisioning/gate';
import { provision, stackStatus, type ProvisionResult, type StackStatus } from '@/lib/provisioning/provision';
import { ProvisionRequestSchema, type ProvisionRequest } from './schema';

const c = copy.admin.tenants;

export type ProvisionActionResult = ProvisionResult | { ok: false; steps: []; error: string; field?: string };

/**
 * «اعمل المنصة». Gated like every control-plane action
 * (`lib/provisioning/gate.ts`), re-validated here because the form's resolver
 * is a convenience, and refusing the owner's own host before anything is
 * created — `APP_URL` equal to this stack's would be two stacks answering for
 * one domain, and the router would pick one.
 *
 * No `updateTag`: nothing on THIS stack reads what this creates. The new
 * stack is somebody else's; the owner's list re-reads Dokploy per request.
 */
export async function provisionTenantAction(input: ProvisionRequest): Promise<ProvisionActionResult> {
  if (!(await isControlPlaneOwner())) return { ok: false, steps: [], error: c.notOwner };
  if (!dokployConfigured()) return { ok: false, steps: [], error: c.notConnectedNew };

  const parsed = ProvisionRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, steps: [], error: issue?.message ?? c.errHost, field: issue?.path[0]?.toString() };
  }
  const data = parsed.data;

  let own = '';
  try {
    own = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '').hostname;
  } catch {
    // No own URL to compare with — the preflight still refuses Ayman's domain.
  }
  const ownApex = own.split('.').slice(-2).join('.');
  for (const host of [data.appHost, data.mediaHost]) {
    if (own !== '' && (host === own || host === ownApex || host.endsWith(`.${ownApex}`))) {
      return { ok: false, steps: [], error: c.errOwnerHost, field: host === data.appHost ? 'appHost' : 'mediaHost' };
    }
  }

  try {
    return await provision({
      key: data.key,
      displayName: data.displayName,
      subject: data.subject,
      landingPreset: data.landingPreset,
      accent: data.accent,
      adminName: data.adminName,
      adminEmail: data.adminEmail,
      whatsapp: data.whatsapp,
      appHost: data.appHost,
      mediaHost: data.mediaHost,
      features: data.features,
      shareKeys: data.shareKeys,
      socials: {
        youtube: data.youtube,
        instagram: data.instagram,
        tiktok: data.tiktok,
        facebook: data.facebook,
        whatsappChannel: data.whatsappChannel,
      },
    });
  } catch (error) {
    // `provision` reports its own steps; anything thrown past it is the panel
    // itself failing, and the owner gets the reason verbatim.
    return { ok: false, steps: [], error: error instanceof DokployError || error instanceof Error ? error.message : String(error) };
  }
}

/** Polled by the run screen while the first build runs. */
export async function tenantStatusAction(composeId: string): Promise<StackStatus | null> {
  if (!(await isControlPlaneOwner())) return null;
  if (typeof composeId !== 'string' || composeId === '' || composeId.length > 64) return null;
  try {
    return await stackStatus(composeId);
  } catch {
    return null;
  }
}
