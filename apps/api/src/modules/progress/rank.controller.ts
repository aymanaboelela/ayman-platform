import { Controller, Get } from '@nestjs/common';
import type { CohortRank } from '@ayman/contracts/rank';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CohortRankService } from './cohort-rank.service';

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
  constructor(private readonly rank: CohortRankService) {}

  @RequirePermission('progress:read')
  @Get('rank')
  forMe(@CurrentUser() user: AuthenticatedUser): Promise<CohortRank> {
    return this.rank.forUser(user.id);
  }
}
