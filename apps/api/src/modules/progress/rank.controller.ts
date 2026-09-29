import { Controller, Get } from '@nestjs/common';
import type { CohortRank } from '@ayman/contracts/rank';
import type { RankNextSteps } from '@ayman/contracts/rank-next';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CohortRankService } from './cohort-rank.service';
import { RankNextService } from './rank-next.service';

/**
 * `GET /api/me/rank` — «ترتيبي على الدفعة».
 *
 * تحت `me` زي `/api/me/activity` وجيرانه: مفيش id في الرابط، والهوية من
 * السيشن بس، فمفيش حاجة تتلعب فيها.
 *
 * `progress:read` لأن الصفحة بتقرا شغل الطالب اللي خلص — نفس سؤال الـactivity
 * feed. وبيرجّع حاجة واحدة عن طلبة تانيين: أول اسمين للتلاتة الأوائل. ده نفس
 * اللي لوحة الشرف بتنشره للعامة بالاسم الكامل، فمش باب جديد.
 */
@Controller('me')
export class RankController {
  constructor(
    private readonly rank: CohortRankService,
    private readonly next: RankNextService,
  ) {}

  @RequirePermission('progress:read')
  @Get('rank')
  forMe(@CurrentUser() user: AuthenticatedUser): Promise<CohortRank> {
    return this.rank.forUser(user.id);
  }

  /**
   * `GET /api/me/rank/next` — «الطريق لفوق»: الواجبات والكويزات وامتحان الشهر
   * اللي ناقصين الطالب، كل واحد بباب.
   *
   * راوت لوحده مش حقل في `/rank`: الترتيب بيتحسب من كاش الدفعة وبيرجع في
   * لحظة، ودي بتعدّي كل محاضرة على البوابة. لو وقعت، الصفحة بتفضل بترتيبها
   * والكروت بترجع شرح بس — مش «الصفحة مش راضية تفتح».
   *
   * نفس `progress:read` ونفس الهوية من السيشن بس. ومش باب جديد لمحتوى: كل صف
   * هنا عدّى على `LessonAccessService.require` قبل ما يطلع، والرد فيه عناوين
   * ودرجات الطالب نفسه وبس.
   */
  @RequirePermission('progress:read')
  @Get('rank/next')
  nextSteps(@CurrentUser() user: AuthenticatedUser): Promise<RankNextSteps> {
    return this.next.forUser(user.id);
  }
}
