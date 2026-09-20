import { generateKeyPairSync, sign as nodeSign } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { SignJWT, UnsecuredJWT, exportSPKI, generateKeyPair, importSPKI } from 'jose';
import {
  CONTROL_ISSUER,
  ENTITLEMENTS_VERSION,
  applyEntitlements,
  tenantDefaults,
} from '@ayman/contracts/admin/entitlements';
import { CONTROL_PUBLIC_KEYS, verifyEntitlementsDocument } from './entitlements';

/**
 * كل حالة هنا بتسأل سؤالين مع بعض، ومن غير التاني الأول مالوش قيمة:
 *
 *   ١. المستند الغلط ده اترفض؟
 *   ٢. **والمنصة فضلت شغّالة؟**
 *
 * لأن الفشل اللي بيأذي هنا مش «مستند مزوّر عدّى» — ده مقفول بالتوقيع. الفشل
 * هو إن مستند انتهت صلاحيته يخلّي الحاوية ما تقومش، وساعتها Traefik بيرد 404
 * على الدومين كله (CLAUDE.md §٦) — يعني متغيّر شغلته يخفي زرار قفل منصة
 * مدرّس بالكامل. فكل تست بيتأكد إن `loadEntitlements` **ما رمتش** وإن الماب
 * رجعت للافتراضي المعلن.
 *
 * التوقيع في التستات دي بمفتاح متولّد في الرن، مش بالمفتاح الحقيقي: المفتاح
 * الخاص مش في الريبو ولا المفروض يدخله. عشان كده `verifyEntitlementsDocument`
 * بتاخد الـkeyring كـparameter — التست بيمرّر مفتاحه، والإنتاج بيمرّر
 * `CONTROL_PUBLIC_KEYS`.
 */

const TENANT = 'mohamed-sabry';
const KID = 'cp-test';

let privateKey: CryptoKey;
let keys: Record<string, string>;

/** لوجر ساكت — التستات دي بتولّد `logger.error` عن قصد. */
function silentLogger(): Logger {
  const logger = new Logger('entitlements-spec');
  jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'log').mockImplementation(() => undefined);
  return logger;
}

async function sign(
  payload: Record<string, unknown>,
  options: { kid?: string; expiresIn?: string; notBefore?: string } = {},
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid: options.kid ?? KID })
    .setIssuedAt()
    .setNotBefore(options.notBefore ?? '0s')
    .setExpirationTime(options.expiresIn ?? '30d')
    .sign(privateKey);
}

/** المستند السليم: بيفتح رفع الفيديو، وبيقفل الكتب. */
function goodPayload(): Record<string, unknown> {
  return {
    iss: CONTROL_ISSUER,
    sub: TENANT,
    ver: ENTITLEMENTS_VERSION,
    features: { 'video.upload': true, books: false },
  };
}

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  privateKey = pair.privateKey;
  keys = { [KID]: await exportSPKI(pair.publicKey) };
});

describe('CONTROL_PUBLIC_KEYS', () => {
  /**
   * المفتاح العام الحقيقي بيتكمپايل في الصورة، فغلطة نسخ فيه مابتبانش غير
   * على ستاك مدرّس: كل مستند بيترفض، كل فيتشر بترجع للافتراضي، والسطر في
   * اللوج بيقول «توقيع غلط» — واللي هيقراه هيدوّر في المستند مش في المفتاح.
   */
  it('carries at least one kid, and every value is a usable Ed25519 key', async () => {
    const entries = Object.entries(CONTROL_PUBLIC_KEYS);
    expect(entries.length).toBeGreaterThan(0);

    for (const [kid, pem] of entries) {
      expect(kid).toMatch(/^[a-z0-9-]+$/);
      await expect(importSPKI(pem, 'EdDSA')).resolves.toBeDefined();
    }
  });
});

describe('verifyEntitlementsDocument', () => {
  it('accepts a document signed for this stack', async () => {
    const document = await verifyEntitlementsDocument(await sign(goodPayload()), {
      keys,
      tenantKey: TENANT,
    });

    expect(document.sub).toBe(TENANT);
    expect(document.features).toEqual({ 'video.upload': true, books: false });
  });

  it('rejects a payload spliced onto a real signature', async () => {
    /*
     * التزويرة الوحيدة اللي حد هيجرّبها فعلًا: خد توكن حقيقي، سيب الهيدر
     * والتوقيع زي ما هما، وبدّل البايلود بواحد بيفتح كل حاجة. الاتنين
     * اتوقّعوا بنفس المفتاح، فالمشكلة مش في المفتاح — التوقيع على البايتات.
     *
     * ⚠️ وقلب آخر حرف في التوقيع **مش** تست: توقيع Ed25519 ٦٤ بايت = ٥١٢
     * بت، و٨٦ حرف base64url = ٥١٦ بت، فآخر حرف فيه ٤ بت مالهمش لازمة وفيه
     * حروف كتير بتفك لنفس البايتات. جرّبنا كده والتوكن عدّى.
     */
    const honest = await sign(goodPayload());
    const greedy = await sign({
      ...goodPayload(),
      features: { 'video.upload': true, broadcast: true, 'marketing.whatsapp': true },
    });
    const forged = `${honest.split('.')[0]}.${greedy.split('.')[1]}.${honest.split('.')[2]}`;

    await expect(verifyEntitlementsDocument(forged, { keys, tenantKey: TENANT })).rejects.toThrow();
  });

  it('rejects a document issued for a DIFFERENT instructor', async () => {
    // توقيع سليم تمامًا، ولسه صالح — الغلط الوحيد إنه بتاع حد تاني. ودي
    // أكتر غلطة متوقعة: لزق توكن من التاب الغلط في لوحة Dokploy.
    const token = await sign({ ...goodPayload(), sub: 'mr-mohammedadel' });

    await expect(verifyEntitlementsDocument(token, { keys, tenantKey: TENANT })).rejects.toThrow();
  });

  it('rejects an UNSIGNED document (alg: none)', async () => {
    // أقدم تزويرة في JWT: شيل التوقيع وقول للمتحقّق إن مافيش خوارزمية.
    // `algorithms: ['EdDSA']` هي اللي بترفضها، مش أي فحص إضافي.
    const token = new UnsecuredJWT(goodPayload()).setIssuedAt().encode();

    await expect(verifyEntitlementsDocument(token, { keys, tenantKey: TENANT })).rejects.toThrow();
  });

  it('rejects an expired document', async () => {
    const token = await new SignJWT(goodPayload())
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      // ساعة فاتت — أبعد بكتير من `clockTolerance` بتاع الستين ثانية، عشان
      // التست ده يقيس الانتهاء مش السماحية.
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    await expect(verifyEntitlementsDocument(token, { keys, tenantKey: TENANT })).rejects.toThrow();
  });

  it('rejects a document signed with a key this stack does not know', async () => {
    // تدوير المفتاح هو السبب إن `kid` موجود أصلًا؛ ده الاتجاه التاني منه —
    // مدرّس ولّد مفتاحه ووقّع لنفسه.
    const other = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const token = await new SignJWT(goodPayload())
      .setProtectedHeader({ alg: 'EdDSA', kid: 'not-ours' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(other.privateKey);

    await expect(verifyEntitlementsDocument(token, { keys, tenantKey: TENANT })).rejects.toThrow(
      /unknown signing key/,
    );
  });

  it('rejects a document from another issuer', async () => {
    const token = await sign({ ...goodPayload(), iss: 'somebody-else' });

    await expect(verifyEntitlementsDocument(token, { keys, tenantKey: TENANT })).rejects.toThrow();
  });

  /**
   * التوقيع هو اللي بيخلّي القفل قرار.
   *
   * `books` افتراضيها مفتوحة، والمستند ده بيقفلها — وده اللي الشاشة اتعملت
   * عشانه. والحاجة اللي بتخلّي ده آمن هي الترتيب: القيمة دي ماتتقريش غير
   * بعد ما `verifyEntitlementsDocument` تعدّي. مستند ماعداش، مايقفلش.
   */
  it('applies a verified document, opening and closing what it states', async () => {
    const document = await verifyEntitlementsDocument(await sign(goodPayload()), {
      keys,
      tenantKey: TENANT,
    });

    const applied = applyEntitlements(document.features);

    expect(applied['video.upload']).toBe(true);
    expect(applied.books).toBe(false);
    // ماتكلّمش عنها، فأخدت افتراضيها المقفول.
    expect(applied.broadcast).toBe(false);
    // ولا عنها، فأخدت افتراضيها المفتوح.
    expect(applied.homework).toBe(true);
  });

  /**
   * ⚠️ والاتجاه العكسي، وهو اللي بيأذي فعلًا: نفس البايلود اللي بيقفل
   * الكتب، بس متوقّع بـHS256 **بالمفتاح العام نفسه**.
   *
   * دي تانية أقدم تزويرة في JWT بعد `alg: none`: المفتاح العام منشور في
   * `CONTROL_PUBLIC_KEYS` وفي صورة كل ستاك، فأي متحقّق بيسيب الخوارزمية
   * للتوكن يختارها بيقبل توقيع HMAC اتعمل بيه. `algorithms: ['EdDSA']` هي
   * اللي بترفضه — والتست ده بيقيس الأثر مش وجود السطر.
   */
  /**
   * ⚠️ التست الوحيد اللي بيربط النصين: الموقّع في الويب والمتحقّق هنا.
   *
   * `apps/web/lib/control-plane.ts` **مابيستخدمش jose** — `jose` تبعية
   * `apps/api` وبس، فالشاشة بتبني الـcompact JWS بإيدها بـ`node:crypto`:
   * `b64url(header).b64url(payload)` وبعدين `sign(null, …)`، اللي بترجّع
   * توقيع Ed25519 خام ٦٤ بايت.
   *
   * الافتراض ده هو اللي المنظومة كلها قايمة عليه، ومكانش عليه تست: لو
   * غلط، كل توكن أيمن يوقّعه بيترفض على كل ستاك، والسطر اللي في اللوج
   * بيقول «توقيع غلط» — واللي هيقراه هيدوّر في المفتاح مش في الصيغة. وبما
   * إن الفشل بيرجع للافتراضي في صمت، مافيش حاجة تانية خالص بتبان.
   *
   * التست بيبني التوكن بنفس الأربع سطور، وبيمرّره على `jwtVerify` الحقيقي.
   */
  it('verifies a token built the way the signing screen builds one', async () => {
    const pair = generateKeyPairSync('ed25519');
    const spki = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const b64url = (value: string | Buffer) => Buffer.from(value as never).toString('base64url');

    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'EdDSA', kid: 'cp-web' }));
    const body = b64url(
      JSON.stringify({
        iss: CONTROL_ISSUER,
        sub: TENANT,
        ver: ENTITLEMENTS_VERSION,
        iat: now,
        nbf: now,
        exp: now + 3600,
        features: { books: false, 'video.upload': true },
      }),
    );
    // `null` كـdigest: Ed25519 بيعمل الهاش جوّاه، والصيغة دي بالظبط هي اللي
    // في `control-plane.ts`.
    const signature = nodeSign(null, Buffer.from(`${head}.${body}`, 'utf8'), pair.privateKey);

    const document = await verifyEntitlementsDocument(`${head}.${body}.${b64url(signature)}`, {
      keys: { 'cp-web': spki },
      tenantKey: TENANT,
    });

    expect(applyEntitlements(document.features).books).toBe(false);
    expect(applyEntitlements(document.features)['video.upload']).toBe(true);
  });

  it('rejects an HS256 token signed with the PUBLIC key', async () => {
    const pem = keys[KID]!;
    const token = await new SignJWT(goodPayload())
      .setProtectedHeader({ alg: 'HS256', kid: KID })
      .setIssuedAt()
      .setExpirationTime('30d')
      // نفس البايتات اللي أي حد يقدر يقراها من الريبو.
      .sign(new TextEncoder().encode(pem));

    await expect(verifyEntitlementsDocument(token, { keys, tenantKey: TENANT })).rejects.toThrow();
  });
});

/**
 * الطبقة اللي فوقها: `loadEntitlements` + `isFeatureEnabled`.
 *
 * كل حالة بتعيد استيراد المودیول، لأن `TENANT_KEY` و`IS_AYMAN` بيتقروا وقت
 * الـimport في `common/tenant.ts` — بالظبط عشان `next build` و`nest build`
 * بيقروا البيئة مرة واحدة. فتغيير `process.env` من غير إعادة استيراد
 * مابيوصلش.
 */
describe('loadEntitlements', () => {
  type EntitlementsModule = typeof import('./entitlements');

  const ORIGINAL = { key: process.env.TENANT_KEY, token: process.env.TENANT_ENTITLEMENTS };

  afterEach(() => {
    process.env.TENANT_KEY = ORIGINAL.key;
    process.env.TENANT_ENTITLEMENTS = ORIGINAL.token;
    jest.restoreAllMocks();
  });

  // نفس شكل `seed-data/tenant-contact.spec.ts` بالحرف: `resetModules` وبعدين
  // `import` ديناميكي. استيراد جديد هو الطريقة الوحيدة لأن الحالة محسوبة وقت
  // الـimport.
  async function freshModule(env: {
    TENANT_KEY?: string;
    TENANT_ENTITLEMENTS?: string;
  }): Promise<EntitlementsModule> {
    if (env.TENANT_KEY === undefined) delete process.env.TENANT_KEY;
    else process.env.TENANT_KEY = env.TENANT_KEY;
    if (env.TENANT_ENTITLEMENTS === undefined) delete process.env.TENANT_ENTITLEMENTS;
    else process.env.TENANT_ENTITLEMENTS = env.TENANT_ENTITLEMENTS;

    jest.resetModules();
    return import('./entitlements');
  }

  /**
   * ⚠️ مافيش تست هنا بيعدّي مستند سليم آخر الآخر، ومقصود.
   *
   * `loadEntitlements` بتتحقّق بـ`CONTROL_PUBLIC_KEYS` — المفتاح العام
   * الحقيقي — ومافيش مفتاح خاص يوقّع بيه في الريبو ولا المفروض يبقى فيه.
   * فالمسار السليم متغطّى فوق في `verifyEntitlementsDocument`، واللي هنا
   * هو السلوك اللي الستاك بيقع عليه لما حاجة تبوظ.
   *
   * التست ده تحديدًا هو الاتجاه اللي المدرّس ممكن يجرّبه: يولّد مفتاح،
   * يوقّع لنفسه مستند بيفتح كل حاجة، ويلزقه في لوحته.
   */
  it('changes nothing for a document signed by a key this stack does not carry', async () => {
    const token = await sign({
      ...goodPayload(),
      features: { 'video.upload': true, broadcast: true },
    });
    const mod = await freshModule({ TENANT_KEY: TENANT, TENANT_ENTITLEMENTS: token });
    const logger = silentLogger();

    await expect(mod.loadEntitlements(logger)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(mod.currentEntitlements()).toEqual(tenantDefaults());
    expect(mod.isFeatureEnabled('video.upload')).toBe(false);
  });

  it('falls back to the declared defaults when no document is set', async () => {
    const mod = await freshModule({ TENANT_KEY: TENANT, TENANT_ENTITLEMENTS: undefined });

    await expect(mod.loadEntitlements(silentLogger())).resolves.toBeUndefined();
    expect(mod.currentEntitlements()).toEqual(tenantDefaults());
    // الافتراضي مش «كله مقفول»: منصة من غير كتب ولا واجب مش منصة ناقصة،
    // دي منصة فاضية.
    expect(mod.isFeatureEnabled('books')).toBe(true);
    expect(mod.isFeatureEnabled('video.upload')).toBe(false);
  });

  it('logs and keeps running when the document is garbage', async () => {
    const mod = await freshModule({ TENANT_KEY: TENANT, TENANT_ENTITLEMENTS: 'not-a-jws-at-all' });
    const logger = silentLogger();

    await expect(mod.loadEntitlements(logger)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(mod.currentEntitlements()).toEqual(tenantDefaults());
  });

  it('logs and keeps running when the document expired', async () => {
    const token = await new SignJWT(goodPayload())
      .setProtectedHeader({ alg: 'EdDSA', kid: KID })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    const mod = await freshModule({ TENANT_KEY: TENANT, TENANT_ENTITLEMENTS: token });
    const logger = silentLogger();

    await expect(mod.loadEntitlements(logger)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(mod.currentEntitlements()).toEqual(tenantDefaults());
  });

  it('opens everything on the owner stack and ignores the document', async () => {
    const mod = await freshModule({ TENANT_KEY: undefined, TENANT_ENTITLEMENTS: undefined });

    await mod.loadEntitlements(silentLogger());

    // الشرط اللي الشغل ده كله ماشي تحته: لوحته ما تتغيرش ولا بايت.
    expect(Object.values(mod.currentEntitlements()).every(Boolean)).toBe(true);
    expect(mod.isFeatureEnabled('video.upload')).toBe(true);
  });

  /**
   * الحالة الوحيدة اللي الافتراضي فيها fail-OPEN، ومكتوبة هنا عشان تفضل
   * مقروءة: `common/tenant.ts:28` بيسقط `TENANT_KEY` غير المضبوط على
   * `'ayman'`. يعني ستاك مدرّس نسي المتغيّر بيبقى نسخة شغّالة من ستاك أيمن،
   * بكل الفيتشرز مفتوحة. وجود مستند مع `IS_AYMAN` هو الدليل الوحيد المتاح
   * على ده، فبيتكتب `logger.error`.
   */
  it('shouts when a document arrives on a stack that thinks it is the owner', async () => {
    const token = await sign(goodPayload());
    const mod = await freshModule({ TENANT_KEY: undefined, TENANT_ENTITLEMENTS: token });
    const logger = silentLogger();

    await mod.loadEntitlements(logger);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String((logger.error as jest.Mock).mock.calls[0][0])).toContain('TENANT_KEY is missing');
    expect(mod.isFeatureEnabled('video.upload')).toBe(true);
  });

  it('verifies once, however many times it is called', async () => {
    const mod = await freshModule({ TENANT_KEY: TENANT, TENANT_ENTITLEMENTS: 'not-a-jws-at-all' });
    const logger = silentLogger();

    // `main.ts` بينده عليها و`TenantEntitlementsModule.onModuleInit` كمان.
    // لو مابقتش إدمپوتنت، ده كان هيبقى تحقّقين وسطرين لوج على كل إقلاع.
    await Promise.all([mod.loadEntitlements(logger), mod.loadEntitlements(logger)]);
    await mod.loadEntitlements(logger);

    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
