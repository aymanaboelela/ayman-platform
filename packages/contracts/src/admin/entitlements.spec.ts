import { describe, expect, it } from 'vitest';
import {
  CONTROL_ISSUER,
  ENTITLEMENTS_VERSION,
  EntitlementsDocumentSchema,
  FEATURE_DECLARATIONS,
  FEATURE_KEYS,
  allEnabled,
  applyEntitlements,
  tenantDefaults,
} from './entitlements';

function document(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: CONTROL_ISSUER,
    sub: 'mohamed-sabry',
    ver: ENTITLEMENTS_VERSION,
    iat: now,
    nbf: now,
    exp: now + 3600,
    features: { 'video.upload': true },
    ...overrides,
  };
}

describe('the feature catalogue', () => {
  it('declares each key exactly once', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  /**
   * الافتراضي مش «كله مقفول».
   *
   * ستاك مدرّس جديد بيقوم من غير مستند — دي الحالة العادية في أول يوم، مش
   * حالة عطل. ولو الافتراضي كان كله مقفول، المدرّس اللي دفع كان هيفتح لوحته
   * ويلاقيها فاضية، وهو ده اللي هيتقري كباج مش كقرار.
   *
   * المقفول بس هو اللي بيكلّف فلوس (تخزين الفيديو) أو بيبعت من رقم حقيقي
   * (الواتساب والإذاعة) — دول محتاجين قرار صريح من صاحب السوفتوير.
   */
  it('closes only what costs money or sends from a real number', () => {
    const closed = FEATURE_DECLARATIONS.filter((entry) => !entry.defaultForTenant).map((e) => e.key);

    expect(closed).toEqual(['marketing.whatsapp', 'video.upload', 'broadcast']);
  });

  it('gives every key an Arabic name and description for the control screen', () => {
    for (const declaration of FEATURE_DECLARATIONS) {
      expect(declaration.nameAr.trim()).not.toBe('');
      expect(declaration.descriptionAr.trim()).not.toBe('');
    }
  });

  it('opens everything on the owner stack', () => {
    expect(Object.values(allEnabled()).every(Boolean)).toBe(true);
    expect(Object.keys(allEnabled()).sort()).toEqual([...FEATURE_KEYS].sort());
  });
});

describe('applyEntitlements', () => {
  it('opens what the document opens', () => {
    expect(applyEntitlements({ 'video.upload': true })['video.upload']).toBe(true);
  });

  /**
   * ⚠️ التست ده هو الفيتشر نفسها.
   *
   * «صبري مايعرضش كتب» هو السبب اللي الشغل ده اتعمل عشانه، و`books`
   * افتراضيها `true`. فلو `false` في مستند اتتحقّق منه مالهاش أثر، مافيش أي
   * طريقة تقفلها لمدرّس واحد غير إنك تقفلها على التلاتة في الكود.
   */
  it('closes what the document closes, even a default-open feature', () => {
    const applied = applyEntitlements({ books: false, homework: false, exams: false });

    expect(applied.books).toBe(false);
    expect(applied.homework).toBe(false);
    expect(applied.exams).toBe(false);
    // واللي المستند ماتكلّمش عنه بياخد افتراضيه، مش `false`.
    expect(applied.assistant).toBe(true);
  });

  /**
   * ⚠️ والاتجاه اللي لازم يفضل مستحيل: القفل بييجي من قيمة بوليان صريحة
   * وبس.
   *
   * `null` من JSON، أو مفتاح ناقص، أو سترنج — التلاتة «ماقالش حاجة» مش
   * «قفلها». ده اللي بيخلّي كل مسار عطل في المتصلين يسقط على
   * `tenantDefaults()`: العطل بيوسّع المنصة مابيضيّقهاش، ومنصة مدرّس دافع
   * بتتقفل عشان حقل جه `null` هي العطل الوحيد اللي مالوش عذر.
   */
  it('reads a non-boolean as «said nothing», never as «closed»', () => {
    const applied = applyEntitlements({
      books: null,
      homework: undefined,
      exams: 'false',
    } as unknown as Record<string, boolean>);

    expect(applied.books).toBe(true);
    expect(applied.homework).toBe(true);
    expect(applied.exams).toBe(true);
  });

  /**
   * اللي ماسك مفتاح التوقيع مايقدرش يخترع فيتشر.
   *
   * نفس الانضباط بتاع `permissionsForRole()` (بتفلتر من `PERMISSIONS` بدل ما
   * تعمل concat) و`flags.service.ts:67` (بترمي 404 على مفتاح مش معلن).
   */
  it('ignores a key that no declaration carries', () => {
    const applied = applyEntitlements({ 'billing.refunds': true, 'video.upload': true });

    expect(Object.keys(applied).sort()).toEqual([...FEATURE_KEYS].sort());
    expect('billing.refunds' in applied).toBe(false);
  });

  it('returns the declared defaults for an empty document', () => {
    expect(applyEntitlements({})).toEqual(tenantDefaults());
  });
});

describe('EntitlementsDocumentSchema', () => {
  it('accepts a well-formed payload', () => {
    expect(EntitlementsDocumentSchema.safeParse(document()).success).toBe(true);
  });

  it('rejects another issuer', () => {
    expect(EntitlementsDocumentSchema.safeParse(document({ iss: 'somebody-else' })).success).toBe(
      false,
    );
  });

  /**
   * ستاك قديم شايف نسخة مايعرفهاش بيرفض المستند ويرجع للافتراضي — أأمن من
   * إنه يفسّر حقل بشكل غلط وهو فاكر إنه فاهمه.
   */
  it('rejects a version it does not understand', () => {
    expect(EntitlementsDocumentSchema.safeParse(document({ ver: 2 })).success).toBe(false);
  });

  it('rejects a non-boolean feature value', () => {
    const parsed = EntitlementsDocumentSchema.safeParse(
      document({ features: { 'video.upload': 'yes' } }),
    );

    expect(parsed.success).toBe(false);
  });

  /**
   * ⚠️ مفاتيح مش في الكتالوج بتعدّي السكيما عن قصد.
   *
   * المستند ممكن يكون اتوقّع من نسخة أحدث فيها مفاتيح الستاك ده مايعرفهاش.
   * لو السكيما رفضته، مفتاح واحد جديد كان هيرمي المستند كله ويقفل فيتشرز
   * شغّالة. الفلترة بتحصل في `applyEntitlements` فوق، اللي بيتجاهل الزيادة
   * بدل ما يرفض الكل.
   */
  it('accepts unknown feature keys, and leaves the filtering to applyEntitlements', () => {
    const payload = document({ features: { 'billing.refunds': true } });

    expect(EntitlementsDocumentSchema.safeParse(payload).success).toBe(true);
    expect(applyEntitlements({ 'billing.refunds': true })).toEqual(tenantDefaults());
  });
});
