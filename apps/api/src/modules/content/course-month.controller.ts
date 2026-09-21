import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { CourseMonthWriteSchema, LessonMonthsWriteSchema } from '@ayman/contracts/months';
import {
  CourseMonthPatchSchema,
  LegacyMonthBackfillSchema,
} from '@ayman/contracts/admin/content-months';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CourseMonthService } from './course-month.service';

/*
 * The DTOs live HERE and not in `dto/course-month.dto.ts` beside
 * `dto/term.dto.ts`, which is where the rest of this module keeps them.
 * Nothing technical: this change's file set does not include that directory,
 * and a stray file there would be edited out from under another branch. Move
 * them next to their siblings when the two land together — they are three
 * `createZodDto` lines and nothing imports them from outside this file.
 */
class CreateCourseMonthDto extends createZodDto(CourseMonthWriteSchema) {}
class UpdateCourseMonthDto extends createZodDto(CourseMonthPatchSchema) {}
class SetLessonMonthsDto extends createZodDto(LessonMonthsWriteSchema) {}
class LegacyMonthBackfillDto extends createZodDto(LegacyMonthBackfillSchema) {}

/**
 * «شهور المنهج». `section:write` throughout, exactly like `TermController`
 * next door and for the same reason: deciding which lectures a month contains
 * is content authoring, the same authority as arranging them into sections,
 * and this feature introduces no new role.
 *
 * Note what is NOT here — an open/close route of its own. `TermController` has
 * one because closing a term bulk-revokes every grant behind it and that is
 * not a field edit. A month's `isOpen` takes it off the shelf and takes
 * nothing from anyone holding it, so it rides the PATCH. `CourseMonthService`'s
 * own doc carries the full reasoning.
 */
@Controller('admin')
@UsePipes(ZodValidationPipe)
export class CourseMonthController {
  constructor(private readonly months: CourseMonthService) {}

  @RequirePermission('section:write')
  @Get('courses/:courseId/months')
  list(@Param('courseId') courseId: string) {
    return this.months.list(courseId);
  }

  @RequirePermission('section:write')
  @Post('courses/:courseId/months')
  create(@Param('courseId') courseId: string, @Body() body: CreateCourseMonthDto) {
    return this.months.create(courseId, body);
  }

  /**
   * «حط كل المحاضرات اللي من غير شهر في الشهر ده».
   *
   * The press that makes an EXISTING course sellable by month: every course on
   * the platform predates months, so every lesson on it is untagged and no
   * month can be opened until that is fixed. Quizzes and drafts included — see
   * the service method, both are access decisions rather than tidiness.
   */
  @RequirePermission('section:write')
  @Post('courses/:courseId/months/:monthId/adopt-untagged')
  adoptUntagged(@Param('courseId') courseId: string, @Param('monthId') monthId: string) {
    return this.months.adoptUntaggedLessons(courseId, monthId);
  }

  /**
   * «الي حد اشترك دلوقتي أو قبل كده حطه في الشهر ده».
   *
   * A POST that defaults to counting and writing nothing: `dryRun` is `true`
   * unless the body says otherwise, so the panel can put the number of affected
   * students on screen before the instructor commits. It only ever INSERTs —
   * see the service method for why nothing is revoked or narrowed.
   *
   * `section:write` like its neighbours rather than a money permission, even
   * though it hands out access: the act is "finish configuring this course's
   * months", it is per course, and it is only reachable from the month panel.
   */
  @RequirePermission('section:write')
  @Post('courses/:courseId/months/open-for-subscribers')
  openForSubscribers(@Param('courseId') courseId: string, @Body() body: LegacyMonthBackfillDto) {
    return this.months.openMonthForSubscribers(courseId, body.monthId, body.dryRun);
  }

  /** Nested under the course on purpose — see `CourseMonthService.update` on
   *  why a month id alone is not enough to name a month. */
  @RequirePermission('section:write')
  @Patch('courses/:courseId/months/:monthId')
  update(
    @Param('courseId') courseId: string,
    @Param('monthId') monthId: string,
    @Body() body: UpdateCourseMonthDto,
  ) {
    return this.months.update(courseId, monthId, body);
  }

  /** 204 and an empty body, same as every other delete in this module. The
   *  refusals — a month a transfer already paid for — are 409s with a sentence
   *  in them, not this. */
  @RequirePermission('section:write')
  @HttpCode(204)
  @Delete('courses/:courseId/months/:monthId')
  remove(@Param('courseId') courseId: string, @Param('monthId') monthId: string) {
    return this.months.remove(courseId, monthId);
  }

  /** A LESSON route, on the months controller: it is the month half of the
   *  feature and it is the only write `LessonService` would otherwise have
   *  gained for a table it knows nothing else about. PUT because it rewrites
   *  the whole set — `LessonMonthsWriteSchema`'s own note says why that is not
   *  two endpoints. */
  @RequirePermission('section:write')
  @Put('lessons/:lessonId/months')
  setLessonMonths(@Param('lessonId') lessonId: string, @Body() body: SetLessonMonthsDto) {
    return this.months.setLessonMonths(lessonId, body);
  }
}
