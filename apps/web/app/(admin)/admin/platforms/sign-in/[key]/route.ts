import { copy } from '@ayman/contracts/copy/admin';
import { OWNER_SIGN_IN_PATH } from '@ayman/contracts/admin/owner-sign-in';
import { signOwnerSignInToken } from '@/lib/control-plane';
import { isControlPlaneOwner } from '@/lib/provisioning/gate';
import { discoverStacks } from '@/lib/provisioning/provision';

/**
 * «لوحته» — signs a one-minute token and sends the owner's browser to the
 * instructor's own sign-in endpoint, which opens their admin with no password.
 *
 * A route and not a server action because it is a plain link with
 * `target="_blank"`: a `window.open` after an awaited action is a popup the
 * browser blocks.
 *
 * ⚠️ The destination comes from Dokploy's record of the stack, NEVER from the
 * request. A `?to=` here would let any page that can get the owner to click a
 * link mint a live admin key for some instructor and hand it to a host of its
 * choosing.
 *
 * GET with a side effect is fine here: the worst a cross-site link can do is
 * sign the owner himself into an instructor's admin in his own browser — the
 * token never reaches the page that linked here.
 *
 * No `dynamic` export: `cacheComponents` refuses it, and reading the session
 * cookie already makes every request run.
 */

function failed(status: number): Response {
  return new Response(copy.admin.tenants.openAdminFailed, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  if (!(await isControlPlaneOwner())) return new Response(null, { status: 404 });
  const { key } = await params;

  try {
    const { tenants } = await discoverStacks();
    const stack = tenants.find((entry) => entry.key === key);
    const appUrl = (stack?.env.APP_URL ?? '').trim();
    if (!stack || appUrl === '') return failed(404);

    const target = new URL(OWNER_SIGN_IN_PATH, appUrl);
    target.searchParams.set('token', signOwnerSignInToken(stack.key));
    return new Response(null, {
      status: 303,
      // `no-referrer`: the next hop is a redirect that carries the token in
      // its URL, and nothing after it should learn where it came from.
      headers: { location: target.toString(), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  } catch (error) {
    console.error('owner-sign-in: could not open an instructor admin', error);
    return failed(502);
  }
}
