import { Logger, Module, type OnModuleInit } from '@nestjs/common';
import { loadEntitlements } from '../../common/entitlements';
import { TenantEntitlementsController } from './tenant-entitlements.controller';

/**
 * ⚠️ الاسم مقصود إنه مش `EntitlementModule`. الاسم ده **مستعمل** خلاص —
 * `modules/entitlement/` بيجاوب على «الطالب ده يقدر يفتح الكورس ده؟». ده
 * سؤال تاني خالص بنفس الكلمة، وموديولين بنفس الاسم معناه ريفيو بيقرا الغلط
 * وتست بيستورد الحاجة التانية.
 *
 * بيستورد `PrismaModule`؟ لأ — ومقصود. المستند في متغيّر بيئة، فالموديول ده
 * مالوش أي تبعية: ولا داتابيز، ولا ريديس، ولا Better Auth. وده اللي بيخلّي
 * `authorization-matrix.int-spec.ts` تقدر تستورده زي ما هو، على عكس أي حاجة
 * جوّه `AuthModule` (شوف `permission-grants.module.ts` للحكاية كاملة).
 */
@Module({
  controllers: [TenantEntitlementsController],
})
export class TenantEntitlementsModule implements OnModuleInit {
  private readonly logger = new Logger('Entitlements');

  /**
   * التحقّق بيحصل هنا كمان، مش في `main.ts` بس.
   *
   * `main.ts` هو المكان الأبكر وهو اللي بيغطي البرودكشن. بس أي سبيك بيبني
   * التطبيق من الموديولات — ومنهم مصفوفة الأذونات — عمره ما بيعدّي على
   * `main.ts`، وساعتها الراوت كان هيرد بقيم ما اتحسبتش. الدالة إدمپوتنت،
   * فالنداءين مابيعملوش الشغل مرتين.
   */
  async onModuleInit(): Promise<void> {
    await loadEntitlements(this.logger);
  }
}
