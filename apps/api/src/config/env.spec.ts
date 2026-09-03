import { loadEnv } from './env';

const VALID = {
  NODE_ENV: 'development',
  API_PORT: '3300',
  APP_URL: 'http://localhost:3200',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=app',
  DIRECT_DATABASE_URL: 'postgresql://o:p@localhost:5432/db?schema=app',
  REDIS_URL: 'redis://localhost:6379',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:3300',
};

describe('loadEnv', () => {
  it('parses a valid environment and coerces the port to a number', () => {
    const env = loadEnv(VALID);
    expect(env.API_PORT).toBe(3300);
    expect(env.NODE_ENV).toBe('development');
  });

  it('crashes when a required variable is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = VALID;
    expect(() => loadEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('crashes when DATABASE_URL is not a postgres URL', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('reports every invalid key at once rather than the first', () => {
    expect(() => loadEnv({ ...VALID, DATABASE_URL: 'nope', REDIS_URL: 'nope' })).toThrow(
      /DATABASE_URL[\s\S]*REDIS_URL|REDIS_URL[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadEnv({ ...VALID, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });

  it('rejects a port above the valid TCP range', () => {
    expect(() => loadEnv({ ...VALID, API_PORT: '999999' })).toThrow(/API_PORT/);
  });

  it('rejects an APP_URL with no scheme, even though the URL parser accepts it', () => {
    // WHATWG URL parsing treats "localhost" as an opaque scheme here, so this
    // string looks valid to a bare `.url()` check — it must still be rejected.
    expect(() => loadEnv({ ...VALID, APP_URL: 'localhost:3200' })).toThrow(/APP_URL/);
  });

  it('rejects a non-http(s) APP_URL', () => {
    expect(() => loadEnv({ ...VALID, APP_URL: 'ftp://evil.example' })).toThrow(/APP_URL/);
  });

  it('rejects a REDIS_URL with the wrong scheme', () => {
    expect(() => loadEnv({ ...VALID, REDIS_URL: 'http://localhost:6379' })).toThrow(/REDIS_URL/);
  });

  it('defaults MEDIA_BASE_URL to the api origin, not a port nothing listens on', () => {
    const env = loadEnv(VALID);
    expect(env.MEDIA_BASE_URL).toBe('http://localhost:3300/media');
    expect(env.MEDIA_ROOT).toBe('./.media');
    expect(env.MEDIA_MAX_BYTES).toBe(8 * 1024 * 1024);
  });

  it('crashes at boot when MEDIA_BASE_URL collapses onto APP_URL (A10 / Global Constraint 16)', () => {
    expect(() =>
      loadEnv({ ...VALID, MEDIA_BASE_URL: 'http://localhost:3200/media' }),
    ).toThrow(/MEDIA_BASE_URL/);
  });

  it('boots with no OAuth vars set at all — local dev happens before the OAuth apps exist', () => {
    const env = loadEnv(VALID);
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.APPLE_CLIENT_ID).toBeUndefined();
  });

  // `docker-compose.yml` passes these as `${GOOGLE_CLIENT_ID:-}`, which sets
  // the variable to "" — not unset — whenever the operator hasn't filled it
  // in. Treating that as "present but too short" would take the whole API
  // down at boot over an unconfigured optional provider.
  it('treats empty-string OAuth vars as unset rather than as invalid values', () => {
    const env = loadEnv({
      ...VALID,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      APPLE_CLIENT_ID: '',
      APPLE_TEAM_ID: '',
      APPLE_KEY_ID: '',
      APPLE_PRIVATE_KEY: '',
    });
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.APPLE_CLIENT_ID).toBeUndefined();
  });

  // The pairing rule still has to bite on a half-filled pair — normalising ""
  // to "absent" must not turn a real misconfiguration into a silent no-op.
  it('still rejects a real client id paired with an empty secret', () => {
    expect(() => loadEnv({ ...VALID, GOOGLE_CLIENT_ID: 'abc', GOOGLE_CLIENT_SECRET: '' })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
  });

  it('rejects GOOGLE_CLIENT_ID without a matching GOOGLE_CLIENT_SECRET', () => {
    expect(() => loadEnv({ ...VALID, GOOGLE_CLIENT_ID: 'abc' })).toThrow(/GOOGLE_CLIENT_SECRET/);
  });

  it('rejects GOOGLE_CLIENT_SECRET without a matching GOOGLE_CLIENT_ID', () => {
    expect(() => loadEnv({ ...VALID, GOOGLE_CLIENT_SECRET: 'shh' })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('accepts a fully paired Google client id and secret', () => {
    const env = loadEnv({ ...VALID, GOOGLE_CLIENT_ID: 'abc', GOOGLE_CLIENT_SECRET: 'shh' });
    expect(env.GOOGLE_CLIENT_ID).toBe('abc');
  });

  it('rejects a partial set of Apple credentials', () => {
    expect(() =>
      loadEnv({ ...VALID, APPLE_CLIENT_ID: 'id', APPLE_TEAM_ID: 'team' }),
    ).toThrow(/APPLE_CLIENT_ID/);
  });

  it('accepts a fully paired set of Apple credentials', () => {
    const env = loadEnv({
      ...VALID,
      APPLE_CLIENT_ID: 'id',
      APPLE_TEAM_ID: 'team',
      APPLE_KEY_ID: 'key',
      APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----',
    });
    expect(env.APPLE_TEAM_ID).toBe('team');
  });

  it('rejects a BETTER_AUTH_SECRET shorter than 32 characters', () => {
    expect(() => loadEnv({ ...VALID, BETTER_AUTH_SECRET: 'too-short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('rejects a schemeless BETTER_AUTH_URL, even though the URL parser accepts it', () => {
    expect(() => loadEnv({ ...VALID, BETTER_AUTH_URL: 'localhost:3300' })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  it('rejects a non-http(s) BETTER_AUTH_URL', () => {
    expect(() => loadEnv({ ...VALID, BETTER_AUTH_URL: 'ftp://evil.example' })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  // ── The model lists ────────────────────────────────────────────────────
  //
  // Same empty-string trap as the OAuth pair above, and this one actually
  // fired: `GROQ_MODEL` was `z.string().min(1).default(...)`, compose passed
  // `${GROQ_MODEL:-}` — an EMPTY STRING, not an absent key — and `.default()`
  // does not apply to `''`. The API refused to boot, `web` never started
  // because it waits on `api`'s healthcheck, and every public page served
  // Traefik's `404 page not found` for an hour.
  //
  // Asserted per-variable rather than in a loop: the point of the test is that
  // BOTH of them fall back, and a loop over a list would keep passing if
  // somebody later added a third model variable without the wrapper.
  it('falls back to the default model list when the variable is an empty string', () => {
    const env = loadEnv({ ...VALID, GEMINI_MODEL: '', GROQ_MODEL: '' });
    expect(env.GEMINI_MODEL).toBe('gemini-2.5-flash,gemini-2.5-flash-lite,gemini-3.5-flash-lite');
    expect(env.GROQ_MODEL).toBe('openai/gpt-oss-120b,openai/gpt-oss-20b');
  });

  it('falls back to the default model list when the variable is absent', () => {
    const env = loadEnv(VALID);
    expect(env.GEMINI_MODEL).toContain('gemini-2.5-flash');
    expect(env.GROQ_MODEL).toContain('openai/gpt-oss-120b');
  });

  // Normalising "" to absent must not stop an operator's real choice from
  // winning — the variable exists so a model can be swapped without a build.
  it('keeps an explicitly configured model list', () => {
    const env = loadEnv({ ...VALID, GEMINI_MODEL: 'gemini-9', GROQ_MODEL: 'groq-9,groq-8' });
    expect(env.GEMINI_MODEL).toBe('gemini-9');
    expect(env.GROQ_MODEL).toBe('groq-9,groq-8');
  });

  // ── Web Push (VAPID) ───────────────────────────────────────────────────

  it('boots with no VAPID vars set — push is a quiet no-op without them', () => {
    const env = loadEnv(VALID);
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.VAPID_SUBJECT).toBeUndefined();
  });

  // Same empty-string trap as every other optional credential in this file —
  // compose's `${VAR:-}` substitution, not an absent key.
  it('treats empty-string VAPID vars as unset rather than as invalid values', () => {
    const env = loadEnv({
      ...VALID,
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
    });
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_SUBJECT).toBeUndefined();
  });

  it('rejects a VAPID_SUBJECT that is neither mailto: nor https:', () => {
    expect(() =>
      loadEnv({
        ...VALID,
        VAPID_PUBLIC_KEY: 'pub',
        VAPID_PRIVATE_KEY: 'priv',
        VAPID_SUBJECT: 'admin@example.com',
      }),
    ).toThrow(/VAPID_SUBJECT/);
  });

  it('rejects a partial set of VAPID vars', () => {
    expect(() => loadEnv({ ...VALID, VAPID_PUBLIC_KEY: 'pub' })).toThrow(/VAPID_PUBLIC_KEY/);
  });

  it('accepts a fully paired VAPID set, mailto: subject', () => {
    const env = loadEnv({
      ...VALID,
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:admin@example.com',
    });
    expect(env.VAPID_PUBLIC_KEY).toBe('pub');
    expect(env.VAPID_SUBJECT).toBe('mailto:admin@example.com');
  });

  it('accepts an https: VAPID_SUBJECT too', () => {
    const env = loadEnv({
      ...VALID,
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'https://ayman.example',
    });
    expect(env.VAPID_SUBJECT).toBe('https://ayman.example');
  });
});
