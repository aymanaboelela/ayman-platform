import { Controller, Get } from '@nestjs/common';
import type { EntitlementsResponse } from '@ayman/contracts/admin/entitlements';
import { Public } from '../../auth/decorators/public.decorator';
import { currentEntitlements } from '../../common/entitlements';

/**
 * إيه اللي الستاك ده مسموح له يعرضه — القيم بس، لأي حد.
 *
 * ## ليه `@Public()`
 *
 * نفس سبب `GET /api/flags` بالظبط: اللي بيقراه هو الرندر نفسه. الصفحة
 * الرئيسية وصفحة الكورس بيترسموا لزائر مش مسجّل، والمفروض بلوك الكتب
 * ما يترسمش أصلًا لو الكتب مقفولة — مش يترسم وبعدين يختفي بعد تسجيل الدخول.
 *
 * وده مابيسرّبش حاجة: الرد بيقول «الستاك ده بيعرض كتب ولا لأ»، وهي معلومة
 * أي زائر شايفها بعينه أول ما يفتح الصفحة.
 *
 * ## والرد ده مش بوابة
 *
 * إخفاء في الويب مش عزل. كل فيتشر مقفولة محتاجة جيت على الكونترولر بتاعها
 * كمان، وإلا هي «مخفية» وشغّالة لأي حد يعرف الـURL. ده القفل التاني، مش
 * الأول.
 */
@Controller()
export class TenantEntitlementsController {
  @Public()
  @Get('entitlements')
  list(): EntitlementsResponse {
    return { features: currentEntitlements() };
  }
}
