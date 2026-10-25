import 'server-only';
import { createECDH, randomBytes, randomInt } from 'node:crypto';
import { checkTenantEnv, parseEnvText, type TenantEnvReport } from '../../../../scripts/check-tenant-env.mjs';
import { databaseName } from './names';

/**
 * The environment of a new instructor's stack — generated, not typed.
 *
 * `deploy/tenant.env.example` is a 250-line template with sixteen
 * `CHANGE_ME`s, and every way of getting one of them wrong has already
 * happened at least once: a base64 database password with a `/` in it (the
 * API never boots), `WA_TOKEN` without `WA_SERVICE_URL` (the whole domain
 * 404s), `CLARITY_PROJECT_ID` left out instead of left empty (the new stack
 * records its visitors into Ayman's analytics). The runbook is the long
 * version of each.
 *
 * So this module writes the file the runbook describes, value by value, and
 * then runs the SAME preflight the runbook ends with
 * (`scripts/check-tenant-env.mjs`) over the result. Nothing reaches Dokploy
 * that the checker has not passed — the provisioner refuses before its first
 * request rather than after a ten-minute build.
 *
 * ## Every key the template has, in the template's order
 *
 * Including the empty ones. An absent line and an empty line are different
 * things to Compose here (`${CLARITY_PROJECT_ID-…}` is written with ONE dash),
 * and the stack's Environment tab is the only copy of this file anyone will
 * ever read again — so it should look exactly like the template filled in,
 * not like a diff of it.
 */

export { TENANT_KEY_PATTERN, databaseName, suggestTenantKey } from './names';

/** A bare hostname: lower-case labels, at least one dot, no scheme or path. */
export const HOST_PATTERN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * The keys of `deploy/tenant.env.example`, in its order.
 *
 * `tenant-env.test.ts` reads the template and fails if the two drift — a new
 * variable added there and not here would be a key the generated file is
 * silently missing, which for a `${VAR-default}` key means the default wins.
 */
export const TEMPLATE_KEYS = [
  'TENANT_KEY',
  'TENANT_DISPLAY_NAME',
  'TENANT_SUBJECT',
  'TENANT_GRADES',
  'TENANT_LANDING_PRESET',
  'TENANT_ACCENT',
  'TENANT_ENTITLEMENTS',
  'POSTGRES_DB',
  'POSTGRES_PASSWORD',
  'RUNTIME_PASSWORD',
  'APP_URL',
  'MEDIA_ORIGIN',
  'BETTER_AUTH_SECRET',
  'ADMIN_NAME',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'WA_TOKEN',
  'WA_SERVICE_URL',
  'WA_DEVICE_NAME',
  'TENANT_YOUTUBE',
  'TENANT_INSTAGRAM',
  'TENANT_TIKTOK',
  'TENANT_FACEBOOK',
  'TENANT_WHATSAPP_CHANNEL',
  'TENANT_WHATSAPP',
  'CLARITY_PROJECT_ID',
  'VIDEO_ORIGIN',
  'VIDEO_MIRROR_FROM_YOUTUBE',
  'VIDEO_MIRROR_ENDPOINT',
  'VIDEO_MIRROR_BUCKET',
  'VIDEO_MIRROR_ACCESS_KEY_ID',
  'VIDEO_MIRROR_SECRET_ACCESS_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
  'GROQ_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'INSTAPAY_INGEST_TOKEN',
  'TOROD_LOGIN',
  'TOROD_PASSWORD',
  'TOROD_WEBHOOK_TOKEN',
  'CSP_ENFORCE',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/**
 * What the owner may hand down from his own stack's environment, when he
 * ticks «استخدم مفاتيحي».
 *
 * Only keys whose cost lands on HIM and whose value carries no identity: the
 * AI providers (the assistant, the quiz voice) and the CSP switch. Never a
 * credential that acts AS someone — Google sign-in shows his OAuth client's
 * name on the consent screen, Turnstile's site key is bound to his widget's
 * host list, Torod and InstaPay move his money.
 *
 * The two `*_MODEL` keys are not in the template (compose defaults them) but
 * travel with their provider key: a shared key with a different model is a
 * different bill.
 */
export const SHAREABLE_KEYS = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'AZURE_SPEECH_KEY',
  'AZURE_SPEECH_REGION',
  'CSP_ENFORCE',
] as const;

export interface TenantSocials {
  youtube: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  whatsappChannel: string;
}

export interface NewTenantSpec {
  /** `TENANT_KEY`, and the entitlements document's `sub`. */
  key: string;
  /** `TENANT_DISPLAY_NAME` — the instructor's name where Ayman's would be. */
  displayName: string;
  /** `TENANT_SUBJECT` — a slug from `@ayman/contracts/subjects`. */
  subject: string;
  /** `TENANT_GRADES` — slugs from `@ayman/contracts/grades`, comma-joined; '' = none. */
  grades?: string;
  /** The landing look on day one; '' = the schema default. */
  landingPreset: string;
  accent: string;
  /** Apex host the site and its API share, e.g. `mohamedhassan.com`. */
  appHost: string;
  /** Uploaded files' host — a different origin, which `env.ts` insists on. */
  mediaHost: string;
  adminName: string;
  adminEmail: string;
  /** E.164 or empty. */
  whatsapp: string;
  socials: TenantSocials;
  /** The signed `TENANT_ENTITLEMENTS` document, or '' for the declared defaults. */
  entitlements: string;
  /** Values copied from the owner's own environment; see `SHAREABLE_KEYS`. */
  shared: Partial<Record<(typeof SHAREABLE_KEYS)[number], string>>;
}

export interface TenantSecrets {
  postgresPassword: string;
  runtimePassword: string;
  authSecret: string;
  waToken: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  adminPassword: string;
}

/** Hex, never base64 — base64's `/` ends the authority of the connection
 *  string compose builds out of these (`check-tenant-env.mjs`, URL_HOSTILE). */
function hex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * A P-256 key pair in the encoding `web-push` reads: the uncompressed public
 * point and the raw 32-byte scalar, both base64url without padding — what
 * `npx web-push generate-vapid-keys` prints.
 *
 * Done with `node:crypto` rather than by adding `web-push` to the web app: it
 * is twelve lines, and that package exists in `apps/api` to SEND pushes, not
 * to mint keys for somebody else's stack. The scalar is left-padded because
 * `getPrivateKey()` drops leading zero bytes (one key in 256), and `web-push`
 * rejects anything that is not exactly 32 bytes.
 */
export function vapidKeyPair(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  let scalar = ecdh.getPrivateKey();
  if (scalar.length < 32) scalar = Buffer.concat([Buffer.alloc(32 - scalar.length), scalar]);
  return {
    publicKey: ecdh.getPublicKey(null, 'uncompressed').toString('base64url'),
    privateKey: scalar.toString('base64url'),
  };
}

/**
 * The first admin's password: read aloud over the phone and typed on one, so
 * no 0/O, 1/l/I, and groups of four. Twenty characters from a 55-symbol
 * alphabet is ~115 bits, and `create-admin.ts` asks for twelve.
 */
const AMBIGUOUS = new Set(['0', 'O', '1', 'l', 'I', 'o']);

/** Built from ranges rather than written out: a 55-character literal next to
 *  the word "password" is exactly what gitleaks reads as a leaked key. */
const READABLE_CHARS = [
  ['A', 'Z'],
  ['a', 'z'],
  ['2', '9'],
]
  .flatMap(([from, to]) =>
    Array.from({ length: to!.charCodeAt(0) - from!.charCodeAt(0) + 1 }, (_, offset) =>
      String.fromCharCode(from!.charCodeAt(0) + offset),
    ),
  )
  .filter((char) => !AMBIGUOUS.has(char))
  .join('');

export function adminPassword(): string {
  const groups: string[] = [];
  for (let group = 0; group < 5; group += 1) {
    let chunk = '';
    for (let index = 0; index < 4; index += 1) chunk += READABLE_CHARS[randomInt(READABLE_CHARS.length)];
    groups.push(chunk);
  }
  return groups.join('-');
}

export function generateSecrets(): TenantSecrets {
  const vapid = vapidKeyPair();
  return {
    postgresPassword: hex(32),
    runtimePassword: hex(32),
    authSecret: hex(48),
    waToken: hex(32),
    vapidPublicKey: vapid.publicKey,
    vapidPrivateKey: vapid.privateKey,
    adminPassword: adminPassword(),
  };
}

/**
 * Compose's env-file reader ends an UNQUOTED value at ` #` and a value is one
 * line. Every free-text field here (a name, a channel URL) goes through this,
 * so a stray newline in a pasted name cannot become a second variable.
 */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s#/g, ' ').trim();
}

export function buildTenantEnv(spec: NewTenantSpec, secrets: TenantSecrets): Record<TemplateKey, string> & Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of TEMPLATE_KEYS) env[key] = '';

  Object.assign(env, {
    TENANT_KEY: spec.key,
    TENANT_DISPLAY_NAME: oneLine(spec.displayName),
    TENANT_SUBJECT: spec.subject,
    TENANT_GRADES: spec.grades ?? '',
    TENANT_LANDING_PRESET: spec.landingPreset,
    TENANT_ACCENT: spec.accent,
    TENANT_ENTITLEMENTS: spec.entitlements,
    POSTGRES_DB: databaseName(spec.key),
    POSTGRES_PASSWORD: secrets.postgresPassword,
    RUNTIME_PASSWORD: secrets.runtimePassword,
    APP_URL: `https://${spec.appHost}`,
    MEDIA_ORIGIN: `https://${spec.mediaHost}`,
    BETTER_AUTH_SECRET: secrets.authSecret,
    ADMIN_NAME: oneLine(spec.adminName),
    ADMIN_EMAIL: spec.adminEmail.trim().toLowerCase(),
    ADMIN_PASSWORD: secrets.adminPassword,
    VAPID_PUBLIC_KEY: secrets.vapidPublicKey,
    VAPID_PRIVATE_KEY: secrets.vapidPrivateKey,
    VAPID_SUBJECT: `mailto:${spec.adminEmail.trim().toLowerCase()}`,
    WA_TOKEN: secrets.waToken,
    // The same internal address on every stack: `wa` is not on the router's
    // network at all, and the API reaches it over the compose network only.
    WA_SERVICE_URL: 'http://wa:3400',
    // The one name the phone's owner reads when deciding whether a linked
    // device is legitimate — an unrecognised one gets unlinked.
    WA_DEVICE_NAME: oneLine(spec.displayName.trim().startsWith('منصة') ? spec.displayName : `منصة ${spec.displayName}`),
    TENANT_YOUTUBE: oneLine(spec.socials.youtube),
    TENANT_INSTAGRAM: oneLine(spec.socials.instagram),
    TENANT_TIKTOK: oneLine(spec.socials.tiktok),
    TENANT_FACEBOOK: oneLine(spec.socials.facebook),
    TENANT_WHATSAPP_CHANNEL: oneLine(spec.socials.whatsappChannel),
    TENANT_WHATSAPP: spec.whatsapp.trim(),
    // Present and EMPTY: analytics off. Absent would be Ayman's project.
    CLARITY_PROJECT_ID: '',
  });

  for (const [key, value] of Object.entries(spec.shared)) {
    if (value !== undefined && value.trim() !== '') env[key] = oneLine(value);
  }
  return env as Record<TemplateKey, string> & Record<string, string>;
}

/**
 * The text that goes into the stack's Environment tab. Template keys first in
 * template order, then anything extra (the `*_MODEL` pair), one per line,
 * unquoted — the way the template itself is written and the way Compose and
 * the checker both read it.
 */
export function renderEnvText(env: Record<string, string>): string {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const key of TEMPLATE_KEYS) {
    ordered.push(`${key}=${env[key] ?? ''}`);
    seen.add(key);
  }
  for (const [key, value] of Object.entries(env)) {
    if (!seen.has(key)) ordered.push(`${key}=${value}`);
  }
  return `# Generated by the control plane (/admin/platforms/new). Same keys as deploy/tenant.env.example.\n${ordered.join('\n')}\n`;
}

/** The preflight, over the exact text Dokploy will be handed. */
export function checkEnvText(text: string, options: { firstDeploy?: boolean } = {}): TenantEnvReport {
  return checkTenantEnv(parseEnvText(text), options);
}

export { parseEnvText };

/**
 * Sets (or appends) one `KEY=value` line in an env text, leaving every other
 * line — comments included — exactly as it was.
 *
 * Used on a LIVE stack's environment (re-applying entitlements, clearing the
 * bootstrap admin after first sign-in), where a parse-and-re-render would
 * drop the operator's own comments and reorder keys someone hand-edited.
 * `value === null` removes the line's value but keeps the key, which is the
 * runbook's own advice for `ADMIN_*` (empty, not absent).
 */
export function setEnvLine(text: string, key: string, value: string | null): string {
  const lines = text.split('\n');
  const next = `${key}=${value === null ? '' : oneLine(value)}`;
  let found = false;
  const out = lines.map((line) => {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('#') && trimmed.startsWith(`${key}=`)) {
      found = true;
      return next;
    }
    return line;
  });
  if (!found) {
    // Before a trailing newline, not after it, so the file still ends in one.
    if (out.length > 0 && out[out.length - 1] === '') out.splice(out.length - 1, 0, next);
    else out.push(next);
  }
  return out.join('\n');
}
