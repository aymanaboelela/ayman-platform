import { SetMetadata } from '@nestjs/common';
import type { FeatureKey } from '@ayman/contracts/admin/entitlements';

export const FEATURE_KEY = 'requiredFeature';

/**
 * يقفل الراوت (أو الكونترولر كله) لو الفيتشر دي مش مسموحة على الستاك ده.
 *
 * ## ده مش `@RequirePermission`
 *
 * الصلاحية سؤال عن **مين** بيطلب: الرول ده معاه الحق ده ولا لأ. ودي سؤال عن
 * **الستاك**: الفيتشر دي أصلًا موجودة هنا ولا لأ — والإجابة واحدة لكل طلب،
 * مهما كان اللي بيطلب، حتى لو زائر مش مسجّل. عشان كده الاتنين متفرقين،
 * ومتراكبين: راوت ممكن يكون عليه الاتنين، وكل واحد بيرد بحاجة مختلفة.
 *
 * ⚠️ الفرق اللي بيتنسي: `@RequirePermission` بيشتغل بعد ما الجلسة تتقرا،
 * فراوت `@Public()` عمره ما بيشوفه. `@RequireFeature` بيشتغل قبل كده وعلى
 * `@Public()` كمان — لأن `GET /api/books` و`GET /api/catalog/honor-board`
 * عامّين، وهما بالظبط اللي لازم يختفوا على ستاك مالوش كتب ولا لوحة شرف.
 *
 * الباراميتر متايپ بـ`FeatureKey` عن عمد، بنفس سبب `RequirePermission`:
 * `@RequireFeature('bokks')` يبقى خطأ كومبايل بدل راوت بيرد 404 للأبد ومحدش
 * فاهم ليه.
 */
export const RequireFeature = (feature: FeatureKey): MethodDecorator & ClassDecorator =>
  SetMetadata(FEATURE_KEY, feature);
