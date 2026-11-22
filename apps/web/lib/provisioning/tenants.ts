import 'server-only';
import { controlPlaneTenants } from '@/lib/control-plane';
import { DokployError, deploysOnPush, dokployConfigured, listDeployments, webhookUrl, type ComposeStatus } from './dokploy';
import { discoverStacks, settledStatus } from './provision';

/**
 * One row of «المدرّسين» — what the owner's screen shows about a stack.
 *
 * ⚠️ Built server-side from the stack's FULL environment, and the type is the
 * filter: nothing secret has a field here. The rows are serialised into a
 * client component's props, and a `env` passed through for convenience would
 * put every instructor's database password into the owner's browser.
 */
export interface TenantSummary {
  key: string;
  name: string;
  subject: string | null;
  appUrl: string | null;
  composeId: string | null;
  status: ComposeStatus | 'unknown';
  lastDeployAt: string | null;
  /** Unix seconds; `null` = no document (the declared defaults run). */
  entitlementsExp: number | null;
  /**
   * What the stack's LIVE document says about each feature, or `null` when it
   * has none (or it has expired) and the declared defaults run. Not a secret:
   * every stack publishes the same map at `GET /api/entitlements`.
   */
  features: Record<string, boolean> | null;
  /** `ADMIN_EMAIL`+`ADMIN_PASSWORD` still in its environment. */
  pendingHandover: boolean;
  /** Set only for a stack Dokploy does NOT rebuild on push by itself — the
   *  line it needs in `DOKPLOY_TENANT_DEPLOY_URLS`. */
  webhookUrl: string | null;
}

export interface TenantList {
  /** `CONTROL_PLANE_DOKPLOY_KEY` is set. */
  connected: boolean;
  /** Connected, and Dokploy answered. */
  reachable: boolean;
  /** Why not, for the owner — never shown to anyone else. */
  problem: string | null;
  tenants: TenantSummary[];
  /** Unix seconds the list was read at — what «expires in a month» is
   *  measured against, taken here so no component calls the clock. */
  readAt: number;
}

/** `exp` out of a compact JWS, unverified — the stack verifies; this only
 *  prints a date. Anything unreadable is "no document". */
export function documentExpiry(token: string | undefined): number | null {
  const payload = (token ?? '').split('.')[1];
  if (!payload) return null;
  try {
    const exp = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * `features` out of a compact JWS, unverified — or `null` for no document, an
 * unreadable one, or one past its `exp`.
 *
 * ## Why the signing form needs this
 *
 * A document is a COMPLETE statement: every declared key is written, and an
 * unticked box is a `false` the stack honours. The form used to start its
 * boxes at the declared defaults whoever was picked, so opening ONE feature
 * for an instructor re-stated the defaults for everything else — and silently
 * closed whatever had been opened for them before. Sabry and Adel both had
 * `video.upload` open (default off) on 2026-11-21, and a signing that only
 * ticked the new feature would have taken their uploads away.
 *
 * An expired document is `null` on purpose: the stack has already fallen back
 * to the defaults, so the defaults are what is true there.
 *
 * Unverified, like `documentExpiry`: the stack is what verifies. A document
 * the stack rejects would be prefilled here while the defaults run there —
 * a mismatch the owner sees as soon as the next signing lands.
 */
export function documentFeatures(token: string | undefined, now: number): Record<string, boolean> | null {
  const payload = (token ?? '').split('.')[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
      features?: unknown;
    };
    if (typeof parsed.exp !== 'number' || parsed.exp <= now) return null;
    if (!parsed.features || typeof parsed.features !== 'object' || Array.isArray(parsed.features)) return null;
    const features: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed.features)) {
      if (typeof value === 'boolean') features[key] = value;
    }
    return features;
  } catch {
    return null;
  }
}

/**
 * Dokploy's stacks, plus any `CONTROL_PLANE_TENANTS` entry Dokploy does not
 * know (a stack on another server, or this key not yet connected) as a bare
 * row with only a name — so the signing form keeps every instructor it had.
 */
export async function tenantList(now: Date = new Date()): Promise<TenantList> {
  const readAt = Math.floor(now.getTime() / 1000);
  const fromEnv = controlPlaneTenants();
  const bare = (key: string, name: string): TenantSummary => ({
    key,
    name,
    subject: null,
    appUrl: null,
    composeId: null,
    status: 'unknown',
    lastDeployAt: null,
    entitlementsExp: null,
    features: null,
    pendingHandover: false,
    webhookUrl: null,
  });

  if (!dokployConfigured()) {
    return {
      connected: false,
      reachable: false,
      problem: null,
      tenants: fromEnv.map((entry) => bare(entry.key, entry.name)),
      readAt,
    };
  }

  try {
    const { tenants } = await discoverStacks();
    const rows = await Promise.all(
      tenants.map(async (stack): Promise<TenantSummary> => {
        const deployments = await listDeployments(stack.compose.composeId).catch(() => []);
        const latest = deployments[0];
        const named = fromEnv.find((entry) => entry.key === stack.key)?.name;
        return {
          key: stack.key,
          name: (stack.env.TENANT_DISPLAY_NAME ?? '').trim() || named || stack.key,
          subject: (stack.env.TENANT_SUBJECT ?? '').trim() || null,
          appUrl: (stack.env.APP_URL ?? '').trim() || null,
          composeId: stack.compose.composeId,
          status: settledStatus(latest?.status ?? stack.compose.composeStatus),
          lastDeployAt: latest?.createdAt ?? null,
          entitlementsExp: documentExpiry(stack.env.TENANT_ENTITLEMENTS),
          features: documentFeatures(stack.env.TENANT_ENTITLEMENTS, readAt),
          pendingHandover: Boolean((stack.env.ADMIN_EMAIL ?? '').trim() && (stack.env.ADMIN_PASSWORD ?? '').trim()),
          webhookUrl: deploysOnPush(stack.compose) ? null : webhookUrl(stack.compose.refreshToken),
        };
      }),
    );
    const known = new Set(rows.map((row) => row.key));
    for (const entry of fromEnv) if (!known.has(entry.key)) rows.push(bare(entry.key, entry.name));
    rows.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return { connected: true, reachable: true, problem: null, tenants: rows, readAt };
  } catch (error) {
    return {
      connected: true,
      reachable: false,
      problem: error instanceof DokployError || error instanceof Error ? error.message : String(error),
      tenants: fromEnv.map((entry) => bare(entry.key, entry.name)),
      readAt,
    };
  }
}
