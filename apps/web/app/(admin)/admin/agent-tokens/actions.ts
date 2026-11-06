'use server';

import { revalidatePath } from '@/lib/revalidate-screen';
import { AdminApiError, adminSend } from '@/lib/admin-api';
import {
  AgentTokenCreateSchema,
  AgentTokenCreatedSchema,
  AgentTokenRowSchema,
  type AgentTokenCreated,
  type AgentTokenRow,
} from '@ayman/contracts/admin/agent-tokens';
import { agentTokensCopy as c } from '@ayman/contracts/copy/agent-tokens';

export type CreateResult = { ok: true; created: AgentTokenCreated } | { ok: false; message: string };
export type RevokeResult = { ok: true; row: AgentTokenRow } | { ok: false; message: string };

/**
 * Makes a key. The raw key comes back in the result, once — the screen shows
 * it and the API never returns it again.
 *
 * Validated here with the server's own schema first, so a missing name or an
 * empty pick is a sentence the admin can act on rather than a 400.
 */
export async function createAgentTokenAction(input: {
  name: string;
  permissions: string[];
  expiresInDays: number;
}): Promise<CreateResult> {
  if (input.name.trim().length < 2) return { ok: false, message: c.needName };
  if (input.permissions.length === 0) return { ok: false, message: c.needPermission };
  const body = AgentTokenCreateSchema.safeParse(input);
  if (!body.success) return { ok: false, message: c.createFailed };

  try {
    const created = await adminSend('POST', '/api/admin/agent-tokens', body.data, AgentTokenCreatedSchema);
    revalidatePath('/admin/agent-tokens');
    return { ok: true, created };
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 409) return { ok: false, message: c.tooMany };
    return { ok: false, message: c.createFailed };
  }
}

export async function revokeAgentTokenAction(id: string): Promise<RevokeResult> {
  try {
    const row = await adminSend(
      'POST',
      `/api/admin/agent-tokens/${encodeURIComponent(id)}/revoke`,
      undefined,
      AgentTokenRowSchema,
    );
    revalidatePath('/admin/agent-tokens');
    return { ok: true, row };
  } catch {
    return { ok: false, message: c.revokeFailed };
  }
}
