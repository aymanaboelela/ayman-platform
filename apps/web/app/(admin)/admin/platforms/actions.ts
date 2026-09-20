'use server';

import { FEATURE_DECLARATIONS } from '@ayman/contracts/admin/entitlements';
import { copy } from '@ayman/contracts/copy/admin';
import { controlPlaneTenants, signEntitlementsDocument } from '@/lib/control-plane';
import { can, getSession } from '@/lib/session';
import { IS_AYMAN } from '@/lib/tenant';
import { SignRequestSchema, type SignRequest } from './schema';

export type SignActionResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; message: string };

/**
 * Signs one entitlements document and hands back the compact JWS.
 *
 * ## This action checks its own session, unlike every other one in `/admin`
 *
 * `updateBrandingAction` and its neighbours get away without a check because
 * they do nothing themselves: they call `adminSend`, which forwards the
 * session cookie to Nest, and Nest's deny-by-default guard is the gate. This
 * action never leaves the Next server — it reaches straight for the private
 * key — so there is no guard downstream of it. And a `'use server'` export is
 * a POST endpoint with a stable id that any signed-in browser can call
 * directly; the layout's `notFound()` and the sidebar's `aymanOnly` decide
 * what RENDERS and protect nothing here.
 *
 * So both halves are re-checked, in the order they matter:
 *
 *   · `IS_AYMAN` — the real gate. Every instructor holds `role: 'admin'` =
 *     `'*'` on their own stack (`create-admin.ts` runs on every boot with the
 *     `ADMIN_*` pair `deploy/tenant.env.example` hands to all of them), so a
 *     permission alone would put a signing oracle on each of their stacks.
 *   · `settings:write` — a second lock INSIDE this stack, against a role Ayman
 *     may hand out later. An existing permission on purpose: a new one would
 *     be swept up by `admin: '*'` and would need an authorization-matrix row
 *     for a route that does not exist.
 *
 * ## No `updateTag`
 *
 * Nothing on this stack reads what this returns. The token's only consumer is
 * a `TENANT_ENTITLEMENTS` value pasted into ANOTHER stack's panel, and its
 * only reader is that stack's API at boot. There is no cache entry here to
 * expire, and inventing a tag to call `updateTag` on would be a tag nothing
 * reads — the same reasoning written out at `updateOutreachAction`.
 */
export async function signEntitlementsAction(input: SignRequest): Promise<SignActionResult> {
  if (!IS_AYMAN) return { ok: false, message: copy.admin.platforms.notOwner };

  const session = await getSession();
  if (!can(session, 'settings:write')) return { ok: false, message: copy.admin.platforms.notOwner };

  const parsed = SignRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: copy.admin.platforms.signFailed };

  /*
   * The slug has to be one this stack is configured to know about, not just
   * one that matches the pattern. `sub` is what binds a document to a stack,
   * so a typo — `mohamed-sabri` for `mohamed-sabry` — produces a perfectly
   * valid token that the intended stack rejects and silently falls back from.
   * That failure shows up days later as «الفيتشر مش شغالة عندي»; refusing an
   * unknown key here turns it into a message before the copy-paste.
   */
  const known = controlPlaneTenants().some((tenant) => tenant.key === parsed.data.tenantKey);
  if (!known) return { ok: false, message: copy.admin.platforms.signFailed };

  /*
   * The declarations decide which keys EXIST; the form decides which are on.
   *
   * An unticked box is written into the document as an explicit `false` and
   * the stack honours it — including for a feature whose `defaultForTenant`
   * is `true`, which is the whole point of the screen: «صبري مش هيعرض كتب»
   * has no other shape. `applyEntitlements` has the long version.
   *
   * A key the form did not send at all is `false` here rather than "leave it
   * alone", and that is deliberate: the token is a complete statement of the
   * nine, so reading one tells you what that stack runs without also needing
   * to know which defaults were in force on the day it was signed.
   */
  const enabled = new Set(
    FEATURE_DECLARATIONS.filter(
      (declaration) => parsed.data.features[declaration.key] === true,
    ).map((declaration) => declaration.key),
  );

  try {
    const signed = signEntitlementsDocument({
      tenantKey: parsed.data.tenantKey,
      enabled,
      days: parsed.data.days,
    });
    return { ok: true, token: signed.token, expiresAt: signed.expiresAt };
  } catch (error) {
    // The two failures are worth telling apart on screen: a missing key is one
    // field in his own panel, anything else is a key that is there and wrong.
    const message =
      error instanceof Error && error.message.includes('CONTROL_PLANE_PRIVATE_KEY')
        ? copy.admin.platforms.missingKey
        : copy.admin.platforms.signFailed;
    return { ok: false, message };
  }
}
