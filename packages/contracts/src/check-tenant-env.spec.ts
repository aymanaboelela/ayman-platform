import { describe, expect, it } from 'vitest';
// @ts-expect-error — a dependency-free .mjs script, deliberately untyped so it
// runs on a bare server before anything is installed.
import { checkTenantEnv } from '../../../scripts/check-tenant-env.mjs';

/**
 * The preflight is the only thing standing between "forgot one variable" and
 * "a second instructor's students message Ayman". Every isolation default in
 * the codebase is fail-closed — an unset `TENANT_KEY` means "this IS Ayman's
 * stack" — which makes the leak silent rather than impossible, so the checker
 * itself has to be tested like production code.
 *
 * It lives in `@ayman/contracts` because that package's suite runs in CI
 * (`pnpm turbo test`), and a check nothing runs is not a check.
 */

/**
 * Obviously-fake placeholders, built at runtime rather than written out.
 *
 * A realistic-looking random string assigned to `POSTGRES_PASSWORD:` is
 * indistinguishable from a real one to gitleaks — which scans EVERY branch, so
 * one such literal fails the check on every open PR ([[gitleaks]] in CI). It is
 * also indistinguishable to a human reader, who then has to work out whether a
 * credential just leaked. Repeated characters are neither.
 *
 * They still have to satisfy the rules under test: at least 32 characters for
 * the auth secret, and the two database passwords must differ.
 */
const FAKE = {
  postgresPassword: `pg-${'x'.repeat(32)}`,
  runtimePassword: `rt-${'y'.repeat(32)}`,
  authSecret: `auth-${'z'.repeat(40)}`,
  adminPassword: `admin-${'w'.repeat(20)}`,
  waToken: `wa-${'0'.repeat(32)}`,
} as const;

/** A tenant config with nothing wrong with it. Each case breaks one thing. */
function goodEnv(): Record<string, string> {
  return {
    TENANT_KEY: 'mohamed-hassan',
    TENANT_DISPLAY_NAME: 'منصة محمد حسن',
    POSTGRES_DB: 'mohamed_platform',
    POSTGRES_PASSWORD: FAKE.postgresPassword,
    RUNTIME_PASSWORD: FAKE.runtimePassword,
    BETTER_AUTH_SECRET: FAKE.authSecret,
    APP_URL: 'https://mohamedhassan.com',
    MEDIA_ORIGIN: 'https://media-mohamedhassan.com',
    ADMIN_NAME: 'Mohamed Hassan',
    ADMIN_EMAIL: 'admin@mohamedhassan.com',
    ADMIN_PASSWORD: FAKE.adminPassword,
    // The pair is all-or-nothing: `config/env.ts` refines it, and one without
    // the other stops the API booting.
    WA_SERVICE_URL: 'http://wa:3400',
    WA_TOKEN: FAKE.waToken,
    WA_DEVICE_NAME: 'منصة محمد حسن',
    CLARITY_PROJECT_ID: '',
    TENANT_WHATSAPP: '+201000000000',
    TENANT_YOUTUBE: 'https://www.youtube.com/@mohamedhassan',
    TENANT_INSTAGRAM: 'https://www.instagram.com/mohamedhassan',
    TENANT_TIKTOK: 'https://www.tiktok.com/@mohamedhassan',
    TENANT_FACEBOOK: 'https://www.facebook.com/mohamedhassan',
    // All three, because the API refines them as a group.
    VAPID_PUBLIC_KEY: 'BPk1',
    VAPID_PRIVATE_KEY: 'vk1',
    VAPID_SUBJECT: 'mailto:admin@mohamedhassan.com',
  };
}

function check(overrides: Record<string, string | undefined> = {}) {
  const env = goodEnv();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return checkTenantEnv(env) as { errors: string[]; warnings: string[] };
}

describe('checkTenantEnv', () => {
  it('passes a complete, correct tenant config with no errors', () => {
    const { errors, warnings } = check();

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  describe('the gate that prevents inheriting Ayman', () => {
    it('rejects a missing TENANT_KEY', () => {
      // The whole failure mode: silence means "this is Ayman's stack".
      expect(check({ TENANT_KEY: undefined }).errors.join(' ')).toContain('TENANT_KEY');
    });

    it('rejects TENANT_KEY=ayman on what is meant to be a new stack', () => {
      expect(check({ TENANT_KEY: 'ayman' }).errors.join(' ')).toContain('TENANT_KEY');
    });

    it('rejects a TENANT_KEY with spaces or capitals', () => {
      expect(check({ TENANT_KEY: 'Mohamed Hassan' }).errors).toHaveLength(1);
    });
  });

  describe('the database', () => {
    it("rejects pointing a second stack at Ayman's live database", () => {
      const { errors } = check({ POSTGRES_DB: 'ayman_platform' });

      expect(errors.join(' ')).toContain('ayman_platform');
    });

    it('rejects a missing POSTGRES_DB, which would default to his', () => {
      expect(check({ POSTGRES_DB: undefined }).errors.join(' ')).toContain('POSTGRES_DB');
    });

    it('rejects one password used for both the owner and the runtime role', () => {
      const shared = FAKE.postgresPassword;
      const { errors } = check({ POSTGRES_PASSWORD: shared, RUNTIME_PASSWORD: shared });

      expect(errors.join(' ')).toContain('DDL');
    });
  });

  describe('origins', () => {
    it('rejects APP_URL and MEDIA_ORIGIN sharing an origin, which stops the API booting', () => {
      const { errors } = check({ MEDIA_ORIGIN: 'https://mohamedhassan.com' });

      expect(errors.join(' ')).toContain('same origin');
    });

    it("rejects a subdomain of Ayman's zone, which would have no certificate", () => {
      const { errors } = check({ APP_URL: 'https://x.aymanaboelela.com' });

      expect(errors.join(' ')).toContain('apex');
    });

    it('rejects plain http', () => {
      const { errors } = check({ APP_URL: 'http://mohamedhassan.com' });

      expect(errors.join(' ')).toContain('https');
    });
  });

  describe("Ayman's real-world identity", () => {
    it('rejects his WhatsApp number wherever it appears', () => {
      expect(check({ TENANT_WHATSAPP: '+201021196367' }).errors.join(' ')).toContain('WhatsApp');
    });

    it('rejects it without the leading plus too', () => {
      const { errors } = check({ TENANT_WHATSAPP_CHANNEL: 'https://wa.me/201021196367' });

      expect(errors.join(' ')).toContain('WhatsApp');
    });

    it('rejects his Clarity project id', () => {
      expect(check({ CLARITY_PROJECT_ID: 'y1hu9w4lii' }).errors.join(' ')).toContain('Clarity');
    });

    it('rejects an ABSENT CLARITY_PROJECT_ID, which is not the same as an empty one', () => {
      // docker-compose.yml uses `${CLARITY_PROJECT_ID-…}` — ONE dash. Absent
      // takes his project; empty disables analytics. This distinction is the
      // entire bug, and it is invisible in the compose file at a glance.
      const { errors } = check({ CLARITY_PROJECT_ID: undefined });

      expect(errors.join(' ')).toContain('Clarity');
    });

    it('accepts an explicitly empty CLARITY_PROJECT_ID', () => {
      expect(check({ CLARITY_PROJECT_ID: '' }).errors).toEqual([]);
    });
  });

  describe('shapes that are wrong in a way the platform cannot recover from', () => {
    it('rejects an Egyptian number that kept its trunk zero', () => {
      // `+20` is a real country code and `0102…` is all digits, so this passes
      // every generic E.164 regex and is still not a number that exists. It
      // needs its own rule, and the message has to say what the right form is.
      const { errors } = check({ TENANT_WHATSAPP: '+2001021196000' });

      expect(errors.join(' ')).toContain('trunk zero');
    });

    it('rejects a phone that is not digits at all', () => {
      expect(check({ TENANT_WHATSAPP: '0102 119 6367' }).errors.join(' ')).toContain('E.164');
    });

    it('warns on a +20 number that is not a mobile, without blocking the deploy', () => {
      const { errors, warnings } = check({ TENANT_WHATSAPP: '+20222222222' });

      expect(errors).toEqual([]);
      expect(warnings.join(' ')).toContain('Egyptian mobile');
    });

    it('rejects a short BETTER_AUTH_SECRET', () => {
      expect(check({ BETTER_AUTH_SECRET: 'tooshort' }).errors.join(' ')).toContain('32');
    });

    it('rejects a value still saying CHANGE_ME', () => {
      expect(check({ ADMIN_PASSWORD: 'CHANGE_ME' }).errors.join(' ')).toContain('CHANGE_ME');
    });
  });

  describe('warnings — deployable, but somebody will regret it', () => {
    it('warns rather than fails when a social link is missing', () => {
      const { errors, warnings } = check({ TENANT_TIKTOK: '' });

      expect(errors).toEqual([]);
      expect(warnings.join(' ')).toContain('TENANT_TIKTOK');
    });

    it('warns when the display name is missing, since the hero then names nobody', () => {
      const { errors, warnings } = check({ TENANT_DISPLAY_NAME: '' });

      expect(errors).toEqual([]);
      expect(warnings.join(' ')).toContain('المنصة التعليمية');
    });
  });

  describe('the config that boots BROKEN — every one of these shipped green before', () => {
    it('rejects a database password containing a URL delimiter', () => {
      // `openssl rand -base64 32` produces `/` about half the time, and the
      // template used to tell operators to run exactly that. The value is
      // interpolated raw into `postgresql://…:PASSWORD@postgres:5432/…`, so a
      // `/` before the `@` re-parses the URL and the API restart-loops on a
      // connection error that names none of this.
      const { errors } = check({ POSTGRES_PASSWORD: `ab/cd${'x'.repeat(28)}` });

      expect(errors.join(' ')).toContain('postgresql://');
    });

    it('rejects an ADMIN_PASSWORD create-admin would refuse', () => {
      // The entrypoint runs create-admin with `|| echo WARNING`, so its throw
      // is swallowed and the platform boots with NO ADMIN ACCOUNT. Nobody can
      // sign in and the only trace is one line in a boot log.
      const { errors } = check({ ADMIN_PASSWORD: 'short' });

      expect(errors.join(' ')).toContain('no admin account');
    });

    it('rejects an ADMIN_EMAIL create-admin would refuse', () => {
      expect(check({ ADMIN_EMAIL: 'not-an-email' }).errors.join(' ')).toContain('ADMIN_EMAIL');
    });

    it('rejects CHANGE_ME on ANY key, not just the seven it used to check', () => {
      // `VAPID_SUBJECT=CHANGE_ME` sailed through and crashed the API at boot.
      const { errors } = check({ VAPID_SUBJECT: 'CHANGE_ME' });

      expect(errors.join(' ')).toContain('VAPID_SUBJECT');
    });

    it('rejects a trailing slash on MEDIA_ORIGIN, which every media URL inherits', () => {
      // `MEDIA_BASE_URL: ${MEDIA_ORIGIN}/media` is plain concatenation, so a
      // trailing slash gives `//media` and every upload 404s. Every other rule
      // runs on `new URL(v).origin`, which discards exactly this.
      const { errors } = check({ MEDIA_ORIGIN: 'https://media-mohamedhassan.com/' });

      expect(errors.join(' ')).toContain('bare origin');
    });

    it('rejects a path on APP_URL', () => {
      expect(check({ APP_URL: 'https://mohamedhassan.com/platform' }).errors.join(' ')).toContain(
        'bare origin',
      );
    });

    it('rejects WA_TOKEN without WA_SERVICE_URL — the API refuses to boot', () => {
      // `config/env.ts` refines the pair to all-or-nothing, and a container
      // that will not start 404s the whole domain through Traefik. The
      // template handed out the token alone.
      const { errors } = check({ WA_SERVICE_URL: '' });

      expect(errors.join(' ')).toContain('half-configured');
    });

    it('rejects a half-filled video mirror', () => {
      const { errors } = check({ VIDEO_MIRROR_BUCKET: 'a-bucket' });

      expect(errors.join(' ')).toContain('half-configured');
    });

    it('rejects GOOGLE_CLIENT_ID without its secret', () => {
      const { errors } = check({ GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com' });

      expect(errors.join(' ')).toContain('half-configured');
    });

    it('rejects two of the three VAPID keys', () => {
      const { errors } = check({ VAPID_SUBJECT: '' });

      expect(errors.join(' ')).toContain('half-configured');
    });

    it('accepts a group left entirely empty', () => {
      expect(
        check({ VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '' }).errors,
      ).toEqual([]);
    });

    it('rejects a social link that is not https — the seed throws on every boot', () => {
      const { errors } = check({ TENANT_YOUTUBE: 'http://www.youtube.com/@x' });

      expect(errors.join(' ')).toContain('https://');
    });
  });

  it('does not leak state between runs', () => {
    // `errors`/`warnings` are module-level arrays that each call resets. If the
    // reset ever regresses, every later check inherits the first one's result —
    // which would make a broken config pass right after a good one.
    check({ TENANT_KEY: 'ayman' });

    expect(check().errors).toEqual([]);
  });
});
