#!/usr/bin/env node
/**
 * Preflight for a new instructor's stack. Run it BEFORE the first deploy.
 *
 *   node scripts/check-tenant-env.mjs deploy/tenants/x.env
 *   node scripts/check-tenant-env.mjs            # checks process.env
 *
 * ## Why this exists
 *
 * Every tenant-isolation default in this codebase is fail-closed: an unset
 * `TENANT_KEY` means "this is Ayman's stack", so a second instructor's stack
 * that forgets it inherits his WhatsApp number, his socials, his landing page
 * and his Clarity project — and nothing looks broken. The page renders, the
 * links work, the number is valid. It is simply the wrong person's.
 *
 * Fail-closed defaults make the leak IMPOSSIBLE TO NOTICE rather than
 * impossible to cause, so the config needs a gate of its own. That gate is
 * this file. It is deliberately a plain script with no dependencies so it runs
 * on a bare server before anything is installed.
 *
 * Exit 0 = safe to deploy. Exit 1 = do not deploy.
 */

import { readFileSync } from 'node:fs';

/** Values Ayman's live stack uses. Any of them on another stack is a leak. */
const AYMANS = {
  POSTGRES_DB: 'ayman_platform',
  CLARITY_PROJECT_ID: 'y1hu9w4lii',
  WHATSAPP: '+201021196367',
  DOMAIN: 'aymanaboelela.com',
};

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}
function warn(message) {
  warnings.push(message);
}

/**
 * Parses `KEY=value` lines the way Docker Compose reads an env file: no shell
 * expansion, no multi-line values, a whole-line `#` is a comment, and an
 * inline ` #` ends an UNQUOTED value. Surrounding quotes are stripped because
 * a Dokploy paste often carries them and `"+2010…"` is not a phone number.
 *
 * Matching Compose here is the point, not a nicety: a checker that disagreed
 * with the thing actually reading the file would either flag values that
 * deploy fine, or bless a value Compose is about to truncate.
 */
function parseEnvFile(path) {
  const out = {};
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at === -1) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();

    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1);

    if (quoted) {
      value = value.slice(1, -1);
    } else {
      // Compose strips an inline comment from an UNQUOTED value, and the
      // template is annotated (`TENANT_KEY=x   # مثال: …`). Without this the
      // checker reads the comment as part of the value and reports problems
      // the real deployment would never have — or, worse, accepts a value
      // Compose is about to truncate.
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
      if (value.startsWith('#')) value = '';
    }
    out[key] = value;
  }
  return out;
}

/** Trimmed value, or '' for both unset and empty — the two mean the same here. */
function get(env, key) {
  return (env[key] ?? '').trim();
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function checkTenantEnv(env) {
  errors.length = 0;
  warnings.length = 0;

  const key = get(env, 'TENANT_KEY');

  // ── The gate itself ────────────────────────────────────────────────────
  if (key === '' || key === 'ayman') {
    fail(
      `TENANT_KEY is ${key === '' ? 'not set' : '"ayman"'}. That means "this IS Ayman's stack", ` +
        `so this deployment would seed HIS WhatsApp number and socials, serve HIS landing page, ` +
        `and name HIS device on the instructor's phone. Set it to this instructor's own slug.`,
    );
  } else if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(key)) {
    fail(`TENANT_KEY "${key}" must be lowercase letters, digits and dashes (2–31 chars).`);
  }

  // ── Database ───────────────────────────────────────────────────────────
  const db = get(env, 'POSTGRES_DB');
  if (db === '') {
    fail('POSTGRES_DB is not set, so this stack would default to Ayman\'s database name.');
  } else if (db === AYMANS.POSTGRES_DB) {
    fail(
      `POSTGRES_DB is "${AYMANS.POSTGRES_DB}" — Ayman's live database. Two stacks pointed at one ` +
        `database is the exact failure this whole design exists to prevent.`,
    );
  }

  // ── Required, and required to be DIFFERENT per stack ───────────────────
  for (const required of [
    'POSTGRES_PASSWORD',
    'RUNTIME_PASSWORD',
    'BETTER_AUTH_SECRET',
    'APP_URL',
    'MEDIA_ORIGIN',
    'ADMIN_NAME',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'WA_SERVICE_URL',
  ]) {
    if (get(env, required) === '') fail(`${required} is required and is empty.`);
  }

  // CHANGE_ME on EVERY key, not a hand-kept list. The template ships fifteen of
  // them and the list only covered seven, so `VAPID_SUBJECT=CHANGE_ME` sailed
  // through the check and then crashed the API at boot. A list that has to be
  // extended every time the template grows is a list that will not be.
  for (const [name, value] of Object.entries(env)) {
    if ((value ?? '').includes('CHANGE_ME')) fail(`${name} still says CHANGE_ME.`);
  }

  /*
   * `create-admin.ts` has its own two rules, and the entrypoint runs it with
   * `|| echo WARNING` — so when it throws, the API starts anyway and the new
   * platform has NO ADMIN ACCOUNT. Nobody can sign in, and the only trace is
   * one line in a boot log nobody reads. Mirrored here so it is caught before
   * the deploy rather than discovered after it.
   */
  const adminPassword = get(env, 'ADMIN_PASSWORD');
  if (adminPassword !== '' && adminPassword.length < 12) {
    fail(
      `ADMIN_PASSWORD is ${adminPassword.length} characters; create-admin.ts requires at least 12 ` +
        `and the entrypoint swallows its error, so the platform would boot with no admin account.`,
    );
  }
  const adminEmail = get(env, 'ADMIN_EMAIL');
  if (adminEmail !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    fail(`ADMIN_EMAIL "${adminEmail}" is not an email address (create-admin.ts rejects it).`);
  }

  /*
   * Both database passwords are interpolated RAW into a connection string:
   * `postgresql://ayman_runtime:${RUNTIME_PASSWORD}@postgres:5432/...`. A `/`,
   * `@`, `:`, `?` or `#` in the value re-parses that URL into something else,
   * and the API restart-loops on a connection error that names none of this.
   *
   * `openssl rand -base64 32` produces `/` about half the time, which is what
   * the template used to tell operators to run. It now says `-hex`.
   */
  for (const key of ['POSTGRES_PASSWORD', 'RUNTIME_PASSWORD']) {
    const value = get(env, key);
    const bad = [...new Set([...value].filter((ch) => '/@:?#[]'.includes(ch)))];
    if (bad.length > 0) {
      fail(
        `${key} contains ${bad.map((c) => `"${c}"`).join(', ')} — it is interpolated into a ` +
          `postgresql:// URL and these re-parse it. Use \`openssl rand -hex 32\`.`,
      );
    }
  }

  const secret = get(env, 'BETTER_AUTH_SECRET');
  if (secret !== '' && !secret.includes('CHANGE_ME') && secret.length < 32) {
    fail(`BETTER_AUTH_SECRET is ${secret.length} characters; it needs at least 32.`);
  }

  if (
    get(env, 'POSTGRES_PASSWORD') !== '' &&
    get(env, 'POSTGRES_PASSWORD') === get(env, 'RUNTIME_PASSWORD')
  ) {
    fail(
      'POSTGRES_PASSWORD and RUNTIME_PASSWORD are the same. The whole point of the split is that ' +
        'the running server cannot execute DDL; one password makes the two roles interchangeable.',
    );
  }

  // ── Origins ────────────────────────────────────────────────────────────
  const appUrl = get(env, 'APP_URL');
  const mediaOrigin = get(env, 'MEDIA_ORIGIN');
  const appOrigin = originOf(appUrl);
  const mediaOriginParsed = originOf(mediaOrigin);

  if (appUrl !== '' && appOrigin === null) fail(`APP_URL "${appUrl}" is not a valid URL.`);
  if (mediaOrigin !== '' && mediaOriginParsed === null) {
    fail(`MEDIA_ORIGIN "${mediaOrigin}" is not a valid URL.`);
  }
  if (appOrigin !== null && appOrigin === mediaOriginParsed) {
    fail(
      'APP_URL and MEDIA_ORIGIN are the same origin. The API asserts they differ and refuses to ' +
        'boot — and a container that will not boot 404s the entire domain through Traefik.',
    );
  }
  /*
   * A BARE origin, because both values are concatenated by plain string:
   * `MEDIA_BASE_URL: ${MEDIA_ORIGIN}/media` in docker-compose.yml. A trailing
   * slash gives `//media` and a path gives `/x/media`, and every media URL
   * 404s. Every other rule here runs on `new URL(v).origin`, which DISCARDS
   * exactly the part that breaks it — so the raw string has to be compared
   * against its own origin.
   */
  for (const [key, raw, parsed] of [
    ['APP_URL', appUrl, appOrigin],
    ['MEDIA_ORIGIN', mediaOrigin, mediaOriginParsed],
  ]) {
    if (raw !== '' && parsed !== null && raw !== parsed) {
      fail(`${key} must be a bare origin with no path, port or trailing slash — got "${raw}", expected "${parsed}".`);
    }
  }

  if (appUrl !== '' && !appUrl.startsWith('https://')) {
    fail(`APP_URL must be https:// on a real deployment (got "${appUrl}").`);
  }
  if (appOrigin !== null && appOrigin.endsWith(AYMANS.DOMAIN)) {
    fail(
      `APP_URL is under ${AYMANS.DOMAIN}. Each instructor needs their own apex domain: HSTS ships ` +
        `includeSubDomains;preload and Cloudflare's free certificate covers only one label deep, ` +
        `so a media subdomain under this would have no certificate at all.`,
    );
  }

  // ── Ayman's real-world identity must not appear anywhere ───────────────
  for (const [name, value] of Object.entries(env)) {
    const text = (value ?? '').trim();
    if (text === '') continue;
    if (text.includes(AYMANS.WHATSAPP) || text.includes(AYMANS.WHATSAPP.slice(1))) {
      fail(`${name} contains Ayman's personal WhatsApp number.`);
    }
    if (text.includes(AYMANS.DOMAIN) && name !== 'APP_URL') {
      fail(`${name} points at ${AYMANS.DOMAIN}.`);
    }
    if (text === AYMANS.CLARITY_PROJECT_ID) {
      fail(`${name} is Ayman's Clarity project id — this tenant's sessions would land in his dashboard.`);
    }
  }

  // ── Clarity: absent is NOT the same as empty here ──────────────────────
  // docker-compose.yml uses `${CLARITY_PROJECT_ID-…}` with ONE dash, so an
  // absent key takes Ayman's project while an empty one disables analytics.
  if (!('CLARITY_PROJECT_ID' in env)) {
    fail(
      'CLARITY_PROJECT_ID is absent. The compose default uses one dash, so absent means ' +
        "Ayman's real Clarity project — this tenant's visitors would be recorded into his " +
        'dashboard. Set it to this instructor\'s own project, or write `CLARITY_PROJECT_ID=` ' +
        'with nothing after it to turn analytics off.',
    );
  }

  /*
   * Three groups the API enforces at BOOT and this did not check at all. Each
   * one half-filled is a container that will not start — and a container that
   * will not start 404s the whole domain through Traefik, which reads as "the
   * site is down", not as "one variable is missing".
   */
  const GROUPS = [
    {
      name: 'the video mirror',
      keys: ['VIDEO_ORIGIN', 'VIDEO_MIRROR_ENDPOINT', 'VIDEO_MIRROR_BUCKET', 'VIDEO_MIRROR_ACCESS_KEY_ID', 'VIDEO_MIRROR_SECRET_ACCESS_KEY'],
    },
    { name: 'Google sign-in', keys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] },
    { name: 'web push', keys: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] },
    { name: 'WhatsApp', keys: ['WA_SERVICE_URL', 'WA_TOKEN'] },
  ];
  for (const { name, keys } of GROUPS) {
    const set = keys.filter((key) => get(env, key) !== '');
    if (set.length > 0 && set.length < keys.length) {
      const missing = keys.filter((key) => get(env, key) === '');
      fail(`${name} is half-configured — ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} empty. Set all of ${keys.join(', ')} or none.`);
    }
  }

  /*
   * A social link that is not https fails `ContactSchema` — and it fails
   * inside `seed.ts`, which runs on EVERY container boot, so the stack comes
   * up with the seed erroring every time and the settings never populated.
   */
  for (const key of ['TENANT_YOUTUBE', 'TENANT_INSTAGRAM', 'TENANT_TIKTOK', 'TENANT_FACEBOOK', 'TENANT_WHATSAPP_CHANNEL']) {
    const value = get(env, key);
    if (value === '') continue;
    if (originOf(value) === null || !value.startsWith('https://')) {
      fail(`${key} must be an https:// URL — "${value}" makes the settings seed throw on every boot.`);
    }
  }

  // ── Phone shape ────────────────────────────────────────────────────────
  const whatsapp = get(env, 'TENANT_WHATSAPP');
  if (whatsapp !== '') {
    if (!/^\+[1-9]\d{7,14}$/.test(whatsapp)) {
      fail(`TENANT_WHATSAPP "${whatsapp}" is not E.164 — it must be "+" then digits only.`);
    } else if (whatsapp.startsWith('+200')) {
      // The specific mistake, and a generic E.164 regex cannot see it: `+20`
      // is a valid country code and `0102…` is all digits, so `+200102…`
      // passes every shape check and is simply not a number that exists. The
      // trunk `0` is REPLACED by the country code, not kept after it. This is
      // documented on `OFFICIAL_WHATSAPP_E164` because it already happened
      // once, and an un-normalised number is an account nobody can sign in to.
      fail(
        `TENANT_WHATSAPP "${whatsapp}" keeps Egypt's trunk zero. The national form «0102 1196367» ` +
          `becomes "+201021196367" — the leading 0 is replaced by +20, not kept after it.`,
      );
    } else if (whatsapp.startsWith('+20') && !/^\+201\d{9}$/.test(whatsapp)) {
      warn(
        `TENANT_WHATSAPP "${whatsapp}" is +20 but not an Egyptian mobile (+201 then 9 digits). ` +
          `Check it is the number the instructor actually uses on WhatsApp.`,
      );
    }
  }

  // ── Things that work but will be regretted ─────────────────────────────
  if (get(env, 'TENANT_DISPLAY_NAME') === '') {
    warn('TENANT_DISPLAY_NAME is empty — the first landing page will say «المنصة التعليمية».');
  }
  if (get(env, 'WA_DEVICE_NAME') === '') {
    warn(`WA_DEVICE_NAME is empty — the phone will show "${key || '<tenant>'} Platform".`);
  }
  if (get(env, 'WA_TOKEN') === '') {
    warn('WA_TOKEN is empty — WhatsApp sending is off for this tenant.');
  }
  if (get(env, 'VAPID_PUBLIC_KEY') === '' || get(env, 'VAPID_PRIVATE_KEY') === '') {
    warn('VAPID keys are empty — web push notifications are off for this tenant.');
  }
  for (const social of [
    'TENANT_YOUTUBE',
    'TENANT_INSTAGRAM',
    'TENANT_TIKTOK',
    'TENANT_FACEBOOK',
    'TENANT_WHATSAPP',
  ]) {
    if (get(env, social) === '') warn(`${social} is empty — that link will not be rendered at all.`);
  }

  return { errors: [...errors], warnings: [...warnings] };
}

// ── CLI ──────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const path = process.argv[2];
  let env;
  try {
    env = path ? parseEnvFile(path) : process.env;
  } catch (error) {
    console.error(`cannot read ${path}: ${error.message}`);
    process.exit(1);
  }

  const { errors: found, warnings: noted } = checkTenantEnv(env);

  for (const message of noted) console.log(`  warn   ${message}`);
  for (const message of found) console.error(`  ERROR  ${message}`);

  if (found.length > 0) {
    console.error(`\n${found.length} problem(s). Do NOT deploy this stack.`);
    process.exit(1);
  }
  console.log(`\nOK${noted.length > 0 ? ` (${noted.length} warning(s))` : ''} — safe to deploy.`);
}

export { parseEnvFile };
