import { Controller, Get } from '@nestjs/common';
import type { StudentMastery, StudentQuizHistory } from '@ayman/contracts';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MasteryService } from './mastery.service';
import { QuizHistoryService } from './quiz-history.service';

/**
 * `GET /api/me/quizzes` — the student's own results across every quiz.
 *
 * ## Why it is not on `AttemptController`
 *
 * That controller's class-level permission is `quiz:attempt` and its documented
 * shape is the runner: start, save, flag, submit, resume. This is a read of
 * finished work, so it takes `quiz:read` — and putting a `quiz:read` route on a
 * `quiz:attempt` controller means the next person to add a route there has to
 * notice a method-level override to understand what guards it.
 *
 * ## Why it is not on `DashboardController`
 *
 * `DashboardModule` reaches quiz data only through the `SCORE_FEED` port,
 * deliberately, so it does not depend on quiz internals. Widening that port
 * from "the last five scores" to "the whole history" would undo the separation
 * the port exists for. The dashboard keeps its five; this owns the rest.
 *
 * ## Ownership
 *
 * No id parameter. The only identity involved is the session's, so there is
 * nothing for a caller to tamper with — the same reasoning
 * `DashboardController` sets out for `/api/me/dashboard`.
 *
 * Deliberately NOT `@NoAnswerLeak()`: nothing on this shape describes a
 * question, an option or a correct answer. It carries the caller's own,
 * already-submitted scores, which is the same "it's already theirs" carve-out
 * the review endpoint and the pre-attempt overview both rely on.
 */
@Controller('me')
export class MeQuizzesController {
  constructor(
    private readonly history: QuizHistoryService,
    private readonly mastery: MasteryService,
  ) {}

  @RequirePermission('quiz:read')
  @Get('quizzes')
  quizzes(@CurrentUser() user: AuthenticatedUser): Promise<StudentQuizHistory> {
    return this.history.forUser(user.id);
  }

  /**
   * `GET /api/me/mastery` — the same finished work as `quizzes` above, grouped
   * by the topic each question belongs to instead of by the quiz it sat in.
   *
   * Here rather than on a controller of its own for exactly the reason this
   * file's header gives for `quizzes`: `quiz:read` is what guards it, and a
   * route's home is decided by the permission on it. Like its neighbour it is
   * deliberately NOT `@NoAnswerLeak()` — the shape names no question, no
   * option and no correct answer, only the caller's own marks in aggregate.
   *
   * The trailing underscore matches `DashboardController.path_`: the class
   * already has a `mastery` property, and a method of the same name would
   * shadow it.
   */
  @RequirePermission('quiz:read')
  @Get('mastery')
  mastery_(@CurrentUser() user: AuthenticatedUser): Promise<StudentMastery> {
    return this.mastery.forUser(user.id);
  }
}
