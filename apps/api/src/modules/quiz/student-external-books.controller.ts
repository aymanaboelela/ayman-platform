import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  ExternalBookPracticeResult,
  ExternalBookPracticeSession,
  StudentExternalBookDetail,
  StudentExternalBookSummary,
} from '@ayman/contracts/quiz/external-books';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { NoAnswerLeak } from './interceptors/no-answer-leak.decorator';
import {
  StartExternalBookPracticeDto,
  SubmitExternalBookPracticeDto,
} from './dto/external-books.dto';
import { StudentExternalBooksService } from './student-external-books.service';

/**
 * أسئلة الكتب الخارجية للطالب — `/api/me/external-books/*`
 *
 * تتيح للطالب المشترك في الكورس استعراض الكتب الخارجية المربوطة بكورسه،
 * والتدرب واختبار نفسه على مستوى درس، وحدة، أو امتحان شامل على الكتاب كله،
 * ومراجعة الإجابات الصحيحة والتفسيرات بعد التسليم.
 */
@Controller('me/external-books')
@RequirePermission('quiz:read')
export class StudentExternalBooksController {
  constructor(private readonly service: StudentExternalBooksService) {}

  /** الكتب الخارجية المرتبطة بكورس معيّن للطالب. */
  @Get('courses/:courseId')
  listForCourse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', ParseUUIDPipe) courseId: string,
  ): Promise<StudentExternalBookSummary[]> {
    return this.service.listForCourse(user.id, courseId);
  }

  /** تفاصيل الكتاب الخارجي ووحداته ودروسه مع أعداد الأسئلة الجاهزة. */
  @Get(':bookId')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookId', ParseUUIDPipe) bookId: string,
  ): Promise<StudentExternalBookDetail> {
    return this.service.detail(user.id, bookId);
  }

  /**
   * بدء جلسة تدريب/اختبار ذاتي على درس أو وحدة أو الكتاب.
   * `@NoAnswerLeak()` للتأكد من عدم تسريب الإجابات في هذه المرحلة.
   */
  @NoAnswerLeak()
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post(':bookId/practice')
  startPractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookId', ParseUUIDPipe) bookId: string,
    @Body() dto: StartExternalBookPracticeDto,
  ): Promise<ExternalBookPracticeSession> {
    return this.service.startPractice(user.id, bookId, dto);
  }

  /**
   * استرجاع جلسة اختبار نشطة للحل.
   * `@NoAnswerLeak()` للتأكد من عدم تسريب الإجابات في هذه المرحلة.
   */
  @NoAnswerLeak()
  @Get('practice/:sessionId')
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<ExternalBookPracticeSession> {
    return this.service.getSession(user.id, sessionId);
  }

  /** تسليم إجابات الاختبار وحساب النتيجة والمراجعة والتفسيرات. */
  @UsePipes(ZodValidationPipe)
  @HttpCode(200)
  @Post('practice/:sessionId/submit')
  submitPractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SubmitExternalBookPracticeDto,
  ): Promise<ExternalBookPracticeResult> {
    return this.service.submitPractice(user.id, sessionId, dto);
  }

  /** استرجاع نتيجة اختبار سابق. */
  @Get('practice/:sessionId/result')
  getPracticeResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<ExternalBookPracticeResult> {
    return this.service.getPracticeResult(user.id, sessionId);
  }
}
