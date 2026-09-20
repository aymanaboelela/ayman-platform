import { type CanActivate, type ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureKey } from '@ayman/contracts/admin/entitlements';
import { isFeatureEnabled } from '../../common/entitlements';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';

/**
 * القفل الحقيقي على فيتشر مقفولة على الستاك ده — `APP_GUARD` تاني، جنب
 * `AuthGuard` مش جوّاه.
 *
 * ## ليه جارد لوحده ومش سطر في `AuthGuard`
 *
 * `AuthGuard` بيعمل `return true` بدري على أي راوت `@Public()` (سطر ٨١)، قبل
 * ما يبص على أي ميتاداتا تانية. وتلات فيتشرز من التسعة أبوابها عامّة —
 * `GET /api/books`، `GET /api/catalog/honor-board`، وشات المساعد. جيت جوّه
 * `AuthGuard` كان هيبقى ميت على بالظبط الراوتات اللي محتاجاه.
 *
 * وفيه سبب تاني: الفيتشر مالهاش علاقة بالجلسة أصلًا. القرار ده متاخد وقت
 * الإقلاع ومتساوي لكل طلب، فقراءة جلسة قبله شغل مالوش لازمة.
 *
 * ## ليه 404 ومش 403
 *
 * لأن ٤٠٣ بيقول «الحاجة دي موجودة ومش من حقك»، و٤٠٤ بيقول «مفيش حاجة هنا» —
 * والتانية هي الصح. الفيتشر المقفولة **مش موجودة** على الستاك ده: الويب
 * مابيرسمش لينكها، والصفحة بتعمل `notFound()`. لو الـAPI رد ٤٠٣ ساعتها،
 * المدرّس اللي بيتفرّج على الشبكة يشوف باب مقفول ويسأل عن المفتاح، بدل ما
 * يشوف إن مفيش باب. ودي نفس الحجة المكتوبة فوق `notFound()` في
 * `(admin)/layout.tsx`.
 *
 * ## القراءة sync
 *
 * `isFeatureEnabled` بتقرا حالة محسوبة وقت الإقلاع — مافيش `await` ولا عملية
 * تشفير على مسار الطلب. الحكاية كاملة في `common/entitlements.ts`.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // مافيش ديكوريتر = الراوت ده مالوش علاقة بأي فيتشر متحكّم فيها. الافتراضي
    // «عدّي» عن قصد: الجيت بيتحط على اللي اتقرر إنه يتقفل، والباقي — وده
    // أغلب المنصة — مايعرفش إن الملف ده موجود.
    if (required === undefined) return true;

    if (!isFeatureEnabled(required)) throw new NotFoundException();

    return true;
  }
}
