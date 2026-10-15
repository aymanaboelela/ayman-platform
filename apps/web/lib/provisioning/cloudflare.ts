import 'server-only';

/**
 * The DNS half of a new instructor's domain — Cloudflare's v4 API, plain fetch.
 *
 * Every instructor's zone lives on the OWNER's Cloudflare account (their R2
 * buckets have to: an R2 custom domain must be a zone in the bucket's account,
 * `lib/video-usage.ts`), so the token that already reads R2 usage for the bill
 * is the one that can also write a new zone's records. Same variable,
 * `CONTROL_PLANE_CF_TOKEN`, with more permissions on it — one more field in
 * one more panel would only be one more thing to get out of step.
 *
 * ## What is automated, and what deliberately is not
 *
 *   · The zone, if it is not on the account yet. Its nameservers are the one
 *     step nobody can do from here — they are set at the REGISTRAR — so the
 *     provisioner hands them back to print rather than pretending.
 *   · Two proxied A records (the site, the media host) pointing at the same
 *     origin as the owner's own apex. Proxied is not optional: the VPS
 *     firewall accepts 80/443 from Cloudflare's ranges only, so a grey-clouded
 *     record is a site that times out.
 *   · SSL mode `full` FIRST, `strict` later. A brand-new stack has no
 *     certificate until Traefik's Let's Encrypt challenge succeeds — and that
 *     challenge arrives through this proxy. Strict before then is a 526 on the
 *     very request that would have fixed it. `finalizeZone` flips it once the
 *     site answers.
 *
 * A record that already exists with DIFFERENT content is left alone and
 * reported. The domain may be serving something real, and a provisioner that
 * silently repoints it has taken a site down to set one up.
 */

const API = 'https://api.cloudflare.com/client/v4';

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly code: 'not-configured' | 'forbidden' | 'conflict' | 'failed',
  ) {
    super(message);
    this.name = 'CloudflareError';
  }
}

function token(): string {
  const value = (process.env.CONTROL_PLANE_CF_TOKEN ?? '').trim();
  if (value === '') throw new CloudflareError('CONTROL_PLANE_CF_TOKEN is not set', 'not-configured');
  return value;
}

export function cloudflareConfigured(): boolean {
  return (process.env.CONTROL_PLANE_CF_TOKEN ?? '').trim() !== '';
}

interface Envelope<T> {
  success: boolean;
  errors?: { code: number; message: string }[];
  result: T;
}

async function cf<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  let body: Envelope<T> | null = null;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    // An HTML error page from the edge; the status below says enough.
  }
  if (!response.ok || !body?.success) {
    const message = body?.errors?.[0]?.message ?? `HTTP ${response.status}`;
    // 403 and the «Authentication error» code (10000) both mean the token is
    // there and lacks a permission — a different fix from a missing token.
    const forbidden = response.status === 403 || body?.errors?.some((error) => error.code === 10000);
    throw new CloudflareError(`${init.method ?? 'GET'} ${path.split('?')[0]}: ${message}`, forbidden ? 'forbidden' : 'failed');
  }
  return body.result;
}

export interface Zone {
  id: string;
  name: string;
  status: string;
  name_servers?: string[];
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
}

export async function findZone(apex: string): Promise<Zone | null> {
  const zones = await cf<Zone[]>(`/zones?name=${encodeURIComponent(apex)}`);
  return zones[0] ?? null;
}

/** The registrable domain a host belongs to, for the zone lookup. Two labels
 *  is right for every domain on the platform today (`.com`); a `.com.eg`
 *  instructor is the day this needs the public-suffix list. */
export function apexOf(host: string): string {
  const labels = host.split('.');
  return labels.slice(-2).join('.');
}

async function accountId(): Promise<string> {
  // The account the video buckets are on — already configured for the bill.
  const origin = process.env.NEXT_PUBLIC_VIDEO_UPLOAD_ORIGIN ?? '';
  const match = /^https:\/\/([0-9a-f]{32})\.r2\.cloudflarestorage\.com/.exec(origin);
  if (match?.[1]) return match[1];
  const accounts = await cf<{ id: string }[]>('/accounts');
  const first = accounts[0]?.id;
  if (!first) throw new CloudflareError('the token can see no Cloudflare account', 'forbidden');
  return first;
}

/** The zone for `apex`, created on the owner's account if it is not there. */
export async function ensureZone(apex: string): Promise<{ zone: Zone; created: boolean }> {
  const existing = await findZone(apex);
  if (existing) return { zone: existing, created: false };
  const zone = await cf<Zone>('/zones', {
    method: 'POST',
    body: { name: apex, account: { id: await accountId() }, type: 'full' },
  });
  return { zone, created: true };
}

/**
 * The origin every instructor's records point at: the owner's own apex A
 * record. One VPS runs every stack (CLAUDE.md §5), so his record IS the
 * answer — and reading it means a server move is one record to change, not a
 * second variable to remember. `CONTROL_PLANE_SERVER_IP` overrides it for the
 * day that stops being true.
 */
export async function originIp(ownerHost: string): Promise<string> {
  const override = (process.env.CONTROL_PLANE_SERVER_IP ?? '').trim();
  if (override !== '') return override;
  const zone = await findZone(apexOf(ownerHost));
  if (!zone) throw new CloudflareError(`no zone for ${ownerHost} on this token`, 'forbidden');
  const records = await cf<DnsRecord[]>(`/zones/${zone.id}/dns_records?type=A&name=${encodeURIComponent(ownerHost)}`);
  const ip = records[0]?.content;
  if (!ip) throw new CloudflareError(`no A record for ${ownerHost}`, 'failed');
  return ip;
}

export type RecordOutcome = 'created' | 'updated' | 'unchanged' | 'conflict';

/**
 * A proxied A record for `name` → `ip`.
 *
 * Same content, not proxied → turned orange (that record could never have
 * served anything through the firewall). Different content, or a CNAME on the
 * name → `conflict`, untouched.
 */
export async function ensureProxiedRecord(zoneId: string, name: string, ip: string): Promise<RecordOutcome> {
  const records = await cf<DnsRecord[]>(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(name)}`);
  const relevant = records.filter((record) => ['A', 'AAAA', 'CNAME'].includes(record.type));
  if (relevant.length === 0) {
    await cf(`/zones/${zoneId}/dns_records`, {
      method: 'POST',
      body: { type: 'A', name, content: ip, proxied: true, ttl: 1, comment: 'control plane' },
    });
    return 'created';
  }
  const match = relevant.find((record) => record.type === 'A' && record.content === ip);
  if (!match || relevant.length > 1) return 'conflict';
  if (match.proxied) return 'unchanged';
  await cf(`/zones/${zoneId}/dns_records/${match.id}`, { method: 'PATCH', body: { proxied: true } });
  return 'updated';
}

async function setting(zoneId: string, id: string, value: string): Promise<void> {
  await cf(`/zones/${zoneId}/settings/${id}`, { method: 'PATCH', body: { value } });
}

/** Day one: reachable through the proxy while the origin has no certificate yet. */
export async function prepareZone(zoneId: string): Promise<void> {
  await setting(zoneId, 'ssl', 'full');
}

/**
 * After the site answers: the settings the three live zones were hardened to
 * on 2026-09-28 — strict TLS to the origin, HTTPS only, nothing below 1.2.
 */
export async function finalizeZone(zoneId: string): Promise<void> {
  await setting(zoneId, 'ssl', 'strict');
  await setting(zoneId, 'always_use_https', 'on');
  await setting(zoneId, 'min_tls_version', '1.2');
  await setting(zoneId, 'tls_1_3', 'on');
}
