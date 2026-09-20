import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — a dependency-free .mjs script, deliberately untyped so it
// runs on a bare server before anything is installed.
import { checkTenantEnv, parseEnvFile } from '../../../scripts/check-tenant-env.mjs';
import { CONTROL_ISSUER, ENTITLEMENTS_VERSION } from './admin/entitlements';

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

/**
 * A document-SHAPED `TENANT_ENTITLEMENTS`, assembled at runtime.
 *
 * The preflight decodes the payload and reads `sub` and `exp`; it does NOT
 * verify the signature (the script has no dependencies and no public key by
 * design), so a run of filler in the third segment is exactly as good as a
 * real one for what is under test here.
 *
 * ⚠️ Built rather than written out for the same reason the passwords above
 * are: a real compact JWS pasted into a source file is what gitleaks' `jwt`
 * rule looks for, and gitleaks scans EVERY branch — one literal here fails the
 * check on every open PR.
 */
function fakeDocument(overrides: { sub?: string; exp?: number } = {}): string {
  const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = segment({ alg: 'EdDSA', kid: 'cp-2026-01' });
  const payload = segment({
    iss: CONTROL_ISSUER,
    sub: overrides.sub ?? 'mohamed-hassan',
    ver: ENTITLEMENTS_VERSION,
    exp: overrides.exp ?? Math.floor(Date.now() / 1000) + 86_400,
    features: { 'video.upload': true },
  });
  // ٦٤ بايت توقيع Ed25519 = ٨٦ حرف base64url. الطول صح والبايتات مش مهمة.
  return `${header}.${payload}.${'s'.repeat(86)}`;
}

/**
 * A tenant config with nothing wrong with it. Each case breaks one thing.
 *
 * ⚠️ `WA_SERVICE_URL` and `VAPID_SUBJECT` were both MISSING here, and this
 * fixture was still called "correct". That is not a detail of the test — it is
 * the bug itself, written down twice: a reviewer filled the template the same
 * way, ran the preflight, was told «safe to deploy», and the API refused to
 * boot on exactly these two rules. A fixture that cannot boot must not be the
 * one the suite calls good.
 */
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
    WA_TOKEN: FAKE.waToken,
    // The sidecar's address on the internal compose network. Identical on
    // every stack, and all-or-nothing with the token above: `config/env.ts`
    // refines the pair, and one without the other stops the API booting.
    WA_SERVICE_URL: 'http://wa:3400',
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
    // مستند الصلاحيات. موجود هنا عشان الفكستشر «السليم» يعدّي على مسار
    // القبول كمان، مش على مسار الغياب بس — وغيابه بردو سليم ومابيقولش حاجة
    // (ستاك جديد قبل ما يتوقّعله حاجة)، فالتست اللي تحت بيثبّت ده.
    TENANT_ENTITLEMENTS: fakeDocument(),
  };
}

function check(
  overrides: Record<string, string | undefined> = {},
  options: { firstDeploy?: boolean } = {},
) {
  const env = goodEnv();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return checkTenantEnv(env, options) as { errors: string[]; warnings: string[] };
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

  /**
   * المستند الموقّع.
   *
   * الفحص هنا مابيتحققش من التوقيع — الملف `.mjs` مالوش dependencies عن قصد
   * ومفيهوش المفتاح العام. بيفك البايلود ويقرا `sub` و`exp`، وهما الغلطتين
   * اللي بتحصلا فعلًا، والاتنين صامتين تمامًا من غيره: الـAPI بيرفض المستند،
   * بيكتب سطر في لوج محدش بيفتحه، والمدرّس بيلاقي فيتشر دفع فيها مش موجودة.
   */
  describe('the signed entitlements document', () => {
    it('rejects a document issued for a different instructor', () => {
      const { errors } = check({ TENANT_ENTITLEMENTS: fakeDocument({ sub: 'mohamed-sabry' }) });

      expect(errors.join(' ')).toContain('mohamed-sabry');
      expect(errors.join(' ')).toContain('TENANT_KEY');
    });

    it('rejects a document that has already expired', () => {
      const yesterday = Math.floor(Date.now() / 1000) - 86_400;
      const { errors } = check({ TENANT_ENTITLEMENTS: fakeDocument({ exp: yesterday }) });

      expect(errors.join(' ')).toContain('expired');
    });

    // أكتر غلطة متوقعة في لوحة Dokploy: التوكن اتقص وهو بيتلزق.
    it('rejects a truncated document', () => {
      const truncated = fakeDocument().split('.').slice(0, 2).join('.');
      const { errors } = check({ TENANT_ENTITLEMENTS: truncated });

      expect(errors.join(' ')).toContain('compact JWS');
    });

    it('accepts a document issued for THIS stack', () => {
      const { errors } = check({ TENANT_ENTITLEMENTS: fakeDocument({ sub: 'mohamed-hassan' }) });

      expect(errors).toEqual([]);
    });

    /**
     * ولا حاجة — لا خطأ ولا تحذير.
     *
     * ستاك جديد قبل ما صاحب السوفتوير يوقّعله حاجة بيشتغل بالافتراضي المعلن،
     * وده إعداد صحيح تمامًا. تحذير بيولّع على كل إعداد سليم بيعلّم اللي بينشر
     * إن خرج الفحص بيتتجاهل — ونفس الحجة مكتوبة فوق عند `ADMIN_EMAIL`.
     */
    it('says nothing at all when no document is set', () => {
      const { errors, warnings } = check({ TENANT_ENTITLEMENTS: '' });

      expect(errors).toEqual([]);
      expect(warnings.join(' ')).not.toContain('TENANT_ENTITLEMENTS');
    });

    // غلطة واحدة، سطر واحد: `TENANT_KEY` غلط معناه رسالة واحدة عنه، مش رسالة
    // تانية بتقول إن `sub` مابيساويهوش — وهي نتيجة ليه مش عطل مستقل.
    it('does not pile a second error onto an already-invalid TENANT_KEY', () => {
      const { errors } = check({ TENANT_KEY: 'Mohamed Hassan' });

      expect(errors).toHaveLength(1);
    });
  });

  /**
   * ⚠️ EVERY CASE BELOW IS A TRANSCRIPTION OF THE BOOT SCHEMA.
   *
   * The preflight said «OK — safe to deploy» and the API then refused to
   * start, which is not a smaller failure than a bad deploy: `web` waits on
   * `api`'s healthcheck and Traefik has no backend without it, so every page
   * on the domain answers `404 page not found`. A gate that blesses a config
   * the boot schema rejects is the reason nobody reads the deploy log.
   *
   * So each rule here names the line it copies — `apps/api/src/config/env.ts`
   * or `apps/api/src/modules/video-mirror/mirror-config.ts`. When one of those
   * changes, one of these should fail.
   */
  describe('the boot contract, copied rather than guessed', () => {
    /**
     * THE ONE THAT SHIPPED. `docker-compose.yml` feeds `WA_TOKEN` to the API
     * as `WA_SERVICE_TOKEN`; the template carried the token and never
     * mentioned the URL, and `env.ts` refuses to boot with half the pair.
     */
    it('rejects WA_TOKEN with no WA_SERVICE_URL — the API will not boot', () => {
      const { errors } = check({ WA_SERVICE_URL: '' });

      expect(errors.join(' ')).toContain('WA_SERVICE_URL');
    });

    it('rejects WA_SERVICE_URL with no WA_TOKEN', () => {
      expect(check({ WA_TOKEN: '' }).errors.join(' ')).toContain('WA_SERVICE_TOKEN');
    });

    it('accepts both of them empty — WhatsApp sending is simply off', () => {
      const { errors } = check({ WA_TOKEN: '', WA_SERVICE_URL: '' });

      expect(errors).toEqual([]);
    });

    /**
     * A bare `wa:3400` satisfies `z.string().url()` — WHATWG parses it as a
     * URL whose scheme is `wa` — and fails the explicit scheme refinement that
     * `env.ts` adds on top for exactly this reason.
     */
    it('rejects a WA_SERVICE_URL with no scheme', () => {
      expect(check({ WA_SERVICE_URL: 'wa:3400' }).errors.join(' ')).toContain('scheme');
    });

    /** THE OTHER ONE THAT SHIPPED: `CHANGE_ME` is not a `mailto:`. */
    it('rejects a VAPID_SUBJECT that is neither mailto: nor https://', () => {
      expect(check({ VAPID_SUBJECT: 'ayman@example.com' }).errors.join(' ')).toContain('RFC 8292');
    });

    it('rejects two VAPID values out of three', () => {
      expect(check({ VAPID_SUBJECT: '' }).errors.join(' ')).toContain('half-configured');
    });

    it('accepts all three VAPID values empty', () => {
      const { errors } = check({
        VAPID_PUBLIC_KEY: '',
        VAPID_PRIVATE_KEY: '',
        VAPID_SUBJECT: '',
      });

      expect(errors).toEqual([]);
    });

    it('rejects half a Google provider', () => {
      expect(check({ GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com' }).errors.join(' ')).toContain(
        'GOOGLE_CLIENT_SECRET',
      );
    });

    /**
     * `mirror-config.ts` throws on a partial config, and the fifth variable is
     * spelled `VIDEO_ORIGIN` in the template and `VIDEO_MIRROR_PUBLIC_URL` in
     * the module — compose renames it, so a reader of either one alone cannot
     * see the set. The message has to name both spellings.
     */
    it('rejects a half-configured video mirror, naming both spellings of the fifth key', () => {
      const { errors } = check({
        VIDEO_MIRROR_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        VIDEO_MIRROR_BUCKET: 'mohamed-video',
      });

      expect(errors.join(' ')).toContain('VIDEO_ORIGIN');
      expect(errors.join(' ')).toContain('VIDEO_MIRROR_PUBLIC_URL');
    });

    it('accepts all five mirror variables set together', () => {
      const { errors } = check({
        VIDEO_MIRROR_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        VIDEO_MIRROR_BUCKET: 'mohamed-video',
        VIDEO_MIRROR_ACCESS_KEY_ID: `ak-${'1'.repeat(20)}`,
        VIDEO_MIRROR_SECRET_ACCESS_KEY: `sk-${'2'.repeat(40)}`,
        VIDEO_ORIGIN: 'https://video-mohamedhassan.com',
      });

      expect(errors).toEqual([]);
    });

    /**
     * Compose interpolates the password into `postgresql://…:${PW}@postgres…`,
     * and the runbook used to generate it with `openssl rand -base64 32`. A
     * 44-character base64 string carries a `/` about 96% of the time, and a
     * `/` ends the URL's authority — so the documented command produced a
     * stack that could not boot nineteen times in twenty, with an error about
     * DATABASE_URL that never mentions the password.
     */
    it('rejects a database password containing a slash', () => {
      const { errors } = check({ RUNTIME_PASSWORD: `rt/${'y'.repeat(32)}` });

      expect(errors.join(' ')).toContain('connection string');
    });

    it('rejects a database name that is not a plain identifier', () => {
      expect(check({ POSTGRES_DB: 'mohamed-platform' }).errors.join(' ')).toContain('pg_isready');
    });

    /**
     * Compose builds `MEDIA_BASE_URL: ${MEDIA_ORIGIN}/media` and `env.ts`
     * types it as an http(s) URL, so a bare hostname is a boot failure rather
     * than a broken image.
     */
    it('rejects a MEDIA_ORIGIN with no scheme', () => {
      expect(check({ MEDIA_ORIGIN: 'media-mohamedhassan.com' }).errors.join(' ')).toContain('https');
    });
  });

  /**
   * The first admin is the one pair whose CORRECT value flips at launch.
   *
   * `docker-entrypoint.sh` bootstraps only when both are set; compose tells
   * the operator to blank them once the account exists. The old rule demanded
   * them unconditionally, so re-running the gate on a correct, launched stack
   * printed «Do NOT deploy this stack» — which teaches an operator that this
   * script's verdict is noise, and that is the only way a gate like this dies.
   */
  describe('origins that parse but concatenate wrong', () => {
    /*
     * `docker-compose.yml` builds `MEDIA_BASE_URL: ${MEDIA_ORIGIN}/media` by
     * plain string concatenation, so a trailing slash gives `//media` and a
     * path gives `/x/media` — and every uploaded image 404s on a stack whose
     * API booted fine and whose pages all render. Every other rule in the
     * checker runs on `new URL(v).origin`, which DISCARDS exactly the part
     * that breaks this, so it has to compare the raw string to its own origin.
     */
    it('rejects a trailing slash on MEDIA_ORIGIN, which every media URL inherits', () => {
      expect(check({ MEDIA_ORIGIN: 'https://media-mohamedhassan.com/' }).errors.join(' ')).toContain(
        'bare origin',
      );
    });

    it('rejects a path on APP_URL', () => {
      expect(check({ APP_URL: 'https://mohamedhassan.com/platform' }).errors.join(' ')).toContain(
        'bare origin',
      );
    });
  });

  describe('the first admin, before and after launch', () => {
    it('warns rather than fails when both are empty and no flag is given', () => {
      const { errors, warnings } = check({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' });

      expect(errors).toEqual([]);
      expect(warnings.join(' ')).toContain('--first-deploy');
    });

    it('fails on both empty when this IS the first deploy', () => {
      const { errors } = check({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }, { firstDeploy: true });

      expect(errors.join(' ')).toContain('no admin account will be created');
    });

    /*
     * `create-admin.ts`'s own two rules, mirrored. The entrypoint runs it with
     * `|| echo WARNING`, so a throw there is swallowed: the API starts, the
     * stack has NO admin account, the first sign-in answers «الإيميل أو
     * الباسورد غلط», and the only trace is one line in a boot log.
     */
    it('rejects an ADMIN_PASSWORD create-admin would refuse', () => {
      expect(check({ ADMIN_PASSWORD: 'short' }).errors.join(' ')).toContain('no admin account');
    });

    it('rejects an ADMIN_EMAIL create-admin would refuse', () => {
      expect(check({ ADMIN_EMAIL: 'not-an-email' }).errors.join(' ')).toContain('ADMIN_EMAIL');
    });

    it('fails on half a pair either way — the bootstrap would silently not run', () => {
      expect(check({ ADMIN_PASSWORD: '' }).errors.join(' ')).toContain('ADMIN_PASSWORD');
      expect(check({ ADMIN_EMAIL: '' }).errors.join(' ')).toContain('ADMIN_EMAIL');
    });
  });

  /**
   * ── The template and the gate, walked end to end ──────────────────────
   *
   * Everything above tests the checker against a fixture. This tests it
   * against `deploy/tenant.env.example` — the file the runbook tells an
   * operator to copy — which is the only place the two can drift apart, and
   * the place they DID drift apart: the sweep covered seven names while the
   * template shipped sixteen placeholders.
   */
  describe('deploy/tenant.env.example', () => {
    const TEMPLATE = join(import.meta.dirname, '..', '..', '..', 'deploy', 'tenant.env.example');
    const template = parseEnvFile(TEMPLATE) as Record<string, string>;

    /** Every placeholder in the template, and a plausible value for it. */
    const FILL: Record<string, string> = {
      TENANT_KEY: 'mohamed-hassan',
      TENANT_DISPLAY_NAME: 'منصة محمد حسن',
      POSTGRES_DB: 'mohamed_platform',
      POSTGRES_PASSWORD: FAKE.postgresPassword,
      RUNTIME_PASSWORD: FAKE.runtimePassword,
      APP_URL: 'https://mohamedhassan.com',
      MEDIA_ORIGIN: 'https://media-mohamedhassan.com',
      BETTER_AUTH_SECRET: FAKE.authSecret,
      ADMIN_NAME: 'Mohamed Hassan',
      ADMIN_EMAIL: 'admin@mohamedhassan.com',
      ADMIN_PASSWORD: FAKE.adminPassword,
      VAPID_PUBLIC_KEY: 'BPk1',
      VAPID_PRIVATE_KEY: 'vk1',
      VAPID_SUBJECT: 'mailto:admin@mohamedhassan.com',
      WA_TOKEN: FAKE.waToken,
      WA_DEVICE_NAME: 'منصة محمد حسن',
    };

    const placeholders = Object.entries(template)
      .filter(([, value]) => value.includes('CHANGE_ME'))
      .map(([name]) => name);

    /**
     * A new placeholder in the template has to be thought about here before it
     * can ship — otherwise the "a filled template deploys" case below quietly
     * stops covering it, which is exactly how eight of them slipped through.
     */
    it('has a known fill for every CHANGE_ME it ships', () => {
      expect(placeholders.sort()).toEqual(Object.keys(FILL).sort());
    });

    it('is rejected unedited, with every placeholder named', () => {
      const { errors } = checkTenantEnv(template, { firstDeploy: true }) as { errors: string[] };
      const text = errors.join('\n');

      for (const name of placeholders) {
        expect(text, `${name} ships a CHANGE_ME the gate does not reject`).toContain(
          `${name} still says CHANGE_ME`,
        );
      }
    });

    /**
     * THE REVIEWER'S EXACT WALK: copy the template, replace every CHANGE_ME as
     * the runbook says, run the gate. It said «OK — safe to deploy» and the
     * API then refused to boot, because the template carried `WA_TOKEN` with
     * no `WA_SERVICE_URL` and a `VAPID_SUBJECT` that was not a `mailto:`.
     */
    it('deploys clean once every CHANGE_ME is replaced as the runbook says', () => {
      const filled: Record<string, string> = { ...template };
      for (const [name, value] of Object.entries(FILL)) filled[name] = value;

      const { errors } = checkTenantEnv(filled, { firstDeploy: true }) as { errors: string[] };

      expect(errors).toEqual([]);
    });

    /** The `wa` sidecar's internal address, shipped rather than discovered. */
    it('ships WA_SERVICE_URL, because WA_TOKEN alone stops the API booting', () => {
      expect(template.WA_SERVICE_URL).toBe('http://wa:3400');
    });

    /**
     * Declared-and-empty, never absent: `docker-compose.yml` uses
     * `${CLARITY_PROJECT_ID-y1hu9w4lii}` with ONE dash, so a template that
     * dropped the line would hand every new tenant's visitors to Ayman.
     */
    it('declares CLARITY_PROJECT_ID with an empty value', () => {
      expect(template.CLARITY_PROJECT_ID).toBe('');
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
