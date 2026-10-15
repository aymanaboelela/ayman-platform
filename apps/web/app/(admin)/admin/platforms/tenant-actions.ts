'use server';

import { z } from 'zod';
import { copy } from '@ayman/contracts/copy/admin';
import { SUBJECTS, type SubjectSlug } from '@ayman/contracts/subjects';
import { isControlPlaneOwner } from '@/lib/provisioning/gate';
import { finalize, redeploy, updateIdentity } from '@/lib/provisioning/provision';

const c = copy.admin.tenants;

export type TenantActionResult = { ok: true; message: string } | { ok: false; message: string };

function valid(composeId: unknown): composeId is string {
  return typeof composeId === 'string' && composeId !== '' && composeId.length <= 64;
}

/**
 * The two per-row buttons on «المدرّسين». Each one only ever acts on a compose
 * whose environment names an instructor (`tenantStack`) — the owner's own
 * stack and any unrelated app on the same Dokploy are refused by id, so a
 * forged id from the browser cannot redeploy or rewrite them.
 */
export async function redeployTenantAction(composeId: string): Promise<TenantActionResult> {
  if (!(await isControlPlaneOwner())) return { ok: false, message: c.notOwner };
  if (!valid(composeId)) return { ok: false, message: c.redeployFailed };
  try {
    return (await redeploy(composeId)) ? { ok: true, message: c.redeployed } : { ok: false, message: c.redeployFailed };
  } catch (error) {
    return { ok: false, message: `${c.redeployFailed} ${error instanceof Error ? error.message : ''}`.trim() };
  }
}

export async function finalizeTenantAction(composeId: string): Promise<TenantActionResult> {
  if (!(await isControlPlaneOwner())) return { ok: false, message: c.notOwner };
  if (!valid(composeId)) return { ok: false, message: c.finalizeFailed };
  try {
    const done = await finalize(composeId);
    if (!done) return { ok: false, message: c.finalizeFailed };
    return { ok: true, message: done.zone ? c.finalizedZone : c.finalized };
  } catch (error) {
    return { ok: false, message: `${c.finalizeFailed} ${error instanceof Error ? error.message : ''}`.trim() };
  }
}

const IdentitySchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  subject: z.enum(SUBJECTS.map((subject) => subject.slug) as [SubjectSlug, ...SubjectSlug[]]),
});

/** «تعديل» on a teacher's card: name and subject, then a rebuild. */
export async function updateTenantIdentityAction(
  composeId: string,
  input: { displayName: string; subject: string },
): Promise<TenantActionResult> {
  if (!(await isControlPlaneOwner())) return { ok: false, message: c.notOwner };
  const parsed = IdentitySchema.safeParse(input);
  if (!valid(composeId) || !parsed.success) return { ok: false, message: c.editFailed };
  try {
    return (await updateIdentity(composeId, parsed.data)) ? { ok: true, message: c.editSaved } : { ok: false, message: c.editFailed };
  } catch (error) {
    return { ok: false, message: `${c.editFailed} ${error instanceof Error ? error.message : ''}`.trim() };
  }
}
