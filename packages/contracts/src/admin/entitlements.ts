import { z } from '@ayman/contracts/zod';

/**
 * ما المدرّس مسموح له يشغّله على ستاكه — الكتالوج، مش القيم.
 *
 * ## ليه ده مش `admin/flags.ts` تاني
 *
 * الاتنين «بوليان لكل فيتشر»، وده كل اللي بينهم. الفرق اللي يخلّيهم ملفين:
 *
 *   · **الفلاج بتاع المدرّس.** بيتخزّن في `app.feature_flags` في قاعدته هو،
 *     وهو ماسك `flags:write`، فهو اللي بيفتحه ويقفله من `/admin/flags`.
 *   · **الـentitlement بتاع صاحب السوفتوير.** بيتخزّن في مستند موقّع في
 *     `TENANT_ENTITLEMENTS` — متغيّر بيئة على ستاك المدرّس بيقدر يقراه
 *     ومايقدرش يزوّره. لو ده كان صف في جدوله، أول حاجة يعملها إنه يفتحه.
 *
 * فمفتاح هنا ومفتاح هناك ماينفعش يتخلطوا، وعشان كده الكتالوجين منفصلين
 * والاسمين مختلفين.
 *
 * ## والليستة دي «إعلان» زي `FLAG_DECLARATIONS` بالظبط
 *
 * المستند بيحمل قيم بس. مفتاح في المستند مش هنا **يتتجاهل**، ومفتاح هنا مش
 * في المستند بيقرا `defaultForTenant`. نفس عدم التماثل اللي بيخلّي حذف
 * فيتشر آمن — بتمسح الإعلان، والقيمة اللي في المستند تبقى بايتات ميتة بدل
 * ما تبقى مفتاح مجهول.
 *
 * وده كمان اللي بيمنع اللي بيوقّع من إنه يخترع مفاتيح: نفس الانضباط اللي في
 * `permissionsForRole()` (بتفلتر من `PERMISSIONS` بدل ما تعمل concat) وفي
 * `flags.service.ts` (بترمي 404 على مفتاح مش معلن).
 */
export interface FeatureDeclaration {
  key: string;
  /** اسم قصير للشاشة — «الكتب»، «رفع الفيديو». */
  nameAr: string;
  /** جملة واحدة تقول للي بيوقّع إيه اللي هيختفي لو قفلها. */
  descriptionAr: string;
  /**
   * القيمة على ستاك **مش** بتاع أيمن لما يكون مافيش مستند.
   *
   * `false` للتلاتة اللي بيكلّفوا فلوس أو بيوصلوا لتليفون حد: الرفع بيستهلك
   * R2، والواتساب والإذاعة بيبعتوا رسايل من رقم حقيقي. الباقي `true` لأن
   * منصة من غير كتب ولا واجب ولا امتحانات مش منصة ناقصة — دي منصة فاضية،
   * والمدرّس اللي دفع هيفتح لوحته أول يوم ويلاقيها كده.
   *
   * ⚠️ ستاك أيمن مابيقراش الحقل ده خالص — كله مفتوح عنده. شوف
   * `apps/api/src/common/entitlements.ts`.
   */
  defaultForTenant: boolean;
}

export const FEATURE_DECLARATIONS = [
  {
    key: 'books',
    nameAr: 'الكتب',
    descriptionAr: 'المتجر وطلبات الكتب وشحنها، وبلوك الكتب في الصفحة الرئيسية.',
    defaultForTenant: true,
  },
  {
    key: 'homework',
    nameAr: 'الواجب',
    descriptionAr: 'واجب المحاضرة وصور الإجابات وتصحيحها.',
    defaultForTenant: true,
  },
  {
    key: 'exams',
    nameAr: 'امتحانات الشهر',
    descriptionAr: 'الامتحان الشهري المجدول ولوحة التصحيح بتاعته.',
    defaultForTenant: true,
  },
  {
    key: 'assistant',
    nameAr: 'المساعد',
    descriptionAr: 'شات الطلبة وصندوق الوارد اللي بيرد عليه.',
    defaultForTenant: true,
  },
  {
    key: 'marketing.whatsapp',
    nameAr: 'حملات الواتساب',
    descriptionAr: 'الجهاز المرتبط والحملات اللي بتتبعت منه. بيبعت من رقم حقيقي.',
    defaultForTenant: false,
  },
  {
    key: 'honorBoard',
    nameAr: 'لوحة الشرف',
    descriptionAr: 'بلوك المتفوقين في الصفحة الرئيسية وصفحة الأرشيف.',
    defaultForTenant: true,
  },
  {
    key: 'video.upload',
    nameAr: 'رفع الفيديو',
    descriptionAr: 'رفع المحاضرة مباشرة بدل رابط يوتيوب. بيتخزّن على حسابنا.',
    defaultForTenant: false,
  },
  {
    key: 'broadcast',
    nameAr: 'الإذاعة',
    descriptionAr: 'رسالة واحدة لكل الطلبة أو لشريحة منهم.',
    defaultForTenant: false,
  },
  {
    key: 'transfers',
    nameAr: 'التحويلات',
    descriptionAr: 'تحويلات إنستاباي الواردة ومطابقتها على الاشتراكات.',
    defaultForTenant: true,
  },
] as const satisfies readonly FeatureDeclaration[];

export type FeatureKey = (typeof FEATURE_DECLARATIONS)[number]['key'];

/** كل المفاتيح المعلنة، لفلترة أي حاجة جاية من بره. */
export const FEATURE_KEYS = FEATURE_DECLARATIONS.map((entry) => entry.key) as readonly FeatureKey[];

/** حالة كل فيتشر على الستاك ده، بعد ما الافتراضي والمستند اتجمعوا. */
export type Entitlements = Record<FeatureKey, boolean>;

/**
 * الجهة الوحيدة اللي توقيعها بيتقبل.
 *
 * سترنج ثابتة مش دومين، لأنها مالهاش علاقة بأي هوست: لو أيمن غيّر دومينه
 * بكرة، كل مستند وقّعه قبل كده لازم يفضل صالح. ودي كمان السبب إن الاسم ده
 * مش اسم مدرّس — `sub` هو اللي بيحمل ده.
 */
export const CONTROL_ISSUER = 'ayman-platform-control';

/**
 * نسخة الشكل بتاع البايلود، مش نسخة الكتالوج.
 *
 * بتتزوّد لما **معنى** حقل يتغيّر (مثلًا لو `features` بقت تشيل حاجة غير
 * بوليان)، مش لما مفتاح فيتشر يتضاف — إضافة مفتاح مغطّاة بالإعلانات فوق.
 * ستاك قديم بيشوف `ver` مايعرفهاش بيرفض المستند ويرجع للافتراضي، وده أأمن
 * من إنه يفسّر حقل بشكل غلط.
 */
export const ENTITLEMENTS_VERSION = 1;

/**
 * البايلود جوّه الـJWS، بعد ما التوقيع يعدّي.
 *
 * ⚠️ الترتيب مهم: `jwtVerify` هو اللي بيتحقق من التوقيع و`exp`/`nbf`/`iss`/
 * `sub`، والسكيما دي بتشتغل على اللي طلع منه. عمرها ما تتنده على توكن
 * ما اتتحققش — إنها تعدّي مابيقولش إن حد وقّعه.
 *
 * `features` بتتقرا كـ`Record<string, boolean>` مقصود: المستند ممكن يكون
 * اتوقّع من نسخة أحدث فيها مفاتيح الستاك ده مايعرفهاش، والفلترة على
 * `FEATURE_DECLARATIONS` بتحصل بعدين. لو اتعملها `z.enum` هنا، مفتاح واحد
 * جديد كان هيرمي المستند كله ويقفل فيتشرز شغالة.
 */
export const EntitlementsDocumentSchema = z.object({
  iss: z.literal(CONTROL_ISSUER),
  sub: z.string().min(1),
  ver: z.literal(ENTITLEMENTS_VERSION),
  iat: z.number().int(),
  nbf: z.number().int(),
  exp: z.number().int(),
  features: z.record(z.string(), z.boolean()),
});

export type EntitlementsDocument = z.infer<typeof EntitlementsDocumentSchema>;

/** رد `GET /api/entitlements` — الماب وبس، زي ما الويب بيقراها. */
export const EntitlementsResponseSchema = z.object({
  features: z.record(z.string(), z.boolean()),
});

export type EntitlementsResponse = z.infer<typeof EntitlementsResponseSchema>;

/**
 * الافتراضي لستاك مدرّس: اللي معلن `defaultForTenant` بتاعه، من غير أي مستند.
 *
 * ده اللي بيترجع لما المستند ناقص أو غلط أو منتهي — **مش** «كله مقفول».
 * منصة بتتقفل كلها عشان توكن انتهى مش عزل، دي عطل؛ والمدرّس اللي بيدفع
 * مش هيفهم إن اللي حصل ده قرار.
 */
export function tenantDefaults(): Entitlements {
  const out = {} as Entitlements;
  for (const declaration of FEATURE_DECLARATIONS) out[declaration.key] = declaration.defaultForTenant;
  return out;
}

/**
 * الافتراضي، وفوقه اللي المستند قاله بالنص — فتح أو قفل.
 *
 * ## ليه ده مش additive زي `runtimeGrants`
 *
 * اتكتب additive أول مرة، والحجة كانت مستعارة من `auth/permissions.ts`:
 * مافيش آلية تشيل من الـbaseline. بس الاتنين مش نفس السؤال. الـgrant بيوسّع
 * عقد رول، فسحب صلاحية منه بيبان كمنصة بايظة. وده عقد **بيع**: صاحب
 * السوفتوير بيقرر مين بيشغّل إيه، و«صبري مايعرضش كتب» طلب حقيقي مالوش أي
 * شكل تاني في منظومة بتفتح بس.
 *
 * والشكل الـadditive مكانش بيعمله: `books` افتراضيه `true`، فأي `false` في
 * مستنده كانت بتتتجاهل. الطريقة الوحيدة لقفلها كانت تغيير الإعلان فوق —
 * يعني تقفل الكتب على **كل** مدرّس وتفتحها لكل واحد بمستند، وساعتها أول
 * توكن ينتهي بيطفّي كتب مدرّس دافع. الخطر اللي الـadditive اتعمل عشانه
 * بيرجع من الباب ده بالظبط.
 *
 * ## واللي فضل زي ما هو، وهو اللي بيمنع الكارثة
 *
 * القفل بيجي من مستند **اتتحقّق منه**، وبس. مستند ناقص أو منتهي أو توقيعه
 * غلط مابيقفلش حاجة: المتصل بيرجع لـ`tenantDefaults()`. فمافيش أي مسار فشل
 * بيضيّق المنصة — أوسع حاجة ممكن تحصل إنها ترجع للافتراضي المعلن.
 *
 * ومفتاح مش في `FEATURE_DECLARATIONS` بيتتجاهل، ومفتاح ناقص من المستند بياخد
 * افتراضيه. فاللي ماسك مفتاح التوقيع مايقدرش يخترع فيتشر مالهاش كود، ومستند
 * اتوقّع قبل ما مفتاح جديد يتضاف مابيقفلش المفتاح ده بالسكوت.
 */
export function applyEntitlements(features: Readonly<Record<string, boolean>>): Entitlements {
  const out = tenantDefaults();
  for (const declaration of FEATURE_DECLARATIONS) {
    const stated = features[declaration.key];
    // `typeof` مش `!== undefined`: البايلود JSON جاي من بره، و`null` جوّه
    // `features` لازم تتقرا «ماقالش حاجة» مش «قفلها».
    if (typeof stated === 'boolean') out[declaration.key] = stated;
  }
  return out;
}

/** كله مفتوح — ستاك أيمن، وبالحرف زي ما المنصة شغالة النهاردة. */
export function allEnabled(): Entitlements {
  const out = {} as Entitlements;
  for (const declaration of FEATURE_DECLARATIONS) out[declaration.key] = true;
  return out;
}
