/**
 * The visitor's address, carried onto a server-to-server call to the API.
 *
 * Every fetch this server makes to the API arrives from ONE address — the web
 * container's. The API's `ip` throttler (1200/min per route) falls back to that
 * address when `cf-connecting-ip` is absent, so every student's `/profile/me`
 * check, on every page, drew from the same allowance. About 20 anonymous
 * requests a second to `/login` emptied it; the proxy reads the resulting 429
 * as «signed out» and sent every signed-in student back to the login page.
 *
 * Forwarding Cloudflare's header gives each visitor their own bucket again.
 * The API may trust it because the host firewall admits only Cloudflare, which
 * sets the header itself and refuses a client-supplied one — see
 * `clientIpFromRequest` in the API. Locally and in CI the header is absent and
 * nothing is forwarded, which is exactly the old behaviour.
 *
 * Not for `'use cache'` loaders: a cached function may not read request
 * headers, and a cached read is not per-visitor anyway.
 */
export const CLIENT_IP_HEADER = 'cf-connecting-ip';

export function forwardClientIp(incoming: Headers): Record<string, string> {
  const ip = incoming.get(CLIENT_IP_HEADER)?.trim();
  return ip ? { [CLIENT_IP_HEADER]: ip } : {};
}
