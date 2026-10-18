import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  PracticeLessonCodeSchema,
  PracticeTrackSchema,
  PracticeYearSchema,
  type AdminPracticeSetDetail,
  type AdminPracticeSetRow,
  type PracticePublicList,
  type PracticePublicSet,
} from '@ayman/contracts/practice';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { PracticeOpenGuard } from './practice-gate.service';
import {
  PracticeQuestionBatchDto,
  PracticeQuestionInputDto,
  PracticeQuestionReorderDto,
  PracticeSetCreateDto,
  PracticeSetPatchDto,
} from './practice.dto';
import { PracticeService } from './practice.service';

/**
 * The same budget as `NEWS_THROTTLE`, for the same observed failure: `next
 * build` statically generates one page per set via `generateStaticParams`,
 * firing every read concurrently from one machine, and the default `10/1s`
 * would fail the build past ten lessons. Scoped to the two `@Public()` reads;
 * the admin routes keep the default budget.
 */
const PRACTICE_THROTTLE = {
  short: { limit: 300, ttl: seconds(1) },
  medium: { limit: 3000, ttl: seconds(60) },
  long: { limit: 30_000, ttl: seconds(3600) },
};

/**
 * «اختبارات مجانية». Every route — public and admin — sits behind
 * `PracticeOpenGuard` (`practice.enabled`): off = 404, the feature does not
 * exist on this stack.
 *
 * Admin permissions reuse the question bank's (`question:read` /
 * `question:write`): whoever may write the paid bank may write the free
 * quizzes, and a new permission would leave every existing role unable to
 * open the screen until someone re-granted it.
 */
@Controller()
@UseGuards(PracticeOpenGuard)
@UsePipes(ZodValidationPipe)
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  /** Public: every published set with at least one question. */
  @Public()
  @Throttle(PRACTICE_THROTTLE)
  @Get('practice/sets')
  listPublic(): Promise<PracticePublicList> {
    return this.practice.listPublic();
  }

  /**
   * Public: one set, key included. A malformed segment 404s like a missing
   * set rather than 400ing — from outside, «no such quiz» is the only answer.
   */
  @Public()
  @Throttle(PRACTICE_THROTTLE)
  @Get('practice/sets/:year/:track/:lessonCode')
  async onePublic(
    @Param('year') year: string,
    @Param('track') track: string,
    @Param('lessonCode') lessonCode: string,
  ): Promise<PracticePublicSet> {
    const y = PracticeYearSchema.safeParse(Number(year));
    const t = PracticeTrackSchema.safeParse(track);
    const code = PracticeLessonCodeSchema.safeParse(lessonCode);
    if (!y.success || !t.success || !code.success) throw new NotFoundException();
    const set = await this.practice.findPublic(y.data, t.data, code.data);
    if (!set) throw new NotFoundException();
    return set;
  }

  // ── admin ──────────────────────────────────────────────────────────────

  @RequirePermission('question:read')
  @Get('admin/practice/sets')
  listAdmin(): Promise<AdminPracticeSetRow[]> {
    return this.practice.listAdmin();
  }

  @RequirePermission('question:read')
  @Get('admin/practice/sets/:id')
  oneAdmin(@Param('id', ParseUUIDPipe) id: string): Promise<AdminPracticeSetDetail> {
    return this.practice.findAdmin(id);
  }

  @RequirePermission('question:write')
  @RequireCsrf()
  @Post('admin/practice/sets')
  create(@Body() body: PracticeSetCreateDto, @CurrentUser() user: AuthenticatedUser): Promise<AdminPracticeSetDetail> {
    return this.practice.create(body, user.id);
  }

  @RequirePermission('question:write')
  @RequireCsrf()
  @Patch('admin/practice/sets/:id')
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PracticeSetPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminPracticeSetDetail> {
    return this.practice.patch(id, body, user.id);
  }

  @RequirePermission('question:write')
  @RequireCsrf()
  @Delete('admin/practice/sets/:id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.practice.remove(id, user.id);
    return { ok: true };
  }

  @RequirePermission('question:write')
  @RequireCsrf()
  @Post('admin/practice/sets/:id/questions')
  addQuestions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PracticeQuestionBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminPracticeSetDetail> {
    return this.practice.addQuestions(id, body.questions, user.id);
  }

  @RequirePermission('question:write')
  @RequireCsrf()
  @Put('admin/practice/sets/:id/order')
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PracticeQuestionReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminPracticeSetDetail> {
    return this.practice.reorder(id, body.ids, user.id);
  }

  @RequirePermission('question:write')
  @RequireCsrf()
  @Patch('admin/practice/questions/:id')
  patchQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PracticeQuestionInputDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminPracticeSetDetail> {
    return this.practice.patchQuestion(id, body, user.id);
  }

  @RequirePermission('question:write')
  @RequireCsrf()
  @Delete('admin/practice/questions/:id')
  removeQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminPracticeSetDetail> {
    return this.practice.removeQuestion(id, user.id);
  }
}
