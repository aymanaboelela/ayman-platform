// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  TEMPLATE_KEYS,
  adminPassword,
  buildTenantEnv,
  checkEnvText,
  databaseName,
  generateSecrets,
  renderEnvText,
  setEnvLine,
  suggestTenantKey,
  vapidKeyPair,
} = await import('./tenant-env');

const TEMPLATE = readFileSync(path.resolve(__dirname, '../../../../deploy/tenant.env.example'), 'utf8');

function spec(overrides: Partial<Parameters<typeof buildTenantEnv>[0]> = {}) {
  return {
    key: 'mohamed-hassan',
    displayName: 'م. محمد حسن',
    subject: 'physics',
    landingPreset: 'board',
    accent: 'blue',
    appHost: 'mohamedhassan.com',
    mediaHost: 'media.mohamedhassan.com',
    adminName: 'محمد حسن',
    adminEmail: 'Teacher@Example.com',
    whatsapp: '+201000000000',
    socials: { youtube: '', instagram: '', tiktok: '', facebook: '', whatsappChannel: '' },
    entitlements: '',
    shared: {},
    ...overrides,
  };
}

describe('the generated environment', () => {
  /*
   * The whole point of generating the file: it must pass the same preflight
   * the runbook ends with, as a FIRST deploy, with nothing typed by hand but
   * the names. A rule added to the checker that this generator does not
   * satisfy fails here, before a stack is ever asked to boot on it.
   */
  it('passes the first-deploy preflight with zero errors', () => {
    const text = renderEnvText(buildTenantEnv(spec(), generateSecrets()));
    const report = checkEnvText(text, { firstDeploy: true });
    expect(report.errors).toEqual([]);
  });

  it('passes it as a staging stack one label under the owner, admin email included', () => {
    const text = renderEnvText(
      buildTenantEnv(
        spec({
          appHost: 'arabito.aymanaboelela.com',
          mediaHost: 'media-arabito.aymanaboelela.com',
          adminEmail: 'admin@arabito.aymanaboelela.com',
        }),
        generateSecrets(),
      ),
    );
    expect(checkEnvText(text, { firstDeploy: true, stagingUnderOwner: true }).errors).toEqual([]);
    expect(checkEnvText(text, { firstDeploy: true }).errors).not.toEqual([]);
  });

  it('carries every template key, in the template order', () => {
    const fromTemplate = TEMPLATE.split('\n')
      .map((line) => /^([A-Z_][A-Z0-9_]*)=/.exec(line.trim())?.[1])
      .filter((key): key is string => key !== undefined);
    expect([...TEMPLATE_KEYS]).toEqual(fromTemplate);
  });

  it('writes CLARITY_PROJECT_ID present and empty — absent would be Ayman’s project', () => {
    const text = renderEnvText(buildTenantEnv(spec(), generateSecrets()));
    expect(text).toMatch(/^CLARITY_PROJECT_ID=$/m);
  });

  it('never lets a pasted name become a second variable', () => {
    const env = buildTenantEnv(spec({ displayName: 'م. محمد\nPOSTGRES_DB=ayman_platform' }), generateSecrets());
    expect(env.TENANT_DISPLAY_NAME).not.toContain('\n');
    const text = renderEnvText(env);
    expect(text.match(/^POSTGRES_DB=/gm)).toHaveLength(1);
  });

  it('copies only the shared keys it was handed, and nothing empty', () => {
    const env = buildTenantEnv(spec({ shared: { GEMINI_API_KEY: 'g-key', GROQ_API_KEY: '  ' } }), generateSecrets());
    expect(env.GEMINI_API_KEY).toBe('g-key');
    expect(env.GROQ_API_KEY).toBe('');
  });

  it('names the WhatsApp device after the platform once, not twice', () => {
    expect(buildTenantEnv(spec(), generateSecrets()).WA_DEVICE_NAME).toBe('منصة م. محمد حسن');
    expect(buildTenantEnv(spec({ displayName: 'منصة النور' }), generateSecrets()).WA_DEVICE_NAME).toBe('منصة النور');
  });
});

describe('secrets', () => {
  it('makes database passwords that survive being put inside a URL', () => {
    const secrets = generateSecrets();
    expect(secrets.postgresPassword).toMatch(/^[0-9a-f]{64}$/);
    expect(secrets.runtimePassword).toMatch(/^[0-9a-f]{64}$/);
    expect(secrets.postgresPassword).not.toBe(secrets.runtimePassword);
  });

  it('makes a VAPID pair in the encoding web-push reads', () => {
    for (let run = 0; run < 50; run += 1) {
      const pair = vapidKeyPair();
      const point = Buffer.from(pair.publicKey, 'base64url');
      expect(point).toHaveLength(65);
      expect(point[0]).toBe(0x04);
      expect(Buffer.from(pair.privateKey, 'base64url')).toHaveLength(32);
    }
  });

  it('makes an admin password that can be read over the phone', () => {
    const password = adminPassword();
    expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){4}$/);
    expect(password.length).toBeGreaterThanOrEqual(12);
  });
});

describe('names', () => {
  it('turns a key into a database name Postgres and pg_isready accept unquoted', () => {
    expect(databaseName('mohamed-hassan')).toBe('mohamed_hassan_platform');
    expect(databaseName('3omar')).toBe('t_3omar_platform');
  });

  it('suggests a key from the domain, and nothing when it cannot', () => {
    expect(suggestTenantKey('mr-mohammedadel.com')).toBe('mr-mohammedadel');
    expect(suggestTenantKey('https://EngMohamedSabry.com/')).toBe('engmohamedsabry');
    expect(suggestTenantKey('محمد.com')).toBe('');
  });
});

describe('setEnvLine', () => {
  const live = '# owner note\nTENANT_KEY=sabry\nADMIN_EMAIL=a@b.co\n# ADMIN_EMAIL=commented\nX=1\n';

  it('replaces the live line and leaves comments alone', () => {
    const next = setEnvLine(live, 'ADMIN_EMAIL', null);
    expect(next).toContain('\nADMIN_EMAIL=\n');
    expect(next).toContain('# ADMIN_EMAIL=commented');
    expect(next).toContain('# owner note');
  });

  it('appends a missing key before the final newline', () => {
    const next = setEnvLine(live, 'TENANT_ENTITLEMENTS', 'a.b.c');
    expect(next.endsWith('TENANT_ENTITLEMENTS=a.b.c\n')).toBe(true);
  });
});
