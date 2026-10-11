// @vitest-environment node
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * The provisioner against a fake Dokploy that speaks the v0.30 REST shapes
 * (`GET /api/<router>.<proc>?…`, `POST` with JSON) and checks the one header
 * rule that silently breaks a real one: a mutation's content type must be
 * EXACTLY `application/json`.
 */

interface FakeCompose {
  composeId: string;
  name: string;
  appName: string;
  env: string | null;
  refreshToken: string;
  composeStatus: string;
  environmentId: string;
  [field: string]: unknown;
}

interface FakeDomain {
  host: string;
  path: string;
  port: number;
  serviceName: string;
  https: boolean;
  certificateType: string;
}

const OWNER_ENV = [
  'APP_URL=https://owner.example',
  'MEDIA_ORIGIN=https://media.owner.example',
  'GEMINI_API_KEY=g-owner-key',
  'POSTGRES_PASSWORD=owner-secret-never-copied',
].join('\n');

let state: {
  projects: { projectId: string; name: string; description: string; environments: { environmentId: string; name: string; isDefault: boolean }[] }[];
  composes: FakeCompose[];
  domains: Record<string, FakeDomain[]>;
  deployments: Record<string, { deploymentId: string; status: string; createdAt: string }[]>;
  calls: string[];
  badContentType: string[];
};

let counter = 0;
const id = (prefix: string) => `${prefix}-${++counter}`;

function seed() {
  counter = 0;
  state = {
    projects: [
      { projectId: 'p-owner', name: 'Ayman', description: '', environments: [{ environmentId: 'e-owner', name: 'production', isDefault: true }] },
    ],
    composes: [
      {
        composeId: 'c-owner',
        name: 'ayman-platform',
        appName: 'ayman-platform-abc123',
        env: OWNER_ENV,
        refreshToken: 'tok-owner',
        composeStatus: 'done',
        environmentId: 'e-owner',
        sourceType: 'github',
        githubId: 'gh-1',
        owner: 'aymanaboelela',
        repository: 'ayman-platform',
        branch: 'main',
        composePath: './docker-compose.yml',
        autoDeploy: true,
        triggerType: 'push',
        createEnvFile: true,
        suffix: 'owner-suffix',
      },
    ],
    domains: {
      'c-owner': [
        { host: 'owner.example', path: '/api', port: 3300, serviceName: 'api', https: true, certificateType: 'letsencrypt' },
        { host: 'owner.example', path: '/', port: 3200, serviceName: 'web', https: true, certificateType: 'letsencrypt' },
        { host: 'media.owner.example', path: '/media', port: 3300, serviceName: 'api', https: true, certificateType: 'letsencrypt' },
        // A host with no counterpart on the new stack — must not be copied.
        { host: 'links.owner.example', path: '/', port: 3200, serviceName: 'web', https: true, certificateType: 'letsencrypt' },
      ],
    },
    deployments: {},
    calls: [],
    badContentType: [],
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function fakeDokploy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  const procedure = url.pathname.replace(/^\/api\//, '');
  const method = init?.method ?? 'GET';
  state.calls.push(`${method} ${procedure}`);
  const headers = new Headers(init?.headers);
  if (headers.get('x-api-key') !== 'test-key') return json({ message: 'Unauthorized' }, 401);
  if (method === 'POST' && headers.get('content-type') !== 'application/json') state.badContentType.push(procedure);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  const q = (key: string) => url.searchParams.get(key) ?? '';

  switch (`${method} ${procedure}`) {
    case 'GET project.all':
      return json(
        state.projects.map((project) => ({
          ...project,
          environments: project.environments.map((environment) => ({
            ...environment,
            compose: state.composes
              .filter((compose) => compose.environmentId === environment.environmentId)
              .map((compose) => ({ composeId: compose.composeId, name: compose.name, composeStatus: compose.composeStatus })),
          })),
        })),
      );
    case 'POST project.create': {
      const project = { projectId: id('p'), name: String(body.name), description: String(body.description ?? '') };
      const environment = { environmentId: id('e'), name: 'production', isDefault: true };
      state.projects.push({ ...project, environments: [environment] });
      return json({ project, environment });
    }
    case 'POST compose.create': {
      if ('projectId' in body && 'environmentId' in body) return json({ message: 'both ids' }, 400);
      const compose: FakeCompose = {
        composeId: id('c'),
        name: String(body.name),
        appName: `${String(body.appName)}-r4nd0m`,
        env: null,
        refreshToken: id('tok'),
        composeStatus: 'idle',
        environmentId: String(body.environmentId),
        sourceType: 'github',
        autoDeploy: false,
      };
      state.composes.push(compose);
      return json(compose);
    }
    case 'GET compose.one': {
      const compose = state.composes.find((entry) => entry.composeId === q('composeId'));
      if (!compose) return json({ message: 'Compose not found' }, 404);
      return json({ ...compose, domains: state.domains[compose.composeId] ?? [], deployments: [] });
    }
    case 'POST compose.update': {
      const compose = state.composes.find((entry) => entry.composeId === body.composeId);
      if (!compose) return new Response('', { status: 200 });
      Object.assign(compose, body);
      return json(compose);
    }
    case 'GET domain.byComposeId':
      return json(state.domains[q('composeId')] ?? []);
    case 'POST domain.create': {
      const list = (state.domains[String(body.composeId)] ??= []);
      list.push(body as unknown as FakeDomain);
      return json({ ...body, domainId: id('d') });
    }
    case 'POST compose.deploy': {
      const list = (state.deployments[String(body.composeId)] ??= []);
      list.unshift({ deploymentId: id('dep'), status: 'running', createdAt: new Date().toISOString() });
      return json({ success: true, message: 'Deployment queued', composeId: body.composeId });
    }
    case 'GET deployment.allByCompose':
      return json(state.deployments[q('composeId')] ?? []);
    default:
      return json({ message: `no route ${method} ${procedure}` }, 404);
  }
}

const { privateKey } = generateKeyPairSync('ed25519');

beforeEach(() => {
  seed();
  vi.stubEnv('CONTROL_PLANE_DOKPLOY_KEY', 'test-key');
  vi.stubEnv('CONTROL_PLANE_DOKPLOY_URL', 'http://dokploy.test');
  vi.stubEnv('CONTROL_PLANE_DOKPLOY_TEMPLATE', '');
  vi.stubEnv('CONTROL_PLANE_CF_TOKEN', '');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://owner.example');
  vi.stubEnv('CONTROL_PLANE_PRIVATE_KEY', privateKey.export({ format: 'pem', type: 'pkcs8' }).toString());
  vi.stubGlobal('fetch', vi.fn(fakeDokploy));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const { provision, discoverStacks, finalize, applyEntitlements } = await import('./provision');
const { parseEnvText } = await import('./tenant-env');

function spec(overrides: Partial<Parameters<typeof provision>[0]> = {}): Parameters<typeof provision>[0] {
  return {
    key: 'mohamed-hassan',
    displayName: 'م. محمد حسن',
    subject: 'physics',
    adminName: 'محمد حسن',
    adminEmail: 'teacher@example.com',
    whatsapp: '+201000000000',
    appHost: 'mohamedhassan.com',
    mediaHost: 'media.mohamedhassan.com',
    features: { books: true, homework: true, exams: true, assistant: true, honorBoard: true, transfers: true },
    shareKeys: true,
    socials: { youtube: '', instagram: '', tiktok: '', facebook: '', whatsappChannel: '' },
    ...overrides,
  };
}

const newCompose = () => state.composes.find((compose) => compose.name === 'mohamed-hassan-platform');

describe('provision — a fresh stack', () => {
  it('creates, configures, routes and deploys it, in that order', async () => {
    const result = await provision(spec());

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => `${step.id}:${step.state}`)).toEqual([
      'env:done',
      'project:done',
      'compose:done',
      'environment:done',
      'domains:done',
      'dns:skipped',
      'deploy:done',
    ]);
    expect(state.badContentType).toEqual([]);
  });

  it('writes an environment that names the new teacher and keeps the owner’s secrets out', async () => {
    await provision(spec());
    const env = parseEnvText(newCompose()!.env ?? '');

    expect(env.TENANT_KEY).toBe('mohamed-hassan');
    expect(env.TENANT_SUBJECT).toBe('physics');
    expect(env.APP_URL).toBe('https://mohamedhassan.com');
    expect(env.POSTGRES_DB).toBe('mohamed_hassan_platform');
    expect(env.CLARITY_PROJECT_ID).toBe('');
    // Shared on request…
    expect(env.GEMINI_API_KEY).toBe('g-owner-key');
    // …and never the owner's database password.
    expect(newCompose()!.env).not.toContain('owner-secret-never-copied');
    // A signed document for THIS stack.
    const payload = JSON.parse(Buffer.from(env.TENANT_ENTITLEMENTS!.split('.')[1]!, 'base64url').toString()) as { sub: string };
    expect(payload.sub).toBe('mohamed-hassan');
  });

  it('clones the git source but not the template’s identity', async () => {
    await provision(spec());
    const compose = newCompose()!;

    expect(compose).toMatchObject({ githubId: 'gh-1', repository: 'ayman-platform', branch: 'main', autoDeploy: true, createEnvFile: true });
    expect(compose.refreshToken).not.toBe('tok-owner');
    expect(compose.suffix).toBeUndefined();
    expect(compose.environmentId).not.toBe('e-owner');
  });

  it('maps the owner’s routing onto the new hosts and drops the ones with no counterpart', async () => {
    await provision(spec());
    const domains = state.domains[newCompose()!.composeId]!;

    expect(domains.map((domain) => `${domain.host}${domain.path}→${domain.serviceName}:${domain.port}`).sort()).toEqual([
      'media.mohamedhassan.com/media→api:3300',
      'mohamedhassan.com/api→api:3300',
      'mohamedhassan.com/→web:3200',
    ]);
  });

  it('hands back the one-time credentials, and no CI webhook for a stack Dokploy rebuilds on push', async () => {
    const result = await provision(spec());

    expect(result.credentials?.email).toBe('teacher@example.com');
    expect(result.credentials?.password).toMatch(/^[\w]{4}(-[\w]{4}){4}$/);
    expect(result.webhookUrl).toBeNull();
  });
});

describe('provision — running it again', () => {
  it('resumes without regenerating the secrets or rebuilding a live stack', async () => {
    const first = await provision(spec());
    const envAfterFirst = newCompose()!.env;
    state.deployments[first.composeId!]![0]!.status = 'done';
    const callsBefore = state.calls.length;

    const second = await provision(spec());

    expect(second.ok).toBe(true);
    expect(newCompose()!.env).toBe(envAfterFirst);
    expect(second.credentials).toEqual(first.credentials);
    expect(second.steps.find((step) => step.id === 'deploy')?.state).toBe('reused');
    expect(state.projects).toHaveLength(2);
    expect(state.calls.slice(callsBefore).filter((call) => call.startsWith('POST'))).toEqual([]);
  });

  it('adopts a compose a dead run left with no environment, instead of making a second', async () => {
    state.projects.push({ projectId: 'p-dead', name: 'x', description: 'physics (tenant: mohamed-hassan)', environments: [{ environmentId: 'e-dead', name: 'production', isDefault: true }] });
    state.composes.push({
      composeId: 'c-dead',
      name: 'mohamed-hassan-platform',
      appName: 'mohamed-hassan-zzzzzz',
      env: '',
      refreshToken: 'tok-dead',
      composeStatus: 'idle',
      environmentId: 'e-dead',
    });

    const result = await provision(spec());

    expect(result.ok).toBe(true);
    expect(result.composeId).toBe('c-dead');
    expect(state.composes.filter((compose) => compose.name === 'mohamed-hassan-platform')).toHaveLength(1);
    expect(parseEnvText(state.composes.find((compose) => compose.composeId === 'c-dead')!.env ?? '').TENANT_KEY).toBe('mohamed-hassan');
  });
});

describe('provision — refusals', () => {
  it('refuses a domain another teacher already has', async () => {
    await provision(spec());
    const result = await provision(spec({ key: 'someone-else' }));

    expect(result.ok).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ id: 'env', state: 'failed' });
  });

  it('refuses when the owner’s own stack cannot be found to clone', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://somewhere-else.example');
    const result = await provision(spec());

    expect(result.ok).toBe(false);
    expect(state.calls.filter((call) => call.startsWith('POST'))).toEqual([]);
  });

  it('refuses to ship a stack with features switched off when nothing can sign', async () => {
    vi.stubEnv('CONTROL_PLANE_PRIVATE_KEY', '');
    const result = await provision(spec({ features: {} }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('CONTROL_PLANE_PRIVATE_KEY');
  });
});

describe('after the first deploy', () => {
  it('never treats the owner’s stack as a teacher’s', async () => {
    const { template, tenants } = await discoverStacks();
    expect(template?.compose.composeId).toBe('c-owner');
    expect(tenants).toEqual([]);
    expect(await finalize('c-owner')).toBeNull();
  });

  it('finalize empties the bootstrap pair and leaves every other line alone', async () => {
    const created = await provision(spec());
    const before = newCompose()!.env ?? '';

    await finalize(created.composeId!);
    const after = newCompose()!.env ?? '';

    expect(parseEnvText(after).ADMIN_EMAIL).toBe('');
    expect(parseEnvText(after).ADMIN_PASSWORD).toBe('');
    expect(after.split('\n').filter((line) => !line.startsWith('ADMIN_EMAIL=') && !line.startsWith('ADMIN_PASSWORD='))).toEqual(
      before.split('\n').filter((line) => !line.startsWith('ADMIN_EMAIL=') && !line.startsWith('ADMIN_PASSWORD=')),
    );
  });

  it('applyEntitlements rewrites one line and deploys', async () => {
    const created = await provision(spec());
    const deploysBefore = state.deployments[created.composeId!]!.length;

    expect(await applyEntitlements('mohamed-hassan', 'a.b.c')).toBe(true);
    expect(parseEnvText(newCompose()!.env ?? '').TENANT_ENTITLEMENTS).toBe('a.b.c');
    expect(state.deployments[created.composeId!]!.length).toBe(deploysBefore + 1);
    expect(await applyEntitlements('nobody', 'a.b.c')).toBe(false);
  });
});

describe('provision — DNS on Cloudflare', () => {
  interface Zone {
    id: string;
    name: string;
    status: string;
    name_servers: string[];
    ssl?: string;
  }
  let zones: Zone[];
  let records: { id: string; zone: string; type: string; name: string; content: string; proxied: boolean }[];

  async function fakeCloudflare(url: URL, init?: RequestInit): Promise<Response> {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const ok = (result: unknown) => json({ success: true, errors: [], result });
    const path = url.pathname.replace('/client/v4', '');
    const method = init?.method ?? 'GET';
    let match: RegExpExecArray | null;
    if (method === 'GET' && path === '/zones') return ok(zones.filter((zone) => zone.name === url.searchParams.get('name')));
    if (method === 'GET' && path === '/accounts') return ok([{ id: 'acct-1' }]);
    if (method === 'POST' && path === '/zones') {
      const zone = { id: id('z'), name: String(body.name), status: 'pending', name_servers: ['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com'] };
      zones.push(zone);
      return ok(zone);
    }
    if ((match = /^\/zones\/([^/]+)\/dns_records$/.exec(path))) {
      const zoneId = match[1]!;
      if (method === 'GET') {
        return ok(
          records.filter(
            (record) =>
              record.zone === zoneId &&
              (!url.searchParams.get('name') || record.name === url.searchParams.get('name')) &&
              (!url.searchParams.get('type') || record.type === url.searchParams.get('type')),
          ),
        );
      }
      const record = { id: id('r'), zone: zoneId, type: String(body.type), name: String(body.name), content: String(body.content), proxied: body.proxied === true };
      records.push(record);
      return ok(record);
    }
    if ((match = /^\/zones\/([^/]+)\/settings\/([a-z_0-9]+)$/.exec(path))) {
      const zone = zones.find((entry) => entry.id === match![1]);
      if (zone && match[2] === 'ssl') zone.ssl = String(body.value);
      return ok({ id: match[2], value: body.value });
    }
    return json({ success: false, errors: [{ code: 7000, message: `no route ${method} ${path}` }], result: null }, 404);
  }

  beforeEach(() => {
    zones = [{ id: 'z-owner', name: 'owner.example', status: 'active', name_servers: [], ssl: 'strict' }];
    records = [{ id: 'r-owner', zone: 'z-owner', type: 'A', name: 'owner.example', content: '203.0.113.7', proxied: true }];
    vi.stubEnv('CONTROL_PLANE_CF_TOKEN', 'cf-token');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        return url.hostname === 'api.cloudflare.com' ? fakeCloudflare(url, init) : fakeDokploy(input, init);
      }),
    );
  });

  it('adds the zone, points both hosts at the owner’s origin, proxied, and hands back the nameservers', async () => {
    const result = await provision(spec());

    expect(result.steps.find((step) => step.id === 'dns')).toMatchObject({ state: 'done' });
    expect(result.nameservers).toEqual(['ada.ns.cloudflare.com', 'bob.ns.cloudflare.com']);
    const created = records.filter((record) => record.zone !== 'z-owner');
    expect(created.map((record) => `${record.name}=${record.content}:${record.proxied}`).sort()).toEqual([
      'media.mohamedhassan.com=203.0.113.7:true',
      'mohamedhassan.com=203.0.113.7:true',
    ]);
    // `full` on the zone it created — strict would 526 the certificate's own challenge.
    expect(zones.find((zone) => zone.name === 'mohamedhassan.com')?.ssl).toBe('full');
    expect(zones.find((zone) => zone.name === 'owner.example')?.ssl).toBe('strict');
  });

  it('leaves a record that already points elsewhere alone, and says so', async () => {
    zones.push({ id: 'z-t', name: 'mohamedhassan.com', status: 'active', name_servers: [], ssl: 'strict' });
    records.push({ id: 'r-t', zone: 'z-t', type: 'A', name: 'mohamedhassan.com', content: '198.51.100.1', proxied: true });

    const result = await provision(spec());

    expect(result.ok).toBe(true);
    expect(result.dnsConflicts).toEqual(['mohamedhassan.com']);
    expect(records.find((record) => record.id === 'r-t')?.content).toBe('198.51.100.1');
    // An existing zone's TLS mode is not this button's business.
    expect(zones.find((zone) => zone.id === 'z-t')?.ssl).toBe('strict');
  });
});

describe('provision — a key that already names another domain', () => {
  it('refuses instead of routing a second domain into the first stack', async () => {
    await provision(spec());
    const result = await provision(spec({ appHost: 'other-domain.com', mediaHost: 'media.other-domain.com' }));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('mohamedhassan.com');
    expect(state.domains[newCompose()!.composeId]!.some((domain) => domain.host.includes('other-domain'))).toBe(false);
  });
});

describe('updateIdentity', () => {
  it('rewrites the name and subject lines only, then rebuilds', async () => {
    const { updateIdentity } = await import('./provision');
    const created = await provision(spec());
    const before = newCompose()!.env ?? '';
    const deploys = state.deployments[created.composeId!]!.length;

    expect(await updateIdentity(created.composeId!, { displayName: 'أ. منى حسن', subject: 'chemistry' })).toBe(true);
    const after = newCompose()!.env ?? '';
    expect(parseEnvText(after).TENANT_DISPLAY_NAME).toBe('أ. منى حسن');
    expect(parseEnvText(after).TENANT_SUBJECT).toBe('chemistry');
    expect(parseEnvText(after).POSTGRES_PASSWORD).toBe(parseEnvText(before).POSTGRES_PASSWORD);
    expect(state.deployments[created.composeId!]!.length).toBe(deploys + 1);
    expect(await updateIdentity('c-owner', { displayName: 'x', subject: 'physics' })).toBe(false);
  });
});
