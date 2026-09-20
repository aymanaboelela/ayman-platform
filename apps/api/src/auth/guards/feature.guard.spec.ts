import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { FeatureKey } from '@ayman/contracts/admin/entitlements';
import { isFeatureEnabled } from '../../common/entitlements';
import { RequireFeature } from '../decorators/require-feature.decorator';
import { FeatureGuard } from './feature.guard';

/*
 * الحالة الحقيقية بتتحسب مرة عند الإقلاع من متغيّر بيئة، و`common/tenant.ts`
 * بيقرا `TENANT_KEY` وقت الـimport — يعني مافيش طريقة أمينة تقلب فيتشر جوّه
 * تست من غير ما تعيد تحميل المودیول كله.
 *
 * ومقصود إنه كده: الـsetter اللي كان هيخلّي التست ده أسهل هو نفسه الباب اللي
 * `common/entitlements.ts` بيقفله — حاجة بتغيّر الصلاحيات وقت التشغيل من
 * غير توقيع. فالسبيك ده بيموك القراءة، والتحقّق نفسه متغطّى في
 * `common/entitlements.spec.ts`.
 */
jest.mock('../../common/entitlements', () => ({ isFeatureEnabled: jest.fn() }));

const enabled = isFeatureEnabled as jest.MockedFunction<typeof isFeatureEnabled>;

/** كونتكست أقل ما يمكن: الجارد بيقرا الميتاداتا وبس. */
function contextFor(feature?: FeatureKey): ExecutionContext {
  class Target {
    handler(): void {}
  }
  if (feature) RequireFeature(feature)(Target.prototype, 'handler', {
    value: Target.prototype.handler,
  });

  return {
    getHandler: () => Target.prototype.handler,
    getClass: () => Target,
  } as unknown as ExecutionContext;
}

describe('FeatureGuard', () => {
  const guard = new FeatureGuard(new Reflector());

  beforeEach(() => enabled.mockReset());

  it('راوت من غير `@RequireFeature` بيعدّي، ومابيسألش أصلًا', () => {
    expect(guard.canActivate(contextFor())).toBe(true);
    // ⚠️ الجزء المهم في التست ده. أغلب المنصة مالهاش ديكوريتر، ونداء لكل
    // طلب على كل راوت هو تكلفة مش مطلوبة.
    expect(enabled).not.toHaveBeenCalled();
  });

  it('فيتشر مفتوحة بتعدّي', () => {
    enabled.mockReturnValue(true);
    expect(guard.canActivate(contextFor('books'))).toBe(true);
    expect(enabled).toHaveBeenCalledWith('books');
  });

  it('فيتشر مقفولة بترد ٤٠٤، مش ٤٠٣', () => {
    enabled.mockReturnValue(false);
    // ٤٠٣ بيقول «موجودة ومش من حقك»؛ الفيتشر المقفولة مش موجودة على الستاك
    // ده — الويب بيعمل `notFound()` على نفس الصفحة، والاتنين لازم يقولوا
    // نفس الحاجة.
    expect(() => guard.canActivate(contextFor('video.upload'))).toThrow(NotFoundException);
  });
});
