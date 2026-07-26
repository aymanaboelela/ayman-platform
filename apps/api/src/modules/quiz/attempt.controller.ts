import { Body, Controller, Get, Param, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { AttemptService } from './attempt.service';
import { FlagDto, SaveAnswersDto, SubmitDto } from './dto/save-answers.dto';
import { NoAnswerLeak } from './interceptors/no-answer-leak.decorator';

/**
 * The learner-facing attempt runner. Every route BEFORE submission carries
 * `@NoAnswerLeak()`. `submit` is deliberately exempt: its response is the
 * student's OWN just-earned score (`rawScore`/`scaledScore`/`passed`), which
 * is legitimate the instant they submit — that is not a pre-submission leak,
 * it is the terminal action. `GET /attempts/:attemptId/review` (Task 13) is
 * exempt for the same reason and is not on this controller's shape at all.
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

  @UsePipes(ZodValidationPipe)
  @Post('attempts/:attemptId/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attemptId') attemptId: string,
    @Body() body: SubmitDto,
  ) {
    return this.attempts.submit(user.id, attemptId, body);
  }

  @NoAnswerLeak()
  @Get('attempts/:attemptId/preflight')
  preflight(@CurrentUser() user: AuthenticatedUser, @Param('attemptId') attemptId: string) {
    return this.attempts.preflight(user.id, attemptId);
  }

  // Deliberately NO @NoAnswerLeak() — see AttemptService.review's own doc
  // comment. This is the one learner route allowed to carry answer data.
  @Get('attempts/:attemptId/review')
  review(@CurrentUser() user: AuthenticatedUser, @Param('attemptId') attemptId: string) {
    return this.attempts.review(user.id, attemptId);
  }
}
