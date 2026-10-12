import 'server-only';
import { can, getSession } from '@/lib/session';
import { IS_AYMAN } from '@/lib/tenant';

/**
 * The lock on every control-plane action — the same two checks as
 * `signEntitlementsAction`, for the same reason (its header has the long
 * version): these actions reach Dokploy and Cloudflare straight from the Next
 * server, so no Nest guard sits downstream of them, and a `'use server'`
 * export is a POST endpoint any signed-in browser can call by id.
 *
 *   · `IS_AYMAN` — the real gate. Every instructor is `role: 'admin'` = `'*'`
 *     on their own stack, so a permission alone would hand each of them a
 *     button that rewrites the others' stacks.
 *   · `settings:write` — a second lock inside this stack, against a role the
 *     owner may hand to staff later.
 */
export async function isControlPlaneOwner(): Promise<boolean> {
  if (!IS_AYMAN) return false;
  const session = await getSession();
  return can(session, 'settings:write');
}
