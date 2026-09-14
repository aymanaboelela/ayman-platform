#!/usr/bin/env node
/**
 * Push every public URL to IndexNow — Bing, Yandex, Seznam, Naver.
 *
 *   node scripts/indexnow.mjs            # submit everything in the sitemap
 *   node scripts/indexnow.mjs --dry-run  # print what would be sent
 *
 * ## Why this exists
 *
 * Publishing an article used to mean waiting for a crawler to come back on its
 * own schedule — days to weeks. IndexNow is a push: the engines fetch the
 * submitted URLs within hours. **Bing is the reason this is worth having**, as
 * it is the index ChatGPT's search reads, which is the single shortest path
 * from «نشرنا مقال» to «an assistant can cite it».
 *
 * Google does not participate in IndexNow at all. Its equivalent is Search
 * Console's "request indexing", which needs a human with the account.
 *
 * ## The URL list comes from the sitemap, deliberately
 *
 * ⚠️ Do not hand-maintain a list here. `sitemap.xml` is already the site's one
 * assertion of "these URLs belong in an index" — it excludes every `noindex`
 * route, every signed-in surface and every unpublished course, and it is
 * generated from the live catalogue. A second list in this file would be wrong
 * the first time an article is published, and wrong in the dangerous direction:
 * submitting a URL that should not be indexed.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The key, read from the ROUTE DIRECTORY's own name.
 *
 * ⚠️ Not imported from `route.ts` and not pasted here. In IndexNow the file
 * NAME is the key, so the directory under `app/` is the single source of truth
 * — reading it here means renaming the route cannot leave this script pointing
 * at a key the site no longer serves, which is a failure no test could see and
 * that presents as "every submission silently rejected".
 */
const APP_DIR = path.join(import.meta.dirname, '../apps/web/app');
const keyFiles = readdirSync(APP_DIR).filter((name) => /^[0-9a-f]{8,128}\.txt$/.test(name));
if (keyFiles.length !== 1) {
  console.error(`expected exactly one IndexNow key route under app/, found ${keyFiles.length}`);
  process.exit(1);
}
const INDEXNOW_KEY = keyFiles[0].replace(/\.txt$/, '');

/**
 * The host whose URLs get submitted — REQUIRED, with no default.
 *
 * ⚠️ Was the literal `aymanaboelela.com`, and this script now ships in an image
 * that more than one instructor runs. IndexNow submits a list of URLs FOR A
 * HOST and verifies the key by fetching it from that host, so a hardcoded
 * value here does not fail loudly on somebody else's stack — it quietly
 * submits Ayman's sitemap under their key, and their own pages never get
 * pushed to any engine.
 *
 * There is deliberately NO fallback, unlike `TENANT_CONTACT_SEED` and
 * `STARTER_HOME_BLOCKS` which default to Ayman so his stack is unchanged.
 * Those two run automatically on every boot, so they need a default; this is
 * run by hand and nothing invokes it (no workflow, no cron, no package
 * script). A default here would buy one saved keystroke and cost the one
 * mistake nobody can see from the outside.
 *
 *   APP_URL=https://example.com node scripts/indexnow.mjs
 *   node scripts/indexnow.mjs https://example.com
 */
const originArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const ORIGIN = (originArg ?? process.env.APP_URL ?? '').trim().replace(/\/$/, '');

if (ORIGIN === '') {
  console.error(
    'set APP_URL, or pass the origin as an argument:\n' +
      '  APP_URL=https://example.com node scripts/indexnow.mjs\n' +
      '  node scripts/indexnow.mjs https://example.com',
  );
  process.exit(1);
}

let HOST;
try {
  HOST = new URL(ORIGIN).host;
} catch {
  console.error(`"${ORIGIN}" is not a valid origin.`);
  process.exit(1);
}

/**
 * ⚠️ A browser user-agent, not the default.
 *
 * Cloudflare answers a bare script signature on this host with `403 error code:
 * 1010` — a browser-signature ban that reads exactly like a real failure. The
 * sitemap fetch below is a request to our own origin and hits the same rule.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const dryRun = process.argv.includes('--dry-run');

const sitemap = await (await fetch(`${ORIGIN}/sitemap.xml`, { headers: { 'user-agent': UA } })).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (urls.length === 0) {
  console.error('sitemap returned no <loc> entries — refusing to submit an empty list');
  process.exit(1);
}

// The key file has to be reachable BEFORE a submission, or every engine rejects
// the batch. Checking here turns a silent "accepted then discarded" into a
// readable error.
const keyUrl = `${ORIGIN}/${INDEXNOW_KEY}.txt`;
const served = await (await fetch(keyUrl, { headers: { 'user-agent': UA } })).text();
if (served.trim() !== INDEXNOW_KEY) {
  console.error(`key file at ${keyUrl} does not serve the key — deploy first`);
  process.exit(1);
}

console.log(`${urls.length} URLs, key verified at ${keyUrl}`);
if (dryRun) {
  for (const url of urls) console.log('  ', url);
  process.exit(0);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: keyUrl, urlList: urls }),
});

/*
 * 200 and 202 are both success — 202 means "accepted, key validation pending",
 * which is the normal answer for a first submission. 422 is the one worth
 * reading: it means the URLs do not match the host or the key did not validate.
 */
console.log(`${response.status} ${response.statusText}`);
if (!response.ok && response.status !== 202) {
  console.error(await response.text());
  process.exit(1);
}
