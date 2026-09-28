import 'server-only';
import { summarise, type OperationGroup, type StorageSample, type UsagePeriod } from './video-usage-math';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «كل مدرّس رفع كام جيجا ويتكلّف كام» — video storage per teacher, for billing.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every teacher's videos live in a bucket on the OWNER's Cloudflare account
 * (their domains are zones there, and an R2 custom domain must be a zone in
 * the bucket's account), so the bill for all of them lands on him. This is
 * how he sees who owes what.
 *
 * The numbers are Cloudflare's own — the GraphQL Analytics API behind the R2
 * dashboard — not a count of our rows: it is the same data the invoice is
 * computed from, and it needs no request to any teacher's stack (CLAUDE.md
 * §٢). Buckets are `<tenant-key>-video` by convention.
 *
 * Configuration, on the owner's stack only:
 *   * `CONTROL_PLANE_CF_TOKEN` — an API token with «Account Analytics: Read».
 *   * the account id is read off `NEXT_PUBLIC_VIDEO_UPLOAD_ORIGIN`
 *     (`https://<account>.r2.cloudflarestorage.com`), which is already there.
 */

export type { UsagePeriod };

export interface TenantVideoUsage {
  key: string;
  name: string;
  bucket: string;
  /** Bytes stored at the latest sample. */
  storedBytes: number;
  objectCount: number;
  thisMonth: UsagePeriod;
  lastMonth: UsagePeriod;
}

export type VideoUsageResult =
  | { ok: true; rows: TenantVideoUsage[] }
  | { ok: false; reason: 'not-configured' | 'failed'; detail?: string };

function accountId(): string | null {
  const origin = process.env.NEXT_PUBLIC_VIDEO_UPLOAD_ORIGIN ?? '';
  const match = /^https:\/\/([0-9a-f]{32})\.r2\.cloudflarestorage\.com/.exec(origin);
  return match?.[1] ?? null;
}

const QUERY = `query ($account: string!, $bucket: string!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      storage: r2StorageAdaptiveGroups(
        limit: 10000
        filter: { datetime_geq: $start, datetime_leq: $end, bucketName: $bucket }
        orderBy: [datetime_ASC]
      ) {
        max { payloadSize objectCount }
        dimensions { datetime }
      }
      ops: r2OperationsAdaptiveGroups(
        limit: 10000
        filter: { datetime_geq: $start, datetime_leq: $end, bucketName: $bucket }
      ) {
        sum { requests }
        dimensions { actionType }
      }
    }
  }
}`;

async function fetchPeriod(
  token: string,
  account: string,
  bucket: string,
  start: Date,
  end: Date,
): Promise<{ storage: StorageSample[]; ops: OperationGroup[] }> {
  const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: { account, bucket, start: start.toISOString(), end: end.toISOString() },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json()) as {
    data?: { viewer?: { accounts?: { storage?: StorageSample[]; ops?: OperationGroup[] }[] } };
    errors?: { message: string }[] | null;
  };
  if (!response.ok || (body.errors && body.errors.length > 0)) {
    throw new Error(body.errors?.[0]?.message ?? `HTTP ${response.status}`);
  }
  const acct = body.data?.viewer?.accounts?.[0];
  return { storage: acct?.storage ?? [], ops: acct?.ops ?? [] };
}

export async function tenantVideoUsage(
  tenants: readonly { key: string; name: string }[],
  now: Date = new Date(),
): Promise<VideoUsageResult> {
  const token = (process.env.CONTROL_PLANE_CF_TOKEN ?? '').trim();
  const account = accountId();
  if (token === '' || account === null) return { ok: false, reason: 'not-configured' };

  // Calendar months in UTC — Cloudflare's billing periods.
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const daysThis = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsed = (now.getTime() - thisStart.getTime()) / 86_400_000;

  try {
    const rows = await Promise.all(
      tenants.map(async (tenant) => {
        const bucket = `${tenant.key}-video`;
        const [current, previous] = await Promise.all([
          fetchPeriod(token, account, bucket, thisStart, now),
          fetchPeriod(token, account, bucket, lastStart, new Date(thisStart.getTime() - 1)),
        ]);
        const latest = current.storage.at(-1) ?? previous.storage.at(-1);
        return {
          key: tenant.key,
          name: tenant.name,
          bucket,
          storedBytes: latest?.max.payloadSize ?? 0,
          objectCount: latest?.max.objectCount ?? 0,
          thisMonth: summarise(current.storage, current.ops, Math.min(1, elapsed / daysThis)),
          lastMonth: summarise(previous.storage, previous.ops, 1),
        };
      }),
    );
    return { ok: true, rows };
  } catch (error) {
    return { ok: false, reason: 'failed', detail: error instanceof Error ? error.message : String(error) };
  }
}
