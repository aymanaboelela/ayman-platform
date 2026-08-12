#!/usr/bin/env node
/**
 * Publishes the agent-discovery `Link` header as a Cloudflare response-header
 * Transform Rule.
 *
 * ## Why this is not app code
 *
 * It was, twice, and both times it took production down. Anything the Next
 * server puts on `Link` for `/` ends up *inside* the cached page shell:
 * `app-render.js`'s `setMetadataHeader` does
 * `metadata.headers[name] = res.getHeader(name)` when React appends its font
 * preloads, so whatever is already on the outgoing response is captured into
 * the stored entry — and re-added on the next revalidation, and the one after
 * that. Measured on production 2026-08-06 at +2595 bytes every five minutes,
 * reaching 38,234 bytes.
 *
 * That capture happens for BOTH ways of setting it from inside the app, which
 * is the part that was not previously known and is worth stating plainly here:
 *
 *   · `proxy.ts` (middleware) — the original outage.
 *   · `next.config.ts` `async headers()` — verified on a real standalone build
 *     on 2026-08-12: the value went from one copy (901 bytes stored) to two
 *     (1081) across a single forced revalidation, +180 bytes a copy, the same
 *     fingerprint. `router-server.js` applies config headers with
 *     `res.setHeader` BEFORE the render, so they are on the response by the
 *     time `setMetadataHeader` reads it back.
 *
 * A header added at the edge is never seen by the origin's cache, so it cannot
 * accumulate by construction. Cloudflare's own guidance for this check says the
 * same thing (`isitagentready.com/.well-known/agent-skills/link-headers`).
 *
 * `operation: "add"` and NOT `"set"`: Next serves its own `Link` on `/` for the
 * six IBM Plex Sans Arabic woff2 preloads — 866 bytes on production, measured
 * 2026-08-12 via `--verify` below. `set` would replace them and quietly cost
 * every first-time visitor their font preloads: on Egyptian 3G, the most
 * expensive bytes on the page.
 *
 * ## Usage
 *
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… node deploy/cloudflare/apply-link-header.mjs --dry-run
 *   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=… node deploy/cloudflare/apply-link-header.mjs
 *   node deploy/cloudflare/apply-link-header.mjs --verify        # no token needed
 *
 * The token needs a single permission: Zone → Config Rules (or Transform Rules)
 * → Edit, scoped to this zone. Not a global key.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = 'https://api.cloudflare.com/client/v4';
const PHASE = 'http_response_headers_transform';

/**
 * Stable identity for our rule inside a phase that may hold other people's
 * rules. Matched on `ref` first and `description` second, so a rule created by
 * hand in the dashboard (which cannot set `ref`) is still adopted and updated
 * rather than duplicated.
 */
const RULE_REF = 'agent-discovery-link-header';
const RULE_DESCRIPTION = 'Agent discovery: RFC 8288 Link header on the homepage';

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const VERIFY_ONLY = argv.has('--verify');

const die = (message) => {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
};

async function cf(pathname, init = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const response = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  // Cloudflare answers 200 with `success: false` for permission problems, so
  // the status alone is not the check.
  if (!response.ok || body.success === false) {
    const detail = (body.errors ?? []).map((error) => `${error.code}: ${error.message}`).join('; ');
    return { ok: false, status: response.status, detail: detail || `HTTP ${response.status}`, body };
  }
  return { ok: true, result: body.result };
}

async function loadRule() {
  const config = JSON.parse(await readFile(path.join(HERE, 'link-header.json'), 'utf8'));
  return {
    ref: RULE_REF,
    description: RULE_DESCRIPTION,
    enabled: true,
    expression: config.expression,
    action: 'rewrite',
    action_parameters: {
      headers: {
        [config.header]: { operation: config.operation, value: config.value },
      },
    },
  };
}

/** Reads the live homepage and reports which relations actually arrive. */
async function verify() {
  const url = process.env.SITE_URL ?? 'https://aymanaboelela.com/';
  const response = await fetch(url, { redirect: 'follow' });
  /*
   * `get()` comma-joins repeated headers, which is what is wanted here: the
   * homepage legitimately carries two `Link` headers once the rule is live
   * (ours, plus Next's font preloads), and the ceiling below is about their
   * total on the wire — that total is what broke Traefik, not either one alone.
   */
  const link = response.headers.get('link') ?? '';
  const counted = ['api-catalog', 'service-desc', 'service-doc', 'describedby'].filter((rel) =>
    link.includes(`rel="${rel}"`),
  );

  console.log(`\n  ${url} → HTTP ${response.status}`);
  console.log(`  Link header bytes: ${link.length}`);
  console.log(`  relations the scan counts: ${counted.length ? counted.join(', ') : 'NONE'}`);

  if (!counted.length) {
    die('No agent-useful relations on the homepage. The rule is not live yet.');
  }
  // The number that mattered in the outage. Nothing at the edge should grow,
  // but a cheap assertion beats trusting that.
  if (link.length > 8 * 1024) {
    die(`Link header is ${link.length} bytes — something is accumulating again.`);
  }
  console.log('\n✓ Live.\n');
}

async function main() {
  if (VERIFY_ONLY) return verify();

  const rule = await loadRule();

  if (DRY_RUN) {
    console.log(`\nWould upsert into zone phase ${PHASE}:\n`);
    console.log(JSON.stringify(rule, null, 2));
    // Keyed off the rule rather than the literal `Link`, so renaming the header
    // in the JSON cannot make the dry run crash instead of showing the change.
    const [[name, header]] = Object.entries(rule.action_parameters.headers);
    console.log(`\n${name} value is ${header.value.length} bytes.\n`);
    return;
  }

  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!process.env.CLOUDFLARE_API_TOKEN || !zone) {
    die('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID must both be set (or pass --dry-run).');
  }

  const entrypoint = `/zones/${zone}/rulesets/phases/${PHASE}/entrypoint`;
  const existing = await cf(entrypoint);

  /*
   * A 404 means the phase has no ruleset yet, which is the normal state for a
   * zone that has never had a transform rule — not an error. Anything else is.
   */
  const rules = existing.ok ? (existing.result.rules ?? []) : [];
  if (!existing.ok && existing.status !== 404) {
    die(`Could not read the ${PHASE} ruleset — ${existing.detail}`);
  }

  /*
   * ⚠️ PUT on a phase entrypoint REPLACES every rule in that phase. So the
   * existing list is read, ours is spliced in by identity, and the whole list
   * goes back. Sending only our rule would silently delete any other transform
   * rule on the zone.
   */
  const index = rules.findIndex((r) => r.ref === RULE_REF || r.description === RULE_DESCRIPTION);
  const next = [...rules];
  if (index >= 0) next[index] = { ...rules[index], ...rule };
  else next.push(rule);

  const written = await cf(entrypoint, { method: 'PUT', body: JSON.stringify({ rules: next }) });
  if (!written.ok) die(`Could not write the rule — ${written.detail}`);

  console.log(
    `\n✓ ${index >= 0 ? 'Updated' : 'Created'} "${RULE_DESCRIPTION}" ` +
      `(${next.length} rule${next.length === 1 ? '' : 's'} in ${PHASE}).`,
  );
  console.log('  Cloudflare applies transform rules within seconds; verify with:\n');
  console.log('    node deploy/cloudflare/apply-link-header.mjs --verify\n');
}

await main();
