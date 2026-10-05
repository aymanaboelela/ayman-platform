import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, UsePipes } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import {
  ChallengeTopicInputSchema,
  ChallengeTopicOrderSchema,
  ChallengeTopicPatchSchema,
  type AdminChallengeTopics,
} from '@ayman/contracts/quiz/challenges';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { ChallengeTopicsService } from './challenge-topics.service';

class ChallengeTopicInputDto extends createZodDto(ChallengeTopicInputSchema) {}
class ChallengeTopicPatchDto extends createZodDto(ChallengeTopicPatchSchema) {}
class ChallengeTopicOrderDto extends createZodDto(ChallengeTopicOrderSchema) {}

/**
 * «قسم التحديات» في لوحة التحكم — نفس باب «أسئلة الألعاب»: فيتشر
 * `quizGame` (مقفولة على أي ستاك غير أيمن)، وصلاحية `question:write`، لأن
 * التحدّي هو نفس سؤال «أنهي أسئلة تتسأل».
 *
 * كل كتابة بترجّع الشاشة كلها (`AdminChallengeTopics`) — الأعداد بتتغيّر مع
 * الدروس، والترتيب مع أي إضافة.
 */
@Controller('admin/challenge-topics')
@RequireFeature('quizGame')
@RequirePermission('question:write')
export class AdminChallengeTopicsController {
  constructor(private readonly topics: ChallengeTopicsService) {}

  @Get(':courseId')
  detail(@Param('courseId', ParseUUIDPipe) courseId: string): Promise<AdminChallengeTopics> {
    return this.topics.detail(courseId);
  }

  @UsePipes(ZodValidationPipe)
  @Post(':courseId')
  create(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: ChallengeTopicInputDto,
  ): Promise<AdminChallengeTopics> {
    return this.topics.create(courseId, body);
  }

  /** الترتيب — قبل `:topicId` عشان «order» مايتقريش id (والـUUID pipe كان هيرفضه أصلًا). */
  @UsePipes(ZodValidationPipe)
  @Put(':courseId/order')
  reorder(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: ChallengeTopicOrderDto,
  ): Promise<AdminChallengeTopics> {
    return this.topics.reorder(courseId, body.ids);
  }

  @UsePipes(ZodValidationPipe)
  @Patch(':courseId/:topicId')
  update(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
    @Body() body: ChallengeTopicPatchDto,
  ): Promise<AdminChallengeTopics> {
    return this.topics.update(courseId, topicId, body);
  }

  @Delete(':courseId/:topicId')
  remove(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('topicId', ParseUUIDPipe) topicId: string,
  ): Promise<AdminChallengeTopics> {
    return this.topics.remove(courseId, topicId);
  }
}
