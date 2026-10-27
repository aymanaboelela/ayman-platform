import 'server-only';
import { readFile } from 'node:fs/promises';

/**
 * Dokploy's HTTP API — the half of the control plane that builds stacks.
 *
 * Dokploy exposes its tRPC routers over REST: a query is `GET
 * /api/<router>.<procedure>?<input as query string>`, a mutation is `POST
 * /api/<router>.<procedure>` with the input as JSON, and the key goes in
 * `x-api-key`. Every shape this file depends on is declared here and nowhere
 * else, so a Dokploy upgrade that renames a field is one file to read.
 *
 * ## Reached on the internal network, not the public panel host
 *
 * The panel's public host sits behind a Cloudflare managed challenge (every
 * path but `/api/deploy/*`, which is the CI webhook) — a challenge a server
 * cannot answer. `web` is already attached to `dokploy-network`, where the
 * panel is the `dokploy` service on port 3000, so that is the default and
 * the request never leaves the box. `CONTROL_PLANE_DOKPLOY_URL` overrides it.
 *
 * ⚠️ And when the service name does not answer, the published port on the
 * host does. «Dokploy مردّش دلوقتي — project.all: fetch failed» on
 * `/admin/platforms` (2026-10-27) while every CI deploy went through the same
 * Dokploy: the panel was up, `dokploy:3000` was not reachable from `web`.
 * Dokploy publishes 3000 on `0.0.0.0` of the box (host mode), so the
 * container's default gateway — the host itself — reaches it without a name,
 * without Cloudflare and without the provider firewall that drops 3000 from
 * OUTSIDE (that one only sees traffic that leaves the box). See `candidates`.
 *
 * ## What this key can do, and why it lives in ONE place
 *
 * A Dokploy API key reads and rewrites every stack on the server — the
 * environment of each, database passwords included. That is the opposite of
 * the isolation every other part of this design is built on (CLAUDE.md §2),
 * and it is accepted for exactly one reason: creating a stack IS an operation
 * on the server, and the owner asked to do it from his own dashboard. So the
 * key is read on the owner's stack only (`IS_AYMAN`, re-checked in every
 * action), the preflight refuses it in an instructor's env, and this module
 * exposes the handful of procedures the control plane needs — no generic
 * "call anything" export for a later feature to grow into.
 */

export class DokployError extends Error {
  constructor(
    message: string,
    readonly code: 'not-configured' | 'unauthorized' | 'unreachable' | 'failed',
  ) {
    super(message);
    this.name = 'DokployError';
  }
}

const SERVICE_URL = 'http://dokploy:3000';

/**
 * The container's default gateway, from the kernel's own routing table —
 * the host, on whatever bridge this compose was given. `null` off Linux (a
 * dev machine) and on any table this cannot read: then there is simply one
 * candidate fewer.
 */
async function hostGatewayUrl(): Promise<string | null> {
  try {
    const table = await readFile('/proc/net/route', 'utf8');
    for (const line of table.split('\n').slice(1)) {
      const [, destination, gateway] = line.trim().split(/\s+/);
      if (destination !== '00000000' || !gateway || gateway === '00000000') continue;
      // Little-endian hex: `0100A8C0` is 192.168.0.1.
      const octets = gateway.match(/../g)?.map((byte) => parseInt(byte, 16)).reverse();
      if (octets?.length === 4) return `http://${octets.join('.')}:3000`;
    }
  } catch {
    // No procfs — not a container.
  }
  return null;
}

/** Where the last call got an answer; tried first next time. */
let lastReachable: string | null = null;

/**
 * Every origin worth trying, best first: the configured one (or the service
 * name), then the service name if something else was configured, then the
 * host's published port. Only a NETWORK failure moves to the next one — an
 * HTTP answer, even a 401, is Dokploy speaking and is final.
 */
async function candidates(): Promise<string[]> {
  const configured = (process.env.CONTROL_PLANE_DOKPLOY_URL ?? '').trim().replace(/\/+$/, '');
  const list = [configured || SERVICE_URL, SERVICE_URL, await hostGatewayUrl()].filter(
    (url): url is string => Boolean(url),
  );
  if (lastReachable) list.unshift(lastReachable);
  return [...new Set(list)];
}

function causeCode(error: unknown): string | null {
  const cause = error instanceof Error ? (error as Error & { cause?: { code?: unknown } }).cause : null;
  return typeof cause?.code === 'string' ? cause.code : null;
}

/**
 * Failures where the request provably never reached anything — no name, no
 * listener, no route. Only these let a MUTATION move on to the next origin:
 * a timeout after connecting may already have queued a deploy, and sending it
 * again is two builds on four cores (CLAUDE.md §5).
 */
const NEVER_SENT = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * `fetch failed` is undici's whole message for every network failure; the
 * reason — `ENOTFOUND dokploy`, `ECONNREFUSED 10.0.1.4:3000`, a connect
 * timeout — is on `cause`. Without it the screen could only say «مردّش».
 */
function networkReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const { code, message } = cause as { code?: unknown; message?: unknown };
    // `getaddrinfo ENOTFOUND dokploy` already carries its code; a bare
    // `other side closed` does not.
    if (typeof message === 'string' && message !== '') {
      return typeof code === 'string' && !message.includes(code) ? `${code} ${message}` : message;
    }
    if (typeof code === 'string') return code;
  }
  return error.message;
}

function apiKey(): string {
  const key = (process.env.CONTROL_PLANE_DOKPLOY_KEY ?? '').trim();
  if (key === '') throw new DokployError('CONTROL_PLANE_DOKPLOY_KEY is not set', 'not-configured');
  return key;
}

export function dokployConfigured(): boolean {
  return (process.env.CONTROL_PLANE_DOKPLOY_KEY ?? '').trim() !== '';
}

type Input = Record<string, unknown>;

async function call<T>(procedure: string, input: Input, kind: 'query' | 'mutation'): Promise<T> {
  const init: RequestInit = {
    method: kind === 'query' ? 'GET' : 'POST',
    // ⚠️ EXACTLY `application/json` on a mutation: Dokploy's REST adapter
    // answers 415 without it and, worse, silently drops the body (400 "Input
    // validation failed") on `application/json; charset=utf-8`.
    headers:
      kind === 'query'
        ? { 'x-api-key': apiKey(), accept: 'application/json' }
        : { 'x-api-key': apiKey(), accept: 'application/json', 'content-type': 'application/json' },
    cache: 'no-store',
  };
  if (kind === 'mutation') init.body = JSON.stringify(input);

  let response: Response | null = null;
  const failures: string[] = [];
  for (const base of await candidates()) {
    const url = new URL(`${base}/api/${procedure}`);
    if (kind === 'query') {
      for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    try {
      // A deploy is QUEUED by the call, not run by it — every procedure here
      // answers in well under a second when the panel is healthy. Per attempt,
      // so one dead origin does not spend the next one's budget.
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      lastReachable = base;
      break;
    } catch (error) {
      failures.push(`${url.host} → ${networkReason(error)}`);
      if (lastReachable === base) lastReachable = null;
      if (kind === 'mutation' && !NEVER_SENT.has(causeCode(error) ?? '')) break;
    }
  }
  if (!response) {
    throw new DokployError(`${procedure}: ${failures.join(' · ')}`, 'unreachable');
  }

  const text = await response.text();
  // A bad key, a key whose user lacks the permission, and a key that has
  // used up an API-created rate limit ALL answer 401 — create the key in the
  // panel (Settings → Profile → API/CLI), where the limit is off.
  if (response.status === 401 || response.status === 403) {
    throw new DokployError(`${procedure}: the API key was refused (${response.status})`, 'unauthorized');
  }
  if (!response.ok) {
    // tRPC-over-REST answers `{ message, code }`; keep the first line of
    // whatever came back so a refused input names its field on screen.
    let message = text.slice(0, 300);
    try {
      const body = JSON.parse(text) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Not JSON — an HTML error page from the proxy. The status says enough.
    }
    throw new DokployError(`${procedure}: HTTP ${response.status} ${message}`, 'failed');
  }
  if (text.trim() === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some mutations answer a bare `true`; anything else non-JSON is a body
    // nothing here reads.
    return undefined as T;
  }
}

// ── Shapes ──────────────────────────────────────────────────────────────

export type ComposeStatus = 'idle' | 'running' | 'done' | 'error';
export type DeploymentStatus = ComposeStatus | 'cancelled';

export interface DokployDomain {
  domainId?: string;
  host: string;
  path?: string | null;
  port?: number | null;
  https?: boolean;
  certificateType?: string | null;
  customCertResolver?: string | null;
  serviceName?: string | null;
  domainType?: string | null;
  stripPath?: boolean | null;
  internalPath?: string | null;
  customEntrypoint?: string | null;
  middlewares?: string[] | null;
  forwardAuthEnabled?: boolean | null;
}

export interface DokployDeployment {
  deploymentId: string;
  title?: string | null;
  status?: DeploymentStatus | null;
  createdAt?: string | null;
  errorMessage?: string | null;
}

export interface DokployCompose {
  composeId: string;
  name: string;
  appName: string;
  env?: string | null;
  composeStatus?: ComposeStatus | null;
  refreshToken?: string | null;
  createdAt?: string | null;
  sourceType?: string | null;
  autoDeploy?: boolean | null;
  triggerType?: string | null;
  domains?: DokployDomain[];
  deployments?: DokployDeployment[];
  projectId?: string | null;
  environmentId?: string | null;
  [field: string]: unknown;
}

interface ProjectComposeRef {
  composeId: string;
  name?: string;
  appName?: string;
}

interface DokployEnvironment {
  environmentId: string;
  name?: string;
  compose?: ProjectComposeRef[];
}

export interface DokployProject {
  projectId: string;
  name: string;
  description?: string | null;
  /** Dokploy ≥ 0.25 groups services under environments (the default one
   *  is «production», `isDefault` from 0.26.1)… */
  environments?: (DokployEnvironment & { isDefault?: boolean })[];
  /** …and before that, straight under the project. Both are read. */
  compose?: ProjectComposeRef[];
}

/**
 * The git-source fields a new stack copies from the template stack, so it
 * builds from the same repository, branch, compose file and provider
 * credentials — whichever provider that is (a GitHub App, or a plain git URL
 * with a deploy key) — and runs compose the same way (`createEnvFile`, the
 * custom `command`, `isolatedDeployment`).
 *
 * An allowlist, never a spread of `compose.one`: that object carries the
 * template's `env` (the owner's secrets), its `refreshToken` (the two stacks
 * would share one deploy webhook) and its `environmentId` (which MOVES the
 * new compose into the owner's project). `suffix` stays out too — it is the
 * template's own random name suffix.
 */
const SOURCE_FIELDS = [
  'sourceType',
  'composePath',
  'autoDeploy',
  'triggerType',
  'watchPaths',
  'enableSubmodules',
  'createEnvFile',
  'command',
  'isolatedDeployment',
  'randomize',
  'githubId',
  'repository',
  'owner',
  'branch',
  'gitlabId',
  'gitlabProjectId',
  'gitlabRepository',
  'gitlabOwner',
  'gitlabBranch',
  'gitlabPathNamespace',
  'bitbucketId',
  'bitbucketRepository',
  'bitbucketOwner',
  'bitbucketBranch',
  'giteaId',
  'giteaRepository',
  'giteaOwner',
  'giteaBranch',
  'customGitUrl',
  'customGitBranch',
  'customGitSSHKeyId',
] as const;

export function sourceFieldsOf(template: DokployCompose): Input {
  const out: Input = {};
  for (const field of SOURCE_FIELDS) {
    const value = template[field];
    if (value !== undefined && value !== null) out[field] = value;
  }
  return out;
}

// ── Procedures ──────────────────────────────────────────────────────────

export function listProjects(): Promise<DokployProject[]> {
  return call<DokployProject[]>('project.all', {}, 'query');
}

/** Every compose on the server, flattened out of projects and environments. */
export async function listComposeRefs(): Promise<{ composeId: string; projectId: string }[]> {
  const projects = await listProjects();
  const out: { composeId: string; projectId: string }[] = [];
  for (const project of projects) {
    for (const compose of project.compose ?? []) out.push({ composeId: compose.composeId, projectId: project.projectId });
    for (const environment of project.environments ?? []) {
      for (const compose of environment.compose ?? []) {
        out.push({ composeId: compose.composeId, projectId: project.projectId });
      }
    }
  }
  return out;
}

export function getCompose(composeId: string): Promise<DokployCompose> {
  return call<DokployCompose>('compose.one', { composeId }, 'query');
}

/**
 * A project, and the id new services go under: its default environment on a
 * Dokploy that has environments, the project itself on one that does not.
 *
 * `project.create` has answered with the project, and on later releases with
 * `{ project, environment }`; both are read rather than one being assumed,
 * and when neither carries an environment the project is re-read once.
 */
export async function createProject(name: string, description: string): Promise<{ projectId: string; environmentId: string | null }> {
  const created = await call<
    | (DokployProject & { project?: undefined })
    | { project: DokployProject; environment?: DokployEnvironment }
  >('project.create', { name, description }, 'mutation');

  const project = 'project' in created && created.project ? created.project : (created as DokployProject);
  let environmentId = ('environment' in created && created.environment?.environmentId) || defaultEnvironmentId(project);

  if (!environmentId) {
    // A release with environments that did not echo one back — or one with
    // none at all (≤ 0.24), where this stays null and the project id is used.
    const again = (await listProjects()).find((candidate) => candidate.projectId === project.projectId);
    environmentId = again ? defaultEnvironmentId(again) : null;
  }
  return { projectId: project.projectId, environmentId };
}

/** A project this control plane created, by the tag it writes into the
 *  description — with the id new services go under. */
export async function findProjectByTag(tag: string): Promise<{ projectId: string; environmentId: string | null } | null> {
  const project = (await listProjects()).find((candidate) => (candidate.description ?? '').includes(tag));
  if (!project) return null;
  return { projectId: project.projectId, environmentId: defaultEnvironmentId(project) };
}

/** `isDefault` where the release has it, «production» where it does not
 *  (0.25.0–0.26.0), the first one otherwise. */
function defaultEnvironmentId(project: DokployProject): string | null {
  const environments = project.environments ?? [];
  return (
    environments.find((environment) => environment.isDefault)?.environmentId ??
    environments.find((environment) => environment.name === 'production')?.environmentId ??
    environments[0]?.environmentId ??
    null
  );
}

export async function createCompose(input: {
  name: string;
  appName: string;
  description: string;
  projectId: string;
  environmentId: string | null;
}): Promise<DokployCompose> {
  // `environmentId` from 0.25 on, `projectId` before it — never both, so a
  // release that validates strictly cannot refuse the key it does not know.
  // `appName` is a PREFIX: Dokploy always appends six random characters, and
  // the real name (which namespaces every container and volume of the stack)
  // is the one in the response.
  return call<DokployCompose>(
    'compose.create',
    {
      name: input.name,
      appName: input.appName,
      description: input.description,
      composeType: 'docker-compose',
      ...(input.environmentId ? { environmentId: input.environmentId } : { projectId: input.projectId }),
    },
    'mutation',
  );
}

export async function updateCompose(composeId: string, patch: Input): Promise<void> {
  await call('compose.update', { composeId, ...patch }, 'mutation');
}

export async function listDomains(composeId: string): Promise<DokployDomain[]> {
  return (await call<DokployDomain[] | null>('domain.byComposeId', { composeId }, 'query')) ?? [];
}

export async function createDomain(composeId: string, domain: DokployDomain): Promise<void> {
  await call(
    'domain.create',
    {
      host: domain.host,
      path: domain.path ?? '/',
      port: domain.port ?? undefined,
      https: domain.https ?? true,
      certificateType: domain.certificateType ?? 'letsencrypt',
      ...(domain.customCertResolver ? { customCertResolver: domain.customCertResolver } : {}),
      serviceName: domain.serviceName ?? undefined,
      domainType: 'compose',
      composeId,
      ...(domain.stripPath !== undefined && domain.stripPath !== null ? { stripPath: domain.stripPath } : {}),
      ...(domain.internalPath ? { internalPath: domain.internalPath } : {}),
      ...(domain.customEntrypoint ? { customEntrypoint: domain.customEntrypoint } : {}),
      ...(domain.middlewares && domain.middlewares.length > 0 ? { middlewares: domain.middlewares } : {}),
      ...(domain.forwardAuthEnabled ? { forwardAuthEnabled: domain.forwardAuthEnabled } : {}),
    },
    'mutation',
  );
}

/**
 * `deploy`, never `redeploy`: deploy clones the repository afresh, redeploy
 * reuses the checkout and fails on a compose that has never been deployed.
 * Either one only QUEUES the job (in memory since 0.29.9 — a panel restart
 * drops it), and the deployment row appears when the job starts.
 */
export async function deployCompose(composeId: string, title: string): Promise<void> {
  await call('compose.deploy', { composeId, title }, 'mutation');
}

/**
 * Whether Dokploy itself rebuilds this compose on every push to its branch —
 * a GitHub-App source with `autoDeploy` and the `push` trigger. Such a stack
 * needs no line in `DOKPLOY_TENANT_DEPLOY_URLS`; adding one would build every
 * merge twice on a four-core box.
 */
export function deploysOnPush(compose: DokployCompose): boolean {
  return compose.sourceType === 'github' && compose.autoDeploy === true && (compose.triggerType ?? 'push') === 'push';
}

export async function listDeployments(composeId: string): Promise<DokployDeployment[]> {
  const rows = (await call<DokployDeployment[] | null>('deployment.allByCompose', { composeId }, 'query')) ?? [];
  // Newest first, whatever order the release returns them in.
  return [...rows].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

/**
 * The CI webhook for a compose — what `DOKPLOY_TENANT_DEPLOY_URLS` holds one
 * line of per instructor. On the PUBLIC panel host, because GitHub's runners
 * are the caller; `/api/deploy/*` is the one path the panel's challenge lets
 * through.
 *
 * The host: `CONTROL_PLANE_DOKPLOY_PUBLIC_URL`, or the house convention of
 * `panel.` on the owner's own apex.
 */
export function webhookUrl(refreshToken: string | null | undefined): string | null {
  if (!refreshToken) return null;
  const configured = (process.env.CONTROL_PLANE_DOKPLOY_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  let base = configured;
  if (base === '') {
    try {
      const own = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '');
      base = `https://panel.${own.hostname.split('.').slice(-2).join('.')}`;
    } catch {
      return null;
    }
  }
  return `${base}/api/deploy/compose/${refreshToken}`;
}
