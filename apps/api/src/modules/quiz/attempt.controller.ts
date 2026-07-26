import { Body, Controller, Param, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AttemptService } from './attempt.service';
import { FlagDto, SaveAnswersDto } from './dto/save-answers.dto';
import { NoAnswerLeak } from './interceptors/no-answer-leak.decorator';

/**
 * The learner-facing attempt runner. Every route here is pre-submission, so
 * every route carries `@NoAnswerLeak()` — the ONE exception is
 * `GET /attempts/:attemptId/review` (Task 13), which is deliberately not on
 * this controller's shape at all.
 */
@Controller('quiz')
@RequirePermission('quiz:attempt')
export class AttemptController {
  constructor(private readonly attempts: AttemptService) {}

  @NoAnswerLeak()
  @Post('quizzes/:quizId/attempts')
  start(@CurrentUser() user: AuthenticatedUser, @Param('quizId') quizId: string) {
    return this.attempts.start(user.id, quizId);
  }

  @NoAnswerLeak()
  @Post('attempts/:attemptId/resume')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('attemptId') attemptId: string) {
    return this.attempts.resume(user.id, attemptId);
  }

  @NoAnswerLeak()
  @UsePipes(ZodValidationPipe)
  @Put('attempts/:attemptId/answers')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() body: SaveAnswersDto,
  ) {
    return this.attempts.saveAnswers(user.id, attemptId, body);
  }

  @NoAnswerLeak()
  @UsePipes(ZodValidationPipe)
  @Post('attempts/:attemptId/flag')
  flag(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() body: FlagDto,
  ) {
    return this.attempts.setFlag(user.id, attemptId, body);
  }
}
