import 'server-only';
import { FEATURE_DECLARATIONS } from '@ayman/contracts/admin/entitlements';
import { subjectNameAr } from '@ayman/contracts/subjects';
import { signEntitlementsDocument } from '@/lib/control-plane';
import * as cf from './cloudflare';
import * as dokploy from './dokploy';
import {
  SHAREABLE_KEYS,
  buildTenantEnv,
  checkEnvText,
  generateSecrets,
  parseEnvText,
  renderEnvText,
  setEnvLine,
  type NewTenantSpec,
} from './tenant-env';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «اعمل المنصة» — a whole instructor stack from one form.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The runbook (`docs/runbooks/new-tenant.md`) is nine sections of manual
 * steps, and every one of them has been got wrong at least once. This is the
 * same procedure, in the same order, done by the owner's stack against
 * Dokploy and Cloudflare:
 *
 *   env → project → compose → environment → domains → dns → deploy
 *
 * ## Dokploy is the register
 *
 * There is no table of instructors anywhere, and this does not add one. A
 * stack IS its Dokploy compose, and the compose's environment says whose it is
 * (`TENANT_KEY`). Discovery reads that every time: a stack created by hand in
 * the panel shows up here exactly like one created by this file, and a stack
 * deleted in the panel simply stops showing up. A second record of the same
 * fact would be a second thing to get out of step.
 *
 * ## Re-running is resuming, never re-creating
 *
 * Every step first looks for what it is about to make. The one that matters
 * most is the environment: once a compose HAS one it is never regenerated,
 * because the first boot initialises Postgres with `POSTGRES_PASSWORD` — a
 * fresh password on a re-run would be a stack that can never reach its own
 * database again. So a run that died at «domains» is finished by pressing the
 * same button with the same form, and it picks up there.
 *
 * ## What this never does
 *
 * Delete, stop, or rewrite a stack it did not just create — except the two
 * narrow, owner-initiated edits below (`applyEntitlements`, `finalize`), each
 * of which sets single lines in an existing environment and leaves every
 * other line, comment and secret byte-for-byte alone.
 */

export type StepId = 'env' | 'project' | 'compose' | 'environment' | 'domains' | 'dns' | 'deploy';
export type StepState = 'done' | 'reused' | 'skipped' | 'failed';

export interface StepResult {
  id: StepId;
  state: StepState;
  /** Shown under the step: an error message, or what was found. */
  detail?: string;
}

export interface ProvisionSpec {
  key: string;
  displayName: string;
  subject: string;
  /** `TENANT_GRADES`, comma-joined; '' for none. Optional for older callers. */
  grades?: string;
  landingPreset: string;
  accent: string;
  adminName: string;
  adminEmail: string;
  whatsapp: string;
  appHost: string;
  mediaHost: string;
  features: Readonly<Record<string, boolean>>;
  shareKeys: boolean;
  socials: NewTenantSpec['socials'];
}

export interface ProvisionResult {
  ok: boolean;
  steps: StepResult[];
  /** The failed step's message, for the banner. */
  error?: string;
  composeId?: string;
  appUrl?: string;
  /** Null when a re-run found the bootstrap pair already cleared. */
  credentials?: { email: string; password: string } | null;
  nameservers?: string[];
  /** Hosts whose records the owner has to add himself (no Cloudflare token). */
  dnsManual?: string[];
  /** Hosts with an existing, different record — left untouched. */
  dnsConflicts?: string[];
  /** Null when Dokploy rebuilds the stack on every push by itself — then the
   *  CI list must NOT get a line for it (every merge would build twice). */
  webhookUrl?: string | null;
}

// ── Discovery ───────────────────────────────────────────────────────────

export interface StackRecord {
  compose: dokploy.DokployCompose;
  env: Record<string, string>;
  /** `TENANT_KEY`, '' on the owner's stack. */
  key: string;
}

function ownHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? '').hostname;
  } catch {
    return '';
  }
}

function hostOf(url: string | undefined): string {
  try {
    return new URL(url ?? '').hostname;
  } catch {
    return '';
  }
}

/**
 * Every compose on the server, read once each, split into the owner's own
 * (the template a new stack is cloned from) and the instructors'.
 *
 * The template is `CONTROL_PLANE_DOKPLOY_TEMPLATE` when set, otherwise the
 * compose whose `APP_URL` is this very stack's — found rather than
 * configured, so a fresh owner install has nothing to fill in. Anything with
 * neither a `TENANT_KEY` nor the owner's URL (some other app on the same
 * Dokploy) is not ours and is ignored.
 */
export async function discoverStacks(): Promise<{
  template: StackRecord | null;
  tenants: StackRecord[];
  /** Composes with no environment yet — a run that died between «compose»
   *  and «environment». Matched by name on the next run, not re-created. */
  unconfigured: dokploy.DokployCompose[];
}> {
  const refs = await dokploy.listComposeRefs();
  // One unreadable compose (a project this key was not given) must not hide
  // the rest of the server.
  const settled = await Promise.allSettled(refs.map((ref) => dokploy.getCompose(ref.composeId)));
  const composes = settled.flatMap((entry) => (entry.status === 'fulfilled' ? [entry.value] : []));
  if (composes.length === 0 && settled.length > 0) {
    const first = settled.find((entry) => entry.status === 'rejected');
    if (first && first.status === 'rejected') throw first.reason;
  }

  const templateId = (process.env.CONTROL_PLANE_DOKPLOY_TEMPLATE ?? '').trim();
  const own = ownHost();
  let template: StackRecord | null = null;
  const tenants: StackRecord[] = [];
  const unconfigured: dokploy.DokployCompose[] = [];

  for (const compose of composes) {
    const env = parseEnvText(compose.env ?? '');
    const key = (env.TENANT_KEY ?? '').trim();
    const record: StackRecord = { compose, env, key: key === 'ayman' ? '' : key };
    const isOwner =
      templateId !== '' ? compose.composeId === templateId : record.key === '' && own !== '' && hostOf(env.APP_URL) === own;
    if (isOwner) template = record;
    else if (record.key !== '') tenants.push(record);
    else if ((compose.env ?? '').trim() === '') unconfigured.push(compose);
  }
  return { template, tenants, unconfigured };
}

/** A tenant compose by id — and ONLY a tenant's: the owner's own stack, or
 *  some unrelated app on the same Dokploy, is never a target. */
export async function tenantStack(composeId: string): Promise<StackRecord | null> {
  const compose = await dokploy.getCompose(composeId);
  const env = parseEnvText(compose.env ?? '');
  const key = (env.TENANT_KEY ?? '').trim();
  if (key === '' || key === 'ayman') return null;
  return { compose, env, key };
}

// ── The run ─────────────────────────────────────────────────────────────

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The entitlements document for a new stack: the form's ticks, signed for a
 * year. Unsigned (`''`, the declared defaults) only when the ticks ARE the
 * defaults and no signing key is configured — otherwise a missing key would
 * quietly ship a stack running features the owner just switched off.
 */
function entitlementsFor(key: string, features: Readonly<Record<string, boolean>>): string {
  const enabled = new Set(FEATURE_DECLARATIONS.filter((entry) => features[entry.key] === true).map((entry) => entry.key));
  try {
    return signEntitlementsDocument({ tenantKey: key, enabled, days: 365 }).token;
  } catch (error) {
    const isDefault = FEATURE_DECLARATIONS.every((entry) => (features[entry.key] === true) === entry.defaultForTenant);
    if (isDefault) return '';
    throw error;
  }
}

/** Template domain → the new stack's, by host. A template host that is
 *  neither its APP_URL nor its MEDIA_ORIGIN has no counterpart and is left. */
function plannedDomains(template: StackRecord, templateDomains: readonly dokploy.DokployDomain[], spec: ProvisionSpec): dokploy.DokployDomain[] {
  const appHost = hostOf(template.env.APP_URL);
  const mediaHost = hostOf(template.env.MEDIA_ORIGIN);
  const out: dokploy.DokployDomain[] = [];
  for (const domain of templateDomains) {
    const host = domain.host === appHost ? spec.appHost : domain.host === mediaHost ? spec.mediaHost : null;
    if (host === null) continue;
    out.push({ ...domain, host, domainId: undefined });
  }
  return out;
}

const domainKey = (domain: dokploy.DokployDomain) => `${domain.host}|${domain.path ?? '/'}|${domain.serviceName ?? ''}`;

/**
 * One run per key at a time. The owner is the only caller, but a double click
 * on a slow panel is two server actions — and two runs racing past «compose»
 * would be two stacks.
 */
const running = new Set<string>();

export async function provision(spec: ProvisionSpec): Promise<ProvisionResult> {
  if (running.has(spec.key)) {
    return { ok: false, steps: [], error: 'A run for this key is already in progress.' };
  }
  running.add(spec.key);
  try {
    return await provisionOnce(spec);
  } finally {
    running.delete(spec.key);
  }
}

async function provisionOnce(spec: ProvisionSpec): Promise<ProvisionResult> {
  const steps: StepResult[] = [];
  const result: ProvisionResult = { ok: false, steps };
  const fail = (id: StepId, error: unknown): ProvisionResult => {
    steps.push({ id, state: 'failed', detail: message(error) });
    result.error = message(error);
    return result;
  };

  // ── env ─────────────────────────────────────────────────────────────
  let template: StackRecord | null;
  let tenants: StackRecord[];
  let unconfigured: dokploy.DokployCompose[];
  try {
    ({ template, tenants, unconfigured } = await discoverStacks());
  } catch (error) {
    return fail('env', error);
  }
  if (!template) {
    return fail('env', new Error("Could not find the owner's own compose on Dokploy to copy its git source from."));
  }

  const existing = tenants.find((tenant) => tenant.key === spec.key) ?? null;
  const orphan = existing ? null : (unconfigured.find((compose) => compose.name === `${spec.key}-platform`) ?? null);
  // Resuming is for the SAME stack. A key that already names a stack on
  // another domain is a typo or a second teacher, and either way keeping that
  // stack's environment while routing new hosts to it would be one stack
  // answering for two domains with one of them in none of its settings.
  if (existing && hostOf(existing.env.APP_URL) !== spec.appHost) {
    return fail('env', new Error(`The key «${spec.key}» already belongs to ${hostOf(existing.env.APP_URL) || 'another stack'}.`));
  }
  for (const tenant of tenants) {
    if (tenant === existing) continue;
    const hosts = [hostOf(tenant.env.APP_URL), hostOf(tenant.env.MEDIA_ORIGIN)];
    if (hosts.includes(spec.appHost) || hosts.includes(spec.mediaHost)) {
      return fail('env', new Error(`${spec.appHost} / ${spec.mediaHost} already belongs to the stack «${tenant.key}».`));
    }
  }

  let envText: string;
  let reusedEnv = false;
  if (existing && (existing.compose.env ?? '').trim() !== '') {
    envText = existing.compose.env ?? '';
    reusedEnv = true;
    const email = existing.env.ADMIN_EMAIL ?? '';
    const password = existing.env.ADMIN_PASSWORD ?? '';
    result.credentials = email && password ? { email, password } : null;
    steps.push({ id: 'env', state: 'reused' });
  } else {
    try {
      const secrets = generateSecrets();
      const shared: NewTenantSpec['shared'] = {};
      if (spec.shareKeys) {
        for (const key of SHAREABLE_KEYS) {
          const value = template.env[key];
          if (value) shared[key] = value;
        }
      }
      const env = buildTenantEnv(
        {
          key: spec.key,
          displayName: spec.displayName,
          subject: spec.subject,
          grades: spec.grades ?? '',
          landingPreset: spec.landingPreset,
          accent: spec.accent,
          appHost: spec.appHost,
          mediaHost: spec.mediaHost,
          adminName: spec.adminName,
          adminEmail: spec.adminEmail,
          whatsapp: spec.whatsapp,
          socials: spec.socials,
          entitlements: entitlementsFor(spec.key, spec.features),
          shared,
        },
        secrets,
      );
      envText = renderEnvText(env);
      const report = checkEnvText(envText, { firstDeploy: true });
      if (report.errors.length > 0) return fail('env', new Error(report.errors[0]));
      result.credentials = { email: env.ADMIN_EMAIL, password: secrets.adminPassword };
      steps.push({ id: 'env', state: 'done' });
    } catch (error) {
      return fail('env', error);
    }
  }

  // ── project + compose ───────────────────────────────────────────────
  let compose: dokploy.DokployCompose;
  const reusedCompose = existing?.compose ?? orphan;
  if (reusedCompose) {
    compose = reusedCompose;
    steps.push({ id: 'project', state: 'reused' }, { id: 'compose', state: 'reused' });
  } else {
    let project: { projectId: string; environmentId: string | null };
    try {
      // A run that died after «project» left one behind; it is found by the
      // tag in its description rather than duplicated.
      const tag = `(tenant: ${spec.key})`;
      const found = await dokploy.findProjectByTag(tag);
      if (found) {
        project = found;
        steps.push({ id: 'project', state: 'reused' });
      } else {
        project = await dokploy.createProject(spec.displayName, `${subjectNameAr(spec.subject)} — ${spec.appHost} ${tag}`);
        steps.push({ id: 'project', state: 'done' });
      }
    } catch (error) {
      return fail('project', error);
    }
    try {
      compose = await dokploy.createCompose({
        name: `${spec.key}-platform`,
        appName: spec.key,
        description: spec.appHost,
        ...project,
      });
      steps.push({ id: 'compose', state: 'done' });
    } catch (error) {
      return fail('compose', error);
    }
  }
  result.composeId = compose.composeId;
  result.appUrl = `https://${spec.appHost}`;

  // ── environment + git source ────────────────────────────────────────
  if (reusedEnv) {
    steps.push({ id: 'environment', state: 'reused' });
  } else {
    try {
      await dokploy.updateCompose(compose.composeId, { ...dokploy.sourceFieldsOf(template.compose), env: envText });
      steps.push({ id: 'environment', state: 'done' });
    } catch (error) {
      return fail('environment', error);
    }
  }

  // ── domains ─────────────────────────────────────────────────────────
  try {
    const planned = plannedDomains(template, await dokploy.listDomains(template.compose.composeId), spec);
    if (planned.length === 0) throw new Error("The owner's compose has no domains to copy the routing from.");
    const present = new Set((await dokploy.listDomains(compose.composeId)).map(domainKey));
    let created = 0;
    for (const domain of planned) {
      if (present.has(domainKey(domain))) continue;
      await dokploy.createDomain(compose.composeId, domain);
      created += 1;
    }
    steps.push({ id: 'domains', state: created === 0 ? 'reused' : 'done' });
  } catch (error) {
    return fail('domains', error);
  }

  // ── dns ─────────────────────────────────────────────────────────────
  if (!cf.cloudflareConfigured()) {
    result.dnsManual = [spec.appHost, spec.mediaHost];
    steps.push({ id: 'dns', state: 'skipped' });
  } else {
    try {
      const ip = await cf.originIp(ownHost());
      const conflicts: string[] = [];
      const nameservers = new Set<string>();
      for (const host of [spec.appHost, spec.mediaHost]) {
        const { zone, created } = await cf.ensureZone(cf.apexOf(host));
        // Only a zone this run CREATED is set to `full`: an existing one may
        // already be serving a live site on `strict`, and downgrading it is
        // not this button's business.
        if (created) {
          await cf.prepareZone(zone.id);
          for (const ns of zone.name_servers ?? []) nameservers.add(ns);
        } else if (zone.status !== 'active') {
          for (const ns of zone.name_servers ?? []) nameservers.add(ns);
        }
        if ((await cf.ensureProxiedRecord(zone.id, host, ip)) === 'conflict') conflicts.push(host);
      }
      if (nameservers.size > 0) result.nameservers = [...nameservers];
      if (conflicts.length > 0) result.dnsConflicts = conflicts;
      steps.push({ id: 'dns', state: conflicts.length > 0 ? 'failed' : 'done', detail: conflicts.join(', ') || undefined });
    } catch (error) {
      // DNS is the one step the owner can finish by hand without anything
      // else being wrong, so a failure here is reported and the run goes on
      // to deploy rather than leaving a configured stack unbuilt.
      result.dnsManual = [spec.appHost, spec.mediaHost];
      steps.push({ id: 'dns', state: 'failed', detail: message(error) });
    }
  }

  // ── deploy ──────────────────────────────────────────────────────────
  try {
    const deployments = await dokploy.listDeployments(compose.composeId);
    const latest = deployments[0];
    if (latest?.status === 'running') {
      steps.push({ id: 'deploy', state: 'reused' });
    } else if (latest?.status === 'done' && reusedEnv) {
      // A live stack is not rebuilt because somebody pressed «اعمل المنصة»
      // on a form that found it already there.
      steps.push({ id: 'deploy', state: 'reused' });
    } else {
      await dokploy.deployCompose(compose.composeId, 'First deploy — control plane');
      steps.push({ id: 'deploy', state: 'done' });
    }
  } catch (error) {
    return fail('deploy', error);
  }

  try {
    const fresh = await dokploy.getCompose(compose.composeId);
    result.webhookUrl = dokploy.deploysOnPush(fresh) ? null : dokploy.webhookUrl(fresh.refreshToken);
  } catch {
    result.webhookUrl = null;
  }

  result.ok = true;
  return result;
}

// ── After the first deploy ──────────────────────────────────────────────

export interface StackStatus {
  status: dokploy.ComposeStatus | 'unknown';
  lastDeployAt: string | null;
  /** The public site answered `/api/health` just now. */
  live: boolean;
}

/**
 * The site as a visitor sees it — DNS, the proxy, the certificate, Traefik and
 * the API, all in one request. Over the public internet on purpose: an
 * internal probe would say «up» for a stack whose domain does not resolve.
 *
 * A browser user-agent, because Cloudflare answers library defaults with a
 * 403 «1010» that would read as "down".
 */
async function probe(appUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${appUrl}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        accept: 'application/json',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** A cancelled deployment left the stack on whatever ran before it — for the
 *  owner that reads as "the last deploy did not land", the same as an error. */
export function settledStatus(status: dokploy.DeploymentStatus | null | undefined): dokploy.ComposeStatus | 'unknown' {
  if (status === 'cancelled') return 'error';
  return status ?? 'unknown';
}

export async function stackStatus(composeId: string): Promise<StackStatus | null> {
  const stack = await tenantStack(composeId);
  if (!stack) return null;
  const deployments = await dokploy.listDeployments(composeId);
  const latest = deployments[0];
  const appUrl = stack.env.APP_URL ?? '';
  return {
    status: settledStatus(latest?.status ?? stack.compose.composeStatus),
    lastDeployAt: latest?.createdAt ?? null,
    live: appUrl !== '' && (await probe(appUrl)),
  };
}

export async function redeploy(composeId: string): Promise<boolean> {
  const stack = await tenantStack(composeId);
  if (!stack) return false;
  await dokploy.deployCompose(composeId, 'Redeploy — control plane');
  return true;
}

/**
 * The runbook's §9, as a button: once the instructor has signed in and
 * changed the password, the bootstrap pair comes out of the environment (an
 * empty pair switches the bootstrap off — `docker-entrypoint.sh` — so no admin
 * password sits in deployment settings), and the zones go to the hardened
 * settings now that the origin has its certificate.
 *
 * No redeploy: the entrypoint only reads the pair at boot, the account
 * already exists, and the next deploy picks the empty values up.
 */
export async function finalize(composeId: string): Promise<{ ok: boolean; zone: boolean } | null> {
  const stack = await tenantStack(composeId);
  if (!stack) return null;
  let env = stack.compose.env ?? '';
  env = setEnvLine(env, 'ADMIN_EMAIL', null);
  env = setEnvLine(env, 'ADMIN_PASSWORD', null);
  await dokploy.updateCompose(composeId, { env });

  let zone = false;
  if (cf.cloudflareConfigured()) {
    try {
      const hosts = [hostOf(stack.env.APP_URL), hostOf(stack.env.MEDIA_ORIGIN)].filter(Boolean);
      const apexes = [...new Set(hosts.map(cf.apexOf))];
      for (const apex of apexes) {
        const found = await cf.findZone(apex);
        if (found) await cf.finalizeZone(found.id);
      }
      zone = apexes.length > 0;
    } catch {
      zone = false;
    }
  }
  return { ok: true, zone };
}

/**
 * The two identity lines — the teacher's name and subject — then a deploy.
 * Both are baked into the web image at `next build` (`/` is prerendered), so
 * a restart would change nothing a visitor sees; only a rebuild does.
 *
 * `WA_DEVICE_NAME` is left alone on purpose: the phone keeps the name the
 * device was LINKED under, and a renamed but still-linked device would make
 * the env disagree with what the teacher actually sees on the handset.
 */
export async function updateIdentity(composeId: string, identity: { displayName: string; subject: string }): Promise<boolean> {
  const stack = await tenantStack(composeId);
  if (!stack) return false;
  let env = stack.compose.env ?? '';
  env = setEnvLine(env, 'TENANT_DISPLAY_NAME', identity.displayName);
  env = setEnvLine(env, 'TENANT_SUBJECT', identity.subject);
  await dokploy.updateCompose(composeId, { env });
  await dokploy.deployCompose(composeId, 'Identity — control plane');
  return true;
}

/** A freshly signed document into a stack's environment, then a deploy —
 *  the API reads `TENANT_ENTITLEMENTS` once, at boot. */
export async function applyEntitlements(tenantKey: string, token: string): Promise<boolean> {
  const { tenants } = await discoverStacks();
  const stack = tenants.find((tenant) => tenant.key === tenantKey);
  if (!stack) return false;
  const env = setEnvLine(stack.compose.env ?? '', 'TENANT_ENTITLEMENTS', token);
  await dokploy.updateCompose(stack.compose.composeId, { env });
  await dokploy.deployCompose(stack.compose.composeId, 'Entitlements — control plane');
  return true;
}
