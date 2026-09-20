import { cacheLife, cacheTag } from 'next/cache';
import {
  EntitlementsResponseSchema,
  allEnabled,
  applyEntitlements,
  tenantDefaults,
  type Entitlements,
  type FeatureKey,
} from '@ayman/contracts/admin/entitlements';
import { apiGet } from '@/lib/api';
import { tags } from '@/lib/cache-tags';
import { IS_AYMAN } from '@/lib/tenant';

/**
 * إيه اللي الستاك ده مسموح له يعرضه — الويب بيسأل الـAPI، وبس.
 *
 * ## ليه من الراوت ومش من `TENANT_ENTITLEMENTS` على طول
 *
 * المستند موقّع، والتحقّق منه عملية تشفير محتاجة مفتاح عام وكيرينج وساعة —
 * وكل ده عايش في الـAPI (`apps/api/src/common/entitlements.ts`). نسخة تانية
 * منه هنا معناها مكانين بيفسّروا نفس التوكن، ويوم ما يختلفوا، الويب هيرسم
 * زرار الـAPI بيرد عليه ٤٠٤ — وده أسوأ من إن الفيتشر مقفولة.
 *
 * وفيه سبب أهم: لو الويب قرا المتغيّر بنفسه، هيبقى لازم يتحقن في
 * `next.config.ts` → `env` زي `TENANT_KEY`، يعني **قيمة وقت بناء**. مستند
 * جديد ساعتها مايوصلش غير بإعادة بناء. من الراوت، إعادة تشغيل الـAPI كفاية.
 *
 * ## ⚠️ والرد ده مش بوابة
 *
 * ده بيقرر إيه اللي **يترسم**. القفل الحقيقي `FeatureGuard` في الـAPI، وكل
 * فيتشر مقفولة عندها `@RequireFeature` على الكونترولر بتاعها. لو الاتنين
 * اختلفوا، اللي بيكسب هو الـAPI — وده المقصود.
 *
 * ## السقوط لما الـAPI مايردّش
 *
 * `next build` بيعمل prerender جوّه `docker build` ومافيش API شغّال، فالنداء
 * ده بيقع هناك كل مرة. الرد ساعتها هو الافتراضي المعلن.
 *
 * ⚠️ **والافتراضي ده ممكن يبقى أوسع من الحقيقة، ومقصود.** مستند بيقفل
 * `books` على ستاك افتراضيها مفتوحة معناه إن الإدخال ده في الكاش بيقول
 * «مفتوحة» لحد أول رد من الـAPI — دقيقتين بعد النشر على الأكتر. واللي بيحصل
 * فيهم إن `/store` بترسم متجر فاضي بدل ما تعمل `notFound()`، مش إن حد
 * بيقدر يطلب كتاب: `@RequireFeature('books')` على الكونترولر بيرد ٤٠٤ في
 * الحالتين، والصفحة بتصلّح نفسها لوحدها.
 *
 * والاتجاه التاني كان أسوأ: «كله مقفول» كفولباك كان هيطفّي منصة مدرّس
 * كاملة كل مرة الـAPI يتأخر ثانية عن الويب في النشر.
 *
 * و`cacheLife('minutes')` مش `'hours'` بالظبط عشان الدقايق دي: نفس الفخ اللي
 * `lib/books.ts` بيوصفه — الدالة دي بتكاش فشلها هي كمان.
 */
export async function getEntitlements(): Promise<Entitlements> {
  'use cache';
  cacheLife('minutes');
  cacheTag(tags.entitlements());

  try {
    const response = await apiGet('/api/entitlements', EntitlementsResponseSchema);
    /*
     * الرد عدّى من نفس الحساب في الـAPI، فالنداء ده مش بيغيّر فيه حاجة —
     * هو فلتر على الكتالوج: مفتاح الـbuild ده مايعرفهوش يتتجاهل، ومفتاح
     * ناقص من الرد بياخد افتراضيه. ستاك بينشر نسخة أحدث من الـAPI قبل
     * الويب (أو العكس) بيعدّي من غير ما يرسم حاجة مالهاش كود.
     */
    return applyEntitlements(response.features);
  } catch {
    return IS_AYMAN ? allEnabled() : tenantDefaults();
  }
}

/** فيتشر واحدة، للشاشة اللي بتسأل عن واحدة بس. */
export async function featureEnabled(key: FeatureKey): Promise<boolean> {
  return (await getEntitlements())[key];
}
