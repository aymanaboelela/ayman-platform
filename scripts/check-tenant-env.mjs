#!/usr/bin/env node
/**
 * Preflight for a new instructor's stack. Run it BEFORE the first deploy.
 *
 *   node scripts/check-tenant-env.mjs --first-deploy deploy/tenants/x.env
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
 * ## ⚠️ It is a COPY OF THE BOOT CONTRACT, not a second opinion about it
 *
 * A reviewer filled `deploy/tenant.env.example` exactly as
 * `docs/runbooks/new-tenant.md` says, ran this script, was told «OK — safe to
 * deploy», and the API then refused to start. Two reasons, and both were
 * things this file simply did not know:
 *
 *   · `WA_SERVICE_URL` appeared in neither the template nor the runbook, while
 *     the template shipped `WA_TOKEN=CHANGE_ME` — and `docker-compose.yml`
 *     feeds `WA_TOKEN` to `WA_SERVICE_TOKEN`, which `env.ts` refuses to accept
 *     without its URL.
 *   · `VAPID_SUBJECT=CHANGE_ME` passed here and is rejected by `env.ts`, which
 *     requires `mailto:` or `https://` (RFC 8292).
 *
 * An API that will not boot is not a degraded API. `web` waits on its
 * healthcheck and Traefik has no backend to route to without it, so EVERY page
 * on the domain answers `404 page not found`. A preflight that blesses a
 * config the boot schema rejects is worse than no preflight, because it is the
 * reason nobody reads the deploy log.
 *
 * So every cross-field rule below is a transcription of a specific line in
 * `apps/api/src/config/env.ts` or `apps/api/src/modules/video-mirror/
 * mirror-config.ts`, named in the comment above it. When one of those changes,
 * this file changes with it, and
 * `packages/contracts/src/check-tenant-env.spec.ts` is where that pairing is
 * pinned — including a case that fills the shipped template and asserts the
 * result passes, which is the exact walk the reviewer did.
 *
 * ## The variable names here are the OPERATOR's, not the API's
 *
 * `docker-compose.yml` renames two of them on the way into the container, and
 * both renames have already cost a deploy:
 *
 *   WA_TOKEN      → WA_SERVICE_TOKEN          (compose, `api` service)
 *   VIDEO_ORIGIN  → VIDEO_MIRROR_PUBLIC_URL   (compose, `api` service)
 *
 * This script reads what the operator actually writes, so it checks
 * `WA_TOKEN` and `VIDEO_ORIGIN` — and names the API-side spelling in the
 * message, because that is the name the boot error will print.
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

/**
 * The placeholder `deploy/tenant.env.example` ships on every value that has to
 * be replaced. A constant because it is matched against EVERY key below rather
 * than against a list of names — see the sweep.
 */
const PLACEHOLDER = 'CHANGE_ME';

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

/** `true` when the operator gave the key a value at all. */
function isSet(env, key) {
  return get(env, key) !== '';
}

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * The `httpUrl` refinement in `apps/api/src/config/env.ts`, transcribed.
 *
 * A bare `new URL()` is not enough, and that is the whole reason this helper
 * exists: WHATWG parsing treats an unrecognised scheme as opaque, so
 * `localhost:3300` parses (scheme `localhost`) and `ftp://x` parses, and both
 * satisfy `z.string().url()`. `env.ts` therefore checks the prefix explicitly
 * on APP_URL, BETTER_AUTH_URL, MEDIA_BASE_URL, WA_SERVICE_URL,
 * VIDEO_MIRROR_ENDPOINT and VIDEO_MIRROR_PUBLIC_URL — every one of which is
 * either written here or built by compose out of something written here.
 */
function isHttpUrl(value) {
  if (!/^https?:\/\//.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Characters that break a Postgres connection string even though they are
 * perfectly good password characters.
 *
 * `docker-compose.yml` does not hand the password to the API as a value — it
 * INTERPOLATES it into a URL:
 *
 *   DATABASE_URL: postgresql://ayman_runtime:${RUNTIME_PASSWORD}@postgres:5432/…
 *
 * and `env.ts` parses that with `z.string().url()`. A `/` ends the authority,
 * so `pa/ss` makes the port `ss` and the URL invalid — the API refuses to boot
 * with a message about DATABASE_URL that never mentions the password. A `@`
 * splits the userinfo at the wrong place, and `pg` and libpq disagree about
 * which `@` wins, so it can parse here and connect to the wrong host there. A
 * `#` starts a fragment and silently TRUNCATES the password, which is the
 * worst of the three: the API boots, and authentication fails forever.
 *
 * This is not hypothetical. The runbook said `openssl rand -base64 32`, and
 * base64's alphabet contains `/`: a 44-character base64 string carries at
 * least one about 96% of the time, so the documented command produced a stack
 * that could not start nineteen times in twenty. The runbook now says
 * `openssl rand -hex 32`; this check is what stops the old habit.
 */
const URL_HOSTILE = /[/?#@[\]\s:]/;

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ firstDeploy?: boolean }} [options] `firstDeploy` promotes "no
 *   admin account will be created" from a warning to an error. See the ADMIN_*
 *   block for why that is a flag rather than the default.
 */
export function checkTenantEnv(env, options = {}) {
  errors.length = 0;
  warnings.length = 0;

  const firstDeploy = options.firstDeploy === true;

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
  } else if (!db.includes(PLACEHOLDER) && !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(db)) {
    // It is interpolated into the connection string's PATH and into the
    // healthcheck's `pg_isready -d`, and neither quotes it. A dash or a space
    // here is a database the API cannot reach and a container that never
    // reports healthy — which reads as "postgres is down", not as a typo.
    fail(
      `POSTGRES_DB "${db}" must be a plain identifier (letters, digits and underscores, not ` +
        `starting with a digit). It goes into the connection string and into pg_isready unquoted.`,
    );
  }

  /*
   * ── Required, and required to be DIFFERENT per stack ──────────────────
   *
   * ⚠️ ADMIN_EMAIL and ADMIN_PASSWORD are deliberately NOT in this list any
   * more — see the first-admin block near the bottom. They are required before
   * the first boot and are supposed to be EMPTY after it, so a rule that
   * demands them unconditionally tells an operator with a correct, launched
   * stack «Do NOT deploy this stack» every time they re-run the gate. A gate
   * that is wrong about a correct config is a gate people stop reading.
   */
  for (const required of [
    'POSTGRES_PASSWORD',
    'RUNTIME_PASSWORD',
    'BETTER_AUTH_SECRET',
    'APP_URL',
    'MEDIA_ORIGIN',
  ]) {
    if (get(env, required) === '') fail(`${required} is required and is empty.`);
  }

  /*
   * ── The CHANGE_ME sweep, over EVERY key ──────────────────────────────
   *
   * This used to be a list of seven names while `deploy/tenant.env.example`
   * shipped SIXTEEN placeholder values, so eight of them passed the gate
   * verbatim: TENANT_DISPLAY_NAME, POSTGRES_DB, ADMIN_NAME, VAPID_PUBLIC_KEY,
   * VAPID_PRIVATE_KEY, VAPID_SUBJECT, WA_TOKEN and WA_DEVICE_NAME.
   *
   * `WA_DEVICE_NAME` is the one that shows. `services/wa/src/index.mjs` falls
   * back only on an EMPTY value, so the literal string «CHANGE_ME» becomes the
   * name of the linked device in «الأجهزة المرتبطة» on the instructor's own
   * phone — the one label whose entire job is to let the phone's owner decide
   * whether a linked device is legitimate. An entry nobody recognises gets
   * revoked, and a revoked pairing is that tenant's WhatsApp stopped.
   *
   * A blanket sweep rather than a longer list, so a placeholder added to the
   * template tomorrow is covered the day it lands rather than the day somebody
   * remembers to add it here. Run against `process.env` this also reads the
   * operator's whole shell, which is intentional: a stray CHANGE_ME anywhere
   * in the environment a deploy is launched from is worth one loud false
   * positive, and the identity sweep below has always worked the same way.
   */
  for (const [name, value] of Object.entries(env)) {
    if ((value ?? '').includes(PLACEHOLDER)) fail(`${name} still says ${PLACEHOLDER}.`);
  }

  const secret = get(env, 'BETTER_AUTH_SECRET');
  if (secret !== '' && !secret.includes(PLACEHOLDER) && secret.length < 32) {
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

  // Both passwords end up inside a `postgresql://` URL — see `URL_HOSTILE`.
  for (const name of ['POSTGRES_PASSWORD', 'RUNTIME_PASSWORD']) {
    const password = get(env, name);
    if (password === '' || password.includes(PLACEHOLDER)) continue;
    if (URL_HOSTILE.test(password)) {
      fail(
        `${name} contains a character that breaks the connection string compose builds from it ` +
          `(one of / ? # @ [ ] : or a space). Generate it with \`openssl rand -hex 32\` — base64 ` +
          `output contains "/" almost every time, and the API then fails to boot with an error ` +
          `about DATABASE_URL that never mentions the password.`,
      );
    }
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

  if (appUrl !== '' && !appUrl.includes(PLACEHOLDER) && !appUrl.startsWith('https://')) {
    fail(`APP_URL must be https:// on a real deployment (got "${appUrl}").`);
  }
  /*
   * MEDIA_ORIGIN gets the same scheme check, and not only for HSTS.
   *
   * Compose builds `MEDIA_BASE_URL: ${MEDIA_ORIGIN}/media`, and `env.ts` types
   * that as `httpUrl` — so a bare hostname (`media-x.com`, no scheme) parses
   * as an opaque URL whose scheme is `media-x.com`, fails the refinement, and
   * takes the whole API down at boot. It is also the origin every uploaded
   * image is served from, so plain http means a mixed-content block on a page
   * that is otherwise https.
   */
  if (mediaOrigin !== '' && !mediaOrigin.includes(PLACEHOLDER) && !mediaOrigin.startsWith('https://')) {
    fail(
      `MEDIA_ORIGIN must be https:// (got "${mediaOrigin}"). Compose builds MEDIA_BASE_URL from ` +
        `it and the API requires an http(s) URL there, so a bare hostname stops the boot.`,
    );
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

  /*
   * ── Clarity: absent is NOT the same as empty here ─────────────────────
   *
   * `docker-compose.yml` builds the web image with
   * `${CLARITY_PROJECT_ID-y1hu9w4lii}` — ONE dash, so the default applies only
   * when the key is ABSENT. A declared-but-empty `CLARITY_PROJECT_ID=` turns
   * analytics off; a line that was never written ships this tenant's visitors
   * into Ayman's dashboard.
   *
   * ⚠️ Know what this can and cannot see. `deploy/tenant.env.example` SHIPS
   * the line, so anyone who copied the template has the key declared and this
   * can only fire for somebody who deleted or commented it out. The mistake
   * that actually happens is made in Dokploy's Environment textarea, which
   * this script never reads — which is why `new-tenant.md` §3 now says in as
   * many words to paste the empty line too. This check is a floor, not the
   * defence.
   *
   * `=== undefined` rather than `'CLARITY_PROJECT_ID' in env`: `parseEnvFile`
   * returns a plain object, so `in` also answers true for every inherited key
   * (`constructor`, `toString`) — harmless for this name, wrong the moment
   * anybody reuses the idiom for another one.
   */
  if (env.CLARITY_PROJECT_ID === undefined) {
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

  /*
   * ── The WhatsApp sender: both or neither ──────────────────────────────
   *
   * `apps/api/src/config/env.ts`, the `.refine()` on WA_SERVICE_URL: the URL
   * and the token are set together or omitted together, because a URL with no
   * token is a sidecar that answers 401 to every send — a campaign that fails
   * on the first recipient and looks like a bug in the campaign.
   *
   * ⚠️ THE NAMES DO NOT LINE UP, and that is what took a whole domain down.
   * The operator writes `WA_TOKEN`; compose passes it to the api container as
   * `WA_SERVICE_TOKEN` and passes `WA_SERVICE_URL` straight through. The
   * template shipped `WA_TOKEN=CHANGE_ME` and never mentioned `WA_SERVICE_URL`
   * at all — so the api container got a token with no URL, the refinement
   * rejected it, the container never became healthy, and Traefik answered 404
   * for every page on the domain.
   *
   * The URL is an INTERNAL compose address (`http://wa:3400`): the `wa`
   * service is deliberately off `dokploy-network` and reachable only on the
   * default network. It is the one value in this file that is identical on
   * every stack.
   */
  const waUrl = get(env, 'WA_SERVICE_URL');
  const waToken = get(env, 'WA_TOKEN');
  if (waUrl !== '' && waToken === '') {
    fail(
      'WA_SERVICE_URL is set but WA_TOKEN is empty. Compose feeds WA_TOKEN to the API as ' +
        'WA_SERVICE_TOKEN, and the API refuses to boot with one of the pair missing — which 404s ' +
        'the whole domain through Traefik, not just the marketing screen.',
    );
  }
  if (waToken !== '' && waUrl === '') {
    fail(
      'WA_TOKEN is set but WA_SERVICE_URL is empty. That is the half-configured pair the API ' +
        'rejects at boot (WA_SERVICE_URL and WA_SERVICE_TOKEN must both be set or both omitted). ' +
        'Write WA_SERVICE_URL=http://wa:3400 — the sidecar\'s address on the internal network — ' +
        'or clear WA_TOKEN to leave WhatsApp sending off for this tenant.',
    );
  }
  if (waUrl !== '' && !isHttpUrl(waUrl)) {
    fail(
      `WA_SERVICE_URL "${waUrl}" must be an http:// or https:// URL. A bare "wa:3400" parses as a ` +
        `URL whose SCHEME is "wa", satisfies z.string().url(), and fails the API's explicit ` +
        `scheme check at boot.`,
    );
  }

  /*
   * ── Web Push: all three or none, and the subject has a shape ──────────
   *
   * `env.ts` refines VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT as a
   * set of three, and types the subject as `mailto:` or `https://` because
   * `web-push`'s own `setVapidDetails` throws on anything else (RFC 8292).
   *
   * The template shipped `VAPID_SUBJECT=CHANGE_ME`, which this file accepted
   * and the API rejects at boot. The template now ships `mailto:CHANGE_ME`, so
   * the required shape is visible at the point of editing and the sweep above
   * still refuses to let it deploy unedited.
   */
  const vapid = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
  const vapidSet = vapid.filter((name) => isSet(env, name));
  if (vapidSet.length > 0 && vapidSet.length < vapid.length) {
    fail(
      `Web Push is half-configured: ${vapidSet.join(', ')} set but ` +
        `${vapid.filter((name) => !isSet(env, name)).join(', ')} empty. The API requires all three ` +
        `together or none — generate a pair with \`npx web-push generate-vapid-keys\` and give it ` +
        `a mailto: subject, or clear all three to leave notifications off.`,
    );
  }
  const vapidSubject = get(env, 'VAPID_SUBJECT');
  if (
    vapidSubject !== '' &&
    !vapidSubject.includes(PLACEHOLDER) &&
    !vapidSubject.startsWith('mailto:') &&
    !vapidSubject.startsWith('https://')
  ) {
    fail(
      `VAPID_SUBJECT "${vapidSubject}" must be a mailto: address or an https:// URL (RFC 8292). ` +
        `It is the contact a browser vendor's push service uses when this deployment misbehaves, ` +
        `and the API validates the shape at boot rather than letting every send fail later.`,
    );
  }

  /*
   * ── Google sign-in: both or neither ───────────────────────────────────
   *
   * Two `.refine()`s in `env.ts`, one each way. Half a provider is a «كمّل
   * بحساب جوجل» button that answers 400 with nothing in the log — which is
   * precisely why the pairing is enforced at boot instead of at request time.
   */
  const googleId = isSet(env, 'GOOGLE_CLIENT_ID');
  const googleSecret = isSet(env, 'GOOGLE_CLIENT_SECRET');
  if (googleId !== googleSecret) {
    fail(
      `GOOGLE_CLIENT_${googleId ? 'ID' : 'SECRET'} is set but GOOGLE_CLIENT_` +
        `${googleId ? 'SECRET' : 'ID'} is empty. The API refuses to boot with half a provider. ` +
        `Fill both, or clear both — signing in with a mobile number works either way.`,
    );
  }

  /*
   * ── The video mirror: five or none ────────────────────────────────────
   *
   * `apps/api/src/modules/video-mirror/mirror-config.ts` throws on a partial
   * config, and its own comment says why: half of them set is a bucket the
   * worker cannot write to, or bytes it writes that no student can read, and
   * the symptom surfaces days later as «الفيديو مش شغال» from one school.
   *
   * ⚠️ The fifth key has two names. The operator writes `VIDEO_ORIGIN` — it is
   * also the browser-facing `NEXT_PUBLIC_VIDEO_ORIGIN` build arg — and compose
   * hands it to the API as `VIDEO_MIRROR_PUBLIC_URL`. Somebody reading
   * `mirror-config.ts` and then the template will not find the fifth variable
   * at all, so this message names both spellings.
   */
  const mirror = [
    'VIDEO_MIRROR_ENDPOINT',
    'VIDEO_MIRROR_BUCKET',
    'VIDEO_MIRROR_ACCESS_KEY_ID',
    'VIDEO_MIRROR_SECRET_ACCESS_KEY',
    'VIDEO_ORIGIN',
  ];
  const mirrorSet = mirror.filter((name) => isSet(env, name));
  if (mirrorSet.length > 0 && mirrorSet.length < mirror.length) {
    fail(
      `The video mirror is half-configured: ${mirrorSet.join(', ')} set but ` +
        `${mirror.filter((name) => !isSet(env, name)).join(', ')} empty. Set all five or none — ` +
        `the API throws on a partial config. (VIDEO_ORIGIN is what it calls ` +
        `VIDEO_MIRROR_PUBLIC_URL; compose renames it.)`,
    );
  }
  for (const name of ['VIDEO_MIRROR_ENDPOINT', 'VIDEO_ORIGIN']) {
    const value = get(env, name);
    if (value !== '' && !isHttpUrl(value)) {
      fail(
        `${name} "${value}" must be an http:// or https:// URL — the API types it as one, and a ` +
          `bare hostname stops the boot.`,
      );
    }
  }

  /*
   * ── The first admin ───────────────────────────────────────────────────
   *
   * `apps/api/docker-entrypoint.sh` runs the bootstrap ONLY when ADMIN_EMAIL
   * and ADMIN_PASSWORD are both non-empty, with `ADMIN_ONLY_IF_MISSING=true`
   * so it never touches an existing admin. `docker-compose.yml` then tells the
   * operator, in as many words, to blank them once the account exists.
   *
   * That makes "both empty" two opposite things depending on WHEN you ask, and
   * the old rule — required, always — got it wrong in the direction that costs
   * most: re-running the gate on a correct, launched stack printed «Do NOT
   * deploy this stack», which teaches an operator that this script's verdict is
   * noise.
   *
   * So `--first-deploy` says which side of launch you are on. Half a pair is an
   * error either way — that is the bootstrap silently never running, which is
   * exactly what produced «الإيميل أو الباسورد غلط» on the first attempt, with
   * nothing in the log to say why.
   */
  const adminEmail = get(env, 'ADMIN_EMAIL');
  const adminPassword = get(env, 'ADMIN_PASSWORD');
  if (adminEmail !== '' && adminPassword === '') {
    fail(
      'ADMIN_EMAIL is set but ADMIN_PASSWORD is empty. The entrypoint runs the first-admin ' +
        'bootstrap only when BOTH are present, so it would silently not run and the first sign-in ' +
        'would answer «الإيميل أو الباسورد غلط» with nothing in the log.',
    );
  }
  if (adminPassword !== '' && adminEmail === '') {
    fail(
      'ADMIN_PASSWORD is set but ADMIN_EMAIL is empty. The entrypoint needs both, so no admin ' +
        'account would be created and nobody could sign in to /admin.',
    );
  }
  /*
   * `create-admin.ts` has its own two rules and `docker-entrypoint.sh` runs it
   * with `|| echo WARNING`, so when it throws the API starts anyway and the
   * stack has NO ADMIN ACCOUNT — nobody can sign in, and the only trace is one
   * line in a boot log nobody reads. Checked here so it is caught before the
   * deploy rather than discovered after it.
   *
   * Both are skipped when the value is empty: empty is the correct state after
   * launch, and the pair rules below are what have an opinion about it.
   */
  if (adminPassword !== '' && adminPassword.length < 12) {
    fail(
      `ADMIN_PASSWORD is ${adminPassword.length} characters; create-admin.ts requires at least 12 ` +
        `and the entrypoint swallows its error, so the platform would boot with no admin account.`,
    );
  }
  if (adminEmail !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    fail(`ADMIN_EMAIL "${adminEmail}" is not an email address (create-admin.ts rejects it).`);
  }

  if (adminEmail === '' && adminPassword === '') {
    const message =
      'ADMIN_EMAIL and ADMIN_PASSWORD are both empty, so no admin account will be created. That ' +
      'is correct AFTER launch (compose says to blank them once the account exists) and fatal ' +
      'before it — nobody can sign in to /admin on a fresh database.';
    if (firstDeploy) fail(message);
    else warn(`${message} Re-run with --first-deploy if this stack has not launched yet.`);
  }

  // ── Things that work but will be regretted ─────────────────────────────
  if (get(env, 'TENANT_DISPLAY_NAME') === '') {
    warn('TENANT_DISPLAY_NAME is empty — the first landing page will say «المنصة التعليمية».');
  }
  if (get(env, 'WA_DEVICE_NAME') === '') {
    warn(`WA_DEVICE_NAME is empty — the phone will show "${key || '<tenant>'} Platform".`);
  }
  if (waToken === '') {
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
  const args = process.argv.slice(2);
  const firstDeploy = args.includes('--first-deploy');
  const path = args.find((arg) => !arg.startsWith('--'));
  let env;
  try {
    env = path ? parseEnvFile(path) : process.env;
  } catch (error) {
    console.error(`cannot read ${path}: ${error.message}`);
    process.exit(1);
  }

  const { errors: found, warnings: noted } = checkTenantEnv(env, { firstDeploy });

  for (const message of noted) console.log(`  warn   ${message}`);
  for (const message of found) console.error(`  ERROR  ${message}`);

  if (found.length > 0) {
    console.error(`\n${found.length} problem(s). Do NOT deploy this stack.`);
    process.exit(1);
  }
  console.log(`\nOK${noted.length > 0 ? ` (${noted.length} warning(s))` : ''} — safe to deploy.`);
}

export { parseEnvFile };
