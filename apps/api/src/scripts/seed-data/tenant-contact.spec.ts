import {
  OFFICIAL_PROFILES,
  OFFICIAL_WHATSAPP_CHANNEL,
  OFFICIAL_WHATSAPP_E164,
} from '@ayman/contracts/site-profiles';

/**
 * `TENANT_CONTACT_SEED` is computed at MODULE LOAD, because `seed.ts` reads it
 * once at the top of a process that exits minutes later. So every case here
 * has to reset the module registry and re-import, not just reassign
 * `process.env` — a plain reassignment would keep testing the first case's
 * values and pass for the wrong reason.
 */
const ENV_KEYS = [
  'TENANT_KEY',
  'TENANT_YOUTUBE',
  'TENANT_INSTAGRAM',
  'TENANT_TIKTOK',
  'TENANT_FACEBOOK',
  'TENANT_WHATSAPP_CHANNEL',
  'TENANT_WHATSAPP',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];
type Loaded = typeof import('./tenant-contact');

async function loadWith(env: Partial<Record<EnvKey, string>>): Promise<Loaded> {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;

  jest.resetModules();
  return import('./tenant-contact');
}

let saved: Partial<Record<EnvKey, string | undefined>>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('TENANT_CONTACT_SEED', () => {
  it("is Ayman's six destinations when no tenant environment is set at all", async () => {
    // This is the live platform. It sets none of these variables, and the
    // seeded contact block must not change by one character.
    const { TENANT_KEY, TENANT_CONTACT_SEED } = await loadWith({});

    expect(TENANT_KEY).toBe('ayman');
    expect(TENANT_CONTACT_SEED).toEqual({
      youtube: OFFICIAL_PROFILES.youtube,
      instagram: OFFICIAL_PROFILES.instagram,
      tiktok: OFFICIAL_PROFILES.tiktok,
      facebook: OFFICIAL_PROFILES.facebook,
      whatsappChannel: OFFICIAL_WHATSAPP_CHANNEL,
      whatsapp: OFFICIAL_WHATSAPP_E164,
    });
  });

  it('treats an empty TENANT_KEY as Ayman, because compose substitutes unset as ""', async () => {
    const { TENANT_KEY, TENANT_CONTACT_SEED } = await loadWith({ TENANT_KEY: '' });

    expect(TENANT_KEY).toBe('ayman');
    expect(TENANT_CONTACT_SEED.whatsapp).toBe(OFFICIAL_WHATSAPP_E164);
  });

  it('inherits NOTHING for another tenant that supplies no destinations', async () => {
    // The whole point of the file. A new stack deployed before anybody has
    // filled in its socials must publish no links, never Ayman's.
    const { TENANT_CONTACT_SEED } = await loadWith({ TENANT_KEY: 'x' });

    expect(TENANT_CONTACT_SEED).toEqual({
      youtube: null,
      instagram: null,
      tiktok: null,
      facebook: null,
      whatsappChannel: null,
      whatsapp: null,
    });
  });

  it("never leaks Ayman's WhatsApp number to another tenant, however partial the config", async () => {
    const { TENANT_CONTACT_SEED } = await loadWith({
      TENANT_KEY: 'y',
      TENANT_YOUTUBE: 'https://www.youtube.com/@someone-else',
    });

    expect(TENANT_CONTACT_SEED.youtube).toBe('https://www.youtube.com/@someone-else');
    expect(TENANT_CONTACT_SEED.whatsapp).toBeNull();
    expect(Object.values(TENANT_CONTACT_SEED)).not.toContain(OFFICIAL_WHATSAPP_E164);
    expect(Object.values(TENANT_CONTACT_SEED)).not.toContain(OFFICIAL_PROFILES.instagram);
  });

  it('lets another tenant set every destination', async () => {
    const { TENANT_CONTACT_SEED } = await loadWith({
      TENANT_KEY: 'x',
      TENANT_YOUTUBE: 'https://www.youtube.com/@x',
      TENANT_INSTAGRAM: 'https://www.instagram.com/x',
      TENANT_TIKTOK: 'https://www.tiktok.com/@x',
      TENANT_FACEBOOK: 'https://www.facebook.com/x',
      TENANT_WHATSAPP_CHANNEL: 'https://whatsapp.com/channel/0029Xxxxxxxxxxxxxxxxxxxx',
      TENANT_WHATSAPP: '+201000000000',
    });

    expect(TENANT_CONTACT_SEED.whatsapp).toBe('+201000000000');
    expect(TENANT_CONTACT_SEED.facebook).toBe('https://www.facebook.com/x');
  });

  it('trims, so a value pasted into a Dokploy env box with a newline is still a URL', async () => {
    const { TENANT_CONTACT_SEED } = await loadWith({
      TENANT_KEY: 'x',
      TENANT_YOUTUBE: '  https://www.youtube.com/@x\n',
    });

    expect(TENANT_CONTACT_SEED.youtube).toBe('https://www.youtube.com/@x');
  });

  it('reads a whitespace-only override as unset, and still inherits nothing', async () => {
    const { TENANT_CONTACT_SEED } = await loadWith({ TENANT_KEY: 'x', TENANT_WHATSAPP: '   ' });

    expect(TENANT_CONTACT_SEED.whatsapp).toBeNull();
  });
});
