import { Controller, Get, Param } from '@nestjs/common';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AnalyticsService } from './analytics.service';

@Controller('admin/quizzes')
@RequirePermission('analytics:read')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get(':quizId/analytics')
  forQuiz(@Param('quizId') quizId: string) {
    return this.analytics.forQuiz(quizId);
  }
}
