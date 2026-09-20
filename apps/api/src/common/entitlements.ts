import { Logger } from '@nestjs/common';
import { importSPKI, jwtVerify, type JWTPayload } from 'jose';
import {
  CONTROL_ISSUER,
  EntitlementsDocumentSchema,
  allEnabled,
  applyEntitlements,
  tenantDefaults,
  type Entitlements,
  type EntitlementsDocument,
  type FeatureKey,
} from '@ayman/contracts/admin/entitlements';
import { IS_AYMAN, TENANT_KEY } from './tenant';

/**
 * إيه الفيتشرز اللي الستاك ده مسموح له يشغّلها — التحقّق المحلي من مستند
 * صاحب السوفتوير.
 *
 * ## ليه مستند موقّع ومش نداء على ستاك أيمن
 *
 * العزل في المنصة دي مبني على إن **مافيش** connection string ولا نداء شبكة
 * بيربط ستاك بستاك (CLAUDE.md §٢). نداء `GET https://aymanaboelela.com/…`
 * من ستاك مدرّس كان هيكسر ده حرفيًا، وكان هيضيف حاجة أسوأ: يوم ما ستاك أيمن
 * يقع، كل منصات المدرّسين تقع معاه — وهم دافعين.
 *
 * فالمستند بيتحط في متغيّر بيئة على ستاك المدرّس نفسه، والتحقّق بيحصل هنا
 * بمفتاح عام مكمپايل في الصورة. مافيش نداء، مافيش تبعية، ووقوع أيمن مالوش
 * أي أثر على حد.
 *
 * ## ليه مش جدول في قاعدة المدرّس
 *
 * لأنه ماسك `flags:write` على قاعدته. أي صف بيقول «الفيتشر دي مقفولة» هو
 * اللي يقدر يعدّله. المستند موقّع بمفتاح مش عنده، فأقصى حاجة يعملها إنه
 * يمسحه — واللي بيحصل ساعتها هو الافتراضي، مش «كله مفتوح».
 *
 * ## بيفتح وبيقفل — بس **مستند اتتحقّق منه** هو اللي بيقفل
 *
 * `applyEntitlements` في الكونتراكتس بتشرح الفرق بينه وبين `runtimeGrants`.
 * اللي يهم هنا إن كل مسار فشل تحت بيرجع `tenantDefaults()`، يعني مافيش
 * غلطة — ولا توقيع بايظ، ولا توكن منتهي، ولا متغيّر ناقص — بتقدر تقفل فيتشر.
 * القفل قرار موقّع، والعطل بيوسّع مش بيضيّق.
 *
 * ## ومايوقّفش المنصة، مهما كان
 *
 * مستند ناقص، أو توقيعه غلط، أو `sub` بتاعه مدرّس تاني، أو منتهي، أو أصلًا
 * مش JWS — كلهم بيخلّوا الستاك يرجع للافتراضي وبيكتبوا `logger.error`.
 * ولا واحد فيهم بيرمي. السبب مكتوب في `permission-grants.service.ts:54` وفي
 * `env.ts:38`: حاوية API ماقامتش معناها Traefik بيرد 404 على **الدومين كله**،
 * فمتغيّر بيظبط فيتشرز مايقدرش يبقى سبب إن المنصة كلها تقع.
 */

/**
 * المفاتيح العامة اللي توقيعها بيتقبل، مفهرسة بـ`kid`.
 *
 * ## ليه في الكود ومش في متغيّر بيئة
 *
 * لأن المتغيّر ده هيبقى في لوحة Dokploy بتاعة المدرّس — يعني هو يقدر يبدّله
 * بمفتاحه هو ويوقّع لنفسه مستند بيفتح كل حاجة. مفتاح مكمپايل في الصورة
 * بيخلّي التزوير محتاج PR على الريبو.
 *
 * والثمن مقبول: تدوير المفتاح بقى deploy مش تغيير إعداد. وعشان كده الخريطة
 * دي بـ`kid` من الأول — مفتاح جديد بيتضاف جنب القديم، المستندات القديمة
 * تفضل صالحة لحد ما تنتهي، وبعدين القديم يتشال.
 *
 * ⚠️ **المفتاح الخاص مش في الريبو ولا المفروض يدخله.** بيقعد على ستاك صاحب
 * السوفتوير لوحده في `CONTROL_PLANE_PRIVATE_KEY` — الاسم ده بالحرف، وهو
 * اللي `apps/web/lib/control-plane.ts` بيقراه و`scripts/check-tenant-env.mjs`
 * بيرفض أي ملف بيئة مدرّس فيه.
 */
export const CONTROL_PUBLIC_KEYS: Readonly<Record<string, string>> = {
  'cp-2026-01':
    '-----BEGIN PUBLIC KEY-----\n' +
    'MCowBQYDK2VwAyEA8Sn6D1qDVcLFvMqHFZStwF/qqf5t1qjqQ46AJnLO6Lk=\n' +
    '-----END PUBLIC KEY-----\n',
};

/**
 * ثانية واحدة فرق في ساعة السيرفر مايصحّش تبوّظ مستند لسه متوقّع دلوقتي.
 * ستين ثانية هي نفس السماحية اللي Better Auth بيشتغل بيها، وهي أقل بكتير من
 * أقصر مدة صلاحية معقولة لمستند زي ده.
 */
const CLOCK_TOLERANCE_SECONDS = 60;

/**
 * يتحقّق من التوقيع ومن كل ادعاء في المستند، ويرمي لو أي حاجة فيهم غلط.
 *
 * دالة نقية: المفاتيح ومفتاح الستاك بيتمرّروا، فالتستات تقدر توقّع بمفتاح
 * مؤقّت من غير ما تلمس `CONTROL_PUBLIC_KEYS` ومن غير setter على مستوى
 * المودیول — والـsetter ده كان هيبقى هو نفسه الباب اللي الكلام فوق بيقفله.
 *
 * `algorithms: ['EdDSA']` مقفولة على خوارزمية واحدة عن قصد، وهي اللي بترفض
 * `alg: 'none'` وبترفض توكن HMAC متوقّع بالمفتاح العام نفسه — أقدم تزويرتين
 * في JWT، والاتنين بيعدّوا على أي تحقّق بيسيب الخوارزمية للتوكن يختارها.
 *
 * `subject: tenantKey` هو اللي بيمنع إعادة استخدام مستند: توكن اتوقّع لصبري
 * لو اتلزق على ستاك عادل بيترفض، حتى لو توقيعه سليم ولسه صالح.
 */
export async function verifyEntitlementsDocument(
  token: string,
  options: { keys: Readonly<Record<string, string>>; tenantKey: string },
): Promise<EntitlementsDocument> {
  const { payload } = await jwtVerify(
    token,
    async (header) => {
      const kid = header.kid;
      if (kid === undefined) throw new Error('entitlements document has no kid');
      const pem = options.keys[kid];
      if (pem === undefined) throw new Error(`unknown signing key: ${kid}`);
      return importSPKI(pem, 'EdDSA');
    },
    {
      algorithms: ['EdDSA'],
      issuer: CONTROL_ISSUER,
      subject: options.tenantKey,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    },
  );

  // بعد التوقيع، مش قبله: السكيما بتتأكد إن الشكل هو اللي إحنا فاهمينه
  // (`ver` صح، `features` بوليانات)، وهي حاجة تانية خالص عن «مين وقّع ده».
  return EntitlementsDocumentSchema.parse(payload as JWTPayload);
}

/**
 * الحالة الحالية، محسوبة مرة واحدة ومقروءة sync بعد كده.
 *
 * ⚠️ **الـsync ده مش رفاهية.** `isFeatureEnabled` هيتنده منها من مسارات
 * بتشتغل على كل ريكويست، بالظبط زي `roleHasPermission` (`permissions.ts:487`)
 * اللي `AuthGuard` بينده عليها في كل نداء. `await jwtVerify` في المسار ده
 * معناه عملية تشفير قدّام كل طلب. فالتحقّق بيحصل مرة عند الإقلاع، والنتيجة
 * بتقعد في المودیول — نفس شكل `runtimeGrants` بالضبط.
 *
 * والقيمة الابتدائية هنا هي الافتراضي: لو حد قرا قبل ما `loadEntitlements`
 * تخلص، بيلاقي الافتراضي مش `undefined`.
 */
let current: Entitlements = IS_AYMAN ? allEnabled() : tenantDefaults();

/** بروميس واحدة مهما اتندهت `loadEntitlements` كام مرة. */
let loading: Promise<void> | null = null;

async function resolveEntitlements(logger: Logger): Promise<void> {
  // نفس نمط `optionalSecret` في `config/env.ts`: كومبوز بيحوّل المتغيّر
  // غير المضبوط لسترنج فاضية، ومافيش فرق بين «فاضي» و«مش موجود» هنا.
  const token = (process.env.TENANT_ENTITLEMENTS ?? '').trim();

  if (IS_AYMAN) {
    /*
     * ستاك أيمن: كل حاجة مفتوحة والمستند بيتتجاهل. مش «افتراضي أوسع» —
     * ده إن صفحته وكل لوحته تفضل بايت ببايت زي ما هي، وهو الشرط اللي
     * الشغل ده كله ماشي تحته (CLAUDE.md §٢).
     *
     * ⚠️ ولو لقينا مستند هنا، ده مش إعداد — دي غلطة. مافيش مستند بيتوقّع
     * لأيمن أصلًا، فوجوده معناه على الأغلب إن `TENANT_KEY` اتنسي على ستاك
     * مدرّس، و`common/tenant.ts:28` سقط على `'ayman'`. ده الشكل الوحيد
     * اللي الافتراضي بيبقى فيه fail-OPEN، فبيتكتب بصوت عالي بدل ما يعدّي.
     */
    if (token !== '') {
      logger.error(
        'TENANT_ENTITLEMENTS is set but TENANT_KEY says this is the owner stack — ' +
          'the document is IGNORED and every feature is open. If this is an instructor ' +
          'stack, TENANT_KEY is missing and that is the bug.',
      );
    }
    current = allEnabled();
    return;
  }

  if (token === '') {
    // مش خطأ ومش تحذير: ستاك جديد قبل ما أيمن يوقّعله حاجة هو الحالة دي
    // بالظبط، وبيشتغل بالافتراضي عن قصد.
    logger.log(`TENANT_ENTITLEMENTS is not set — «${TENANT_KEY}» runs on the declared defaults.`);
    current = tenantDefaults();
    return;
  }

  try {
    const document = await verifyEntitlementsDocument(token, {
      keys: CONTROL_PUBLIC_KEYS,
      tenantKey: TENANT_KEY,
    });
    current = applyEntitlements(document.features);
  } catch (error) {
    // الرسالة بتقول «رجعنا للافتراضي» مش «اتقفل كل حاجة»، عشان ده اللي
    // حصل فعلًا — واللي هيقرا اللوج ده بيدوّر على فيتشر مختفية.
    logger.error(
      `TENANT_ENTITLEMENTS rejected (${String(error)}) — falling back to the declared ` +
        `defaults for «${TENANT_KEY}». The platform is running.`,
    );
    current = tenantDefaults();
  }
}

/**
 * بيتنده مرة عند الإقلاع. إدمپوتنت، فماينفعش يتحسب مرتين.
 *
 * مش جوّه `loadEnv()` عن قصد: `loadEnv` بترمي و`main.ts:13` بينده عليها قبل
 * `NestFactory.create`، يعني أي رمية هناك = الدومين كله 404. التحقّق هنا
 * عمره ما بيرمي.
 */
export function loadEntitlements(logger: Logger = new Logger('Entitlements')): Promise<void> {
  loading ??= resolveEntitlements(logger);
  return loading;
}

/** هل الفيتشر دي شغّالة على الستاك ده؟ قراءة sync، بعد الإقلاع. */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return current[key];
}

/** نسخة من الماب كلها — ده اللي `GET /api/entitlements` بيرجّعه. */
export function currentEntitlements(): Entitlements {
  return { ...current };
}
