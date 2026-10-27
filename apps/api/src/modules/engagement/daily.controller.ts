import { Body, Controller, Get, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { DailyAnswerResult, DailyPayload } from '@ayman/contracts/engagement';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { NoAnswerLeak } from '../quiz/interceptors/no-answer-leak.decorator';
import { DailyService } from './daily.service';
import { DailyAnswerDto } from './engagement.dto';

/**
 * «سؤال اليوم» — `quiz:read`, the permission every student-facing question
 * read already carries, behind `dailyQuestion`.
 */
@Controller('me/daily')
@RequireFeature('dailyQuestion')
@RequirePermission('quiz:read')
export class DailyController {
  constructor(private readonly daily: DailyService) {}

  /**
   * `@NoAnswerLeak()` guards the unanswered card. Once answered, the payload
   * carries a `verdict` whose fields are named outside the forbidden list on
   * purpose — the key is shown after the one answer, as the mistakes book does.
   */
  @NoAnswerLeak()
  @Get()
  today(@CurrentUser() user: AuthenticatedUser): Promise<DailyPayload> {
    return this.daily.today(user.id);
  }

  /** One answer per day: 409 on a second one, 404 before the card was dealt. */
  @Post('answer')
  @UsePipes(ZodValidationPipe)
  answer(@CurrentUser() user: AuthenticatedUser, @Body() dto: DailyAnswerDto): Promise<DailyAnswerResult> {
    return this.daily.answer(user.id, dto.optionId);
  }
}
