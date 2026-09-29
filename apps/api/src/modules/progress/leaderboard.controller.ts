import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  LeaderboardQuerySchema,
  type AdminLeaderboard,
  type AdminStudentRank,
} from '@ayman/contracts/admin/leaderboard';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { parseRequest } from '../../common/http/parse-request';
import { CohortRankService } from './cohort-rank.service';
import { LeaderboardService } from './leaderboard.service';

/**
 * `/api/admin/leaderboard` — «الأوائل»: ترتيب كل دفعة من ناحية المدرّس.
 *
 * ## `analytics:read`
 *
 * نفس صلاحية `/api/admin/analytics/*`: الشاشة دي قراية على الدفعة كلها زيهم
 * بالظبط، ومفيها ولا كتابة. دور يقدر يشوف «أداء الطلبة» يقدر يشوف ترتيبهم.
 *
 * ## جوّه `ProgressModule` مش `CohortAnalyticsModule`
 *
 * عشان `CohortRankService` هنا. الترتيب لازم يبقى نفس اللي الطالب شايفه، يعني
 * نفس الـinstance ونفس الكاش — مش نسخة تانية من السيرفس في موديول تاني
 * بكاش لوحدها ممكن يتحسب في دقيقة تانية.
 *
 * ⚠️ `students/:userId` تحت الـ`GET` العادي، ومفيش `:id` على مستوى الجذر —
 * أي راوت ثابت يتضاف بعدين يتحط فوقه.
 */
@Controller('admin/leaderboard')
@RequirePermission('analytics:read')
export class AdminLeaderboardController {
  constructor(
    private readonly leaderboard: LeaderboardService,
    private readonly rank: CohortRankService,
  ) {}

  @Get()
  board(
    @Query('year') year?: string,
    @Query('systemId') systemId?: string,
    @Query('q') q?: string,
    @Query('stream') stream?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ): Promise<AdminLeaderboard> {
    // `parseRequest` مش `.parse()`: ZodError مش HttpException، والفلتر كان
    // هيحوّل غلطة في الرابط لـ500 بتلوم السيرفر.
    const query = parseRequest(
      LeaderboardQuerySchema,
      { year, systemId, q, stream, page, perPage },
      'leaderboard query',
    );
    return this.leaderboard.board(query);
  }

  /**
   * الشريحة اللي فوق صفحة الطالب. مفيش `ParseUUIDPipe`: الـids نانو-آيديز
   * من better-auth. واللي مالوش بروفايل بيرجع `cohort: null` مش 404 — صفحة
   * الطالب بتتفتح لأدمن ولمؤلف محتوى كمان.
   */
  @Get('students/:userId')
  student(@Param('userId') userId: string): Promise<AdminStudentRank> {
    return this.rank.forAdmin(userId);
  }
}
