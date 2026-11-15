#!/usr/bin/env node
/**
 * Publishes the Cache Rule that lets Cloudflare serve anonymous public pages
 * from its own cache, on each teacher's zone.
 *
 * ## The split, and why the origin decides
 *
 * The rule only makes requests ELIGIBLE, with Edge TTL "use the origin's
 * cache-control, bypass if there is none" (`bypass_by_default`). It names no
 * TTL of its own. So the only responses Cloudflare stores are the ones
 * `proxy.ts` marks with `Cloudflare-CDN-Cache-Control` — `isEdgeCacheable()`
 * there is the single place that decides, and every other response (Next's
 * `private, no-store`) stays exactly as uncached as it is today.
 *
 * The expression repeats the two exclusions a cached copy must never cross,
 * so a mistake in the app cannot serve one visitor's page to another:
 *
 *   · a session cookie — the nav renders the signed-in pill from it;
 *   · an RSC request (`_rsc` param or `rsc` header) — same URL, different
 *     body, and Cloudflare ignores `Vary`.
 *
 * Plus: GET/HEAD only, the site's own host only (not the media or video
 * hosts, whose rules live elsewhere), not `/api/`, not `/_next/` (already
 * cached by extension), and not the markdown variant agents ask for with
 * `Accept: text/markdown` (same URL, different body again).
 *
 * ⚠️ No explicit Edge TTL, on purpose. With "Ignore cache-control and use this
 * TTL" Cloudflare would cache responses that carry `Set-Cookie` after
 * stripping the cookie — a first visit would lose its CSRF cookie, and a
 * signed-in page that slipped through would be served to strangers. With the
 * origin TTL, a `Set-Cookie` response is never stored.
 *
 * ## Usage
 *
 *   CLOUDFLARE_API_TOKEN=… node deploy/cloudflare/apply-html-cache-rule.mjs --dry-run teacher-one.com
 *   CLOUDFLARE_API_TOKEN=… node deploy/cloudflare/apply-html-cache-rule.mjs teacher-one.com teacher-two.com …
 *   node deploy/cloudflare/apply-html-cache-rule.mjs --verify teacher-one.com   # no token needed
 *
 * Each argument is a site's host; its zone is found by name, falling back to
 * the parent domain for a teacher on a subdomain. The token
 * needs Zone → Zone → Read and Zone → Cache Rules → Edit on those zones.
 * Re-running is safe: the rule is found by `ref` (or description) and updated.
 *
 * Apply it AFTER the proxy change is live, or before — either order is inert
 * until both exist. Removing it is the rollback: delete the rule in
 * Caching → Cache Rules, or purge and redeploy without the proxy header.
 */

const API = 'https://api.cloudflare.com/client/v4';
const PHASE = 'http_request_cache_settings';
/*
 * Per HOST, not per zone: a teacher can live on a subdomain of another
 * teacher's zone (the Arabic stack is a subdomain), and one shared ref would
 * make the second run overwrite the first one's rule with its own host.
 */
const ruleRef = (host) => `edge-cache-${host.replace(/[^a-z0-9]/gi, '-')}`;
const ruleDescription = (host) => `Anonymous public pages on ${host}: cacheable when the origin says so`;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERIFY_ONLY = args.includes('--verify');
const hosts = args.filter((arg) => !arg.startsWith('--'));

const die = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
};

if (!hosts.length) die('Name at least one site host, e.g. teacher-one.com');

function expressionFor(host) {
  return [
    `(http.host eq "${host}")`,
    '(http.request.method in {"GET" "HEAD"})',
    'not (http.cookie contains "session_token")',
    'not (http.request.uri.query contains "_rsc")',
    'not any(lower(http.request.headers.names[*])[*] eq "rsc")',
    'not any(http.request.headers["accept"][*] contains "text/markdown")',
    'not starts_with(http.request.uri.path, "/api/")',
    'not starts_with(http.request.uri.path, "/_next/")',
  ].join(' and ');
}

function ruleFor(host) {
  return {
    ref: ruleRef(host),
    description: ruleDescription(host),
    enabled: true,
    expression: expressionFor(host),
    action: 'set_cache_settings',
    action_parameters: {
      cache: true,
      edge_ttl: { mode: 'bypass_by_default' },
      browser_ttl: { mode: 'respect_origin' },
    },
  };
}

async function cf(pathname, init = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  // Cloudflare answers 200 with `success: false` for permission problems.
  if (!response.ok || body.success === false) {
    const detail = (body.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ');
    return { ok: false, status: response.status, detail: detail || `HTTP ${response.status}` };
  }
  return { ok: true, result: body.result };
}

/** The zone holding `host`: the host itself, else its nearest parent domain. */
async function zoneFor(host) {
  const labels = host.split('.');
  for (let i = 0; i < labels.length - 1; i++) {
    const name = labels.slice(i).join('.');
    const zones = await cf(`/zones?name=${encodeURIComponent(name)}`);
    if (!zones.ok) die(`${host}: zone lookup failed — ${zones.detail}`);
    if (zones.result?.[0]) return zones.result[0];
  }
  die(`${host}: no zone for it (or a parent) on this token's account`);
}

async function apply(host) {
  const zone = await zoneFor(host);

  const rule = ruleFor(host);
  const entry = await cf(`/zones/${zone.id}/rulesets/phases/${PHASE}/entrypoint`);

  if (!entry.ok && entry.status !== 404) die(`${host}: reading cache rules failed — ${entry.detail}`);

  if (!entry.ok) {
    console.log(`  ${host}: no cache rules yet → creating the phase with this one rule`);
    if (DRY_RUN) return console.log(JSON.stringify(rule, null, 2));
    const created = await cf(`/zones/${zone.id}/rulesets/phases/${PHASE}/entrypoint`, {
      method: 'PUT',
      body: JSON.stringify({ rules: [rule] }),
    });
    if (!created.ok) die(`${host}: create failed — ${created.detail}`);
    return console.log(`  ✓ ${host}: rule created`);
  }

  const ruleset = entry.result;
  const existing = (ruleset.rules ?? []).find(
    (r) => r.ref === ruleRef(host) || r.description === ruleDescription(host),
  );
  const others = (ruleset.rules ?? []).length - (existing ? 1 : 0);
  console.log(`  ${host}: ${others} other cache rule(s) left untouched`);
  if (DRY_RUN) return console.log(JSON.stringify(rule, null, 2));

  const result = existing
    ? await cf(`/zones/${zone.id}/rulesets/${ruleset.id}/rules/${existing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(rule),
      })
    : await cf(`/zones/${zone.id}/rulesets/${ruleset.id}/rules`, {
        method: 'POST',
        body: JSON.stringify(rule),
      });
  if (!result.ok) die(`${host}: ${existing ? 'update' : 'add'} failed — ${result.detail}`);
  console.log(`  ✓ ${host}: rule ${existing ? 'updated' : 'added'}`);
}

async function status(url, headers = {}) {
  const response = await fetch(url, { headers: { 'user-agent': UA, ...headers } });
  await response.arrayBuffer();
  return response.headers.get('cf-cache-status') ?? '(none)';
}

/**
 * Reads the live site. The safety checks are the ones that matter: a request
 * with a session cookie or an RSC request must never come back HIT.
 */
async function verify(host) {
  const base = `https://${host}`;
  const bust = `cachecheck=${Date.now()}`;
  const first = await status(`${base}/?${bust}`);
  const second = await status(`${base}/?${bust}`);
  const signedIn = await status(`${base}/?${bust}`, { cookie: '__Host-session_token=verify' });
  const rsc = await status(`${base}/?${bust}&_rsc=verify`, { rsc: '1' });

  console.log(`\n  ${host}`);
  console.log(`    anonymous, 1st: ${first}   2nd: ${second}   (want HIT on the 2nd)`);
  console.log(`    with a session cookie: ${signedIn}   (must NOT be HIT)`);
  console.log(`    RSC request: ${rsc}   (must NOT be HIT)`);

  if (signedIn === 'HIT' || rsc === 'HIT') die(`${host}: a request that must bypass came back HIT — delete the rule now`);
  if (second !== 'HIT') console.log(`    ⚠ not caching yet — rule missing, or the proxy change not deployed`);
  else console.log('    ✓ caching, and the bypasses hold');
}

for (const host of hosts) {
  if (VERIFY_ONLY) await verify(host);
  else {
    if (!process.env.CLOUDFLARE_API_TOKEN) die('CLOUDFLARE_API_TOKEN is not set');
    await apply(host);
  }
}
