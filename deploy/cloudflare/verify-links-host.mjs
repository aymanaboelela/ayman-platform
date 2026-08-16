#!/usr/bin/env node
/**
 * Checks that the bio link actually works — end to end, from the outside.
 *
 *   node deploy/cloudflare/verify-links-host.mjs
 *   node deploy/cloudflare/verify-links-host.mjs --host links.aymanaboelela.com
 *
 * No credentials. It is an HTTP client, not a Cloudflare client.
 *
 * ## Why a status code is not the check
 *
 * This zone has already produced the failure this script exists to catch. On
 * 2026-08-03 `www` was given a proxied DNS record and nothing else — no
 * Traefik route, no Dokploy domain entry. Every path returned Traefik's bare
 * `404 page not found`, EXCEPT `/robots.txt`, which returned **200** carrying
 * Cloudflare's own managed robots.txt: no `Sitemap:` line, none of this app's
 * `Disallow` rules. A crawler on that hostname read a policy this project
 * never wrote, and Search Console reported it against the property.
 *
 * A DNS record is not a route. So this script reads BODIES, and asserts on a
 * string only this application can produce, rather than on a status.
 *
 * ## What it asserts
 *
 *   1. The host resolves and serves HTTPS. It has to on the first request:
 *      `Strict-Transport-Security` is sent with `includeSubDomains; preload`,
 *      so a new subdomain that ever answers on plain HTTP is one browsers will
 *      refuse for the next two years. (Universal SSL covers `*.example.com`
 *      one label deep only — `links.` is fine, `a.b.` is not.)
 *   2. The response is the PAGE, matched on the `<h1>` and the canonical, not
 *      on a 200.
 *   3. `robots.txt` is OURS — the `Content-Signal` line is in no managed
 *      default, so its presence is proof the origin answered.
 *   4. The canonical is the apex. `NEXT_PUBLIC_APP_URL` is baked into the
 *      bundle at Docker build time, so a second hostname serving the same app
 *      still emits apex-absolute canonicals. That is correct — it is what
 *      stops two hostnames competing as duplicates — and it is worth
 *      asserting, because the day it stops being true is the day the short
 *      host starts fighting the real one in the index.
 *   5. If the host is a REDIRECT rather than a second origin, that the
 *      redirect lands on `/links` and does so in one hop.
 */
const APEX = 'https://aymanaboelela.com';
const DEFAULT_PATH = '/links';

const argv = process.argv.slice(2);
const hostArg = argv.indexOf('--host');
const HOST = hostArg === -1 ? null : argv[hostArg + 1];
const TARGET = HOST ? `https://${HOST}/` : `${APEX}${DEFAULT_PATH}`;

/** The `<h1>` the page renders. Kept in sync with `copy.linkhub.title`. */
const H1 = 'أيمن أبو العلا';
const CANONICAL = `${APEX}${DEFAULT_PATH}`;

let failed = 0;
const ok = (message) => console.log(`  [32m✓[0m ${message}`);
const bad = (message) => {
  failed += 1;
  console.log(`  [31m✗[0m ${message}`);
};

async function get(url, { redirect = 'follow' } = {}) {
  const response = await fetch(url, {
    redirect,
    headers: { 'user-agent': 'ayman-platform/verify-links-host' },
    signal: AbortSignal.timeout(20_000),
  });
  return { response, body: await response.text() };
}

console.log(`\nChecking ${TARGET}\n`);

/* ---- 1 · plain HTTP must not be the thing that answers ------------------- */
if (HOST) {
  try {
    const { response } = await get(`http://${HOST}/`, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') ?? '';
      if (location.startsWith('https://')) ok(`http:// redirects to https (${response.status})`);
      else bad(`http:// redirects to a non-https target: ${location}`);
    } else {
      bad(
        `http:// answered ${response.status} instead of redirecting — with HSTS ` +
          'includeSubDomains this host must be https from its first request',
      );
    }
  } catch (error) {
    bad(`http:// could not be reached: ${error.message}`);
  }
}

/* ---- 2 · the response is the page, not a router's 404 -------------------- */
let landed = TARGET;
try {
  const { response, body } = await get(TARGET);
  landed = response.url;

  if (!response.ok) {
    bad(`${landed} answered ${response.status}`);
    console.log(`      first 200 bytes: ${body.slice(0, 200).replace(/\s+/g, ' ')}`);
  } else if (body.includes('page not found') && body.length < 2_000) {
    // Traefik's bare-text 404 — a DNS record with no route behind it.
    bad(`${landed} is answered by the ROUTER, not the app — the host resolves but is not routed`);
  } else if (!body.includes(H1)) {
    bad(`${landed} is 200 but does not contain the page's <h1> («${H1}»)`);
    console.log(`      ${body.length} bytes — check whose page this is`);
  } else {
    ok(`serves the real page (${body.length} bytes, <h1> present)`);
  }

  if (body.includes(`<link rel="canonical" href="${CANONICAL}"`)) {
    ok(`canonical is the apex: ${CANONICAL}`);
  } else if (response.ok) {
    const found = body.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    bad(`canonical is «${found ?? 'absent'}», expected ${CANONICAL}`);
  }

  if (HOST && landed !== TARGET) {
    if (landed === CANONICAL || landed === `${CANONICAL}/`) {
      ok(`redirects to ${landed}`);
    } else {
      bad(`redirects to ${landed}, expected ${CANONICAL}`);
    }
  }
} catch (error) {
  bad(`${TARGET} could not be reached: ${error.message}`);
}

/* ---- 3 · robots.txt on this host is ours, not Cloudflare's --------------- */
{
  const origin = new URL(landed).origin;
  try {
    const { response, body } = await get(`${origin}/robots.txt`);
    if (!response.ok) {
      bad(`${origin}/robots.txt answered ${response.status}`);
    } else if (body.includes('Content-Signal:')) {
      ok('robots.txt is this app’s (Content-Signal present)');
    } else {
      bad(
        `${origin}/robots.txt is 200 but is NOT ours — no Content-Signal line. ` +
          'This is the exact shape of the www incident: a managed robots.txt on an unrouted host.',
      );
      console.log(`      ${body.trim().split('\n').slice(0, 4).join(' / ')}`);
    }
  } catch (error) {
    bad(`robots.txt could not be reached: ${error.message}`);
  }
}

console.log(
  failed === 0
    ? '\n[32mAll checks passed.[0m\n'
    : `\n[31m${failed} check(s) failed.[0m See docs/runbooks/links-subdomain.md.\n`,
);
process.exit(failed === 0 ? 0 : 1);
