import { Controller, Get, Param, ParseUUIDPipe, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  AssistantQuestionQuerySchema,
  type AssistantQuestion,
  type AssistantQuestionContext,
} from '@ayman/contracts/assistant/questions';
import type { ListResponse } from '@ayman/contracts/admin/list';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { AssistantQuestionService } from './assistant-question.service';

/**
 * `GET /api/admin/assistant/questions` — what students typed into المساعد.
 *
 * ## `conversation:read`, not a new permission
 *
 * The catalogue splits permissions where the AUTHORITIES genuinely differ —
 * `outreach:read` exists apart from `conversation:read` because reading what a
 * student asked and reading what was sent under your name without you are
 * different things. This is not that: it is the same authority as the inbox,
 * over the same material (a student's own words, addressed to the platform),
 * differing only in whether a human answered. A support role that may read the
 * inbox should read this, and one that may not, should not.
 *
 * ⚠️ `:id/context` is declared AFTER the static routes above it would ever
 * conflict with — Nest matches in declaration order, and there is only one
 * other route here (`questions`), so this is future-proofing rather than a
 * live bug, kept for the same reason every other admin controller in this
 * codebase states it.
 */
@Controller('admin/assistant')
export class AdminAssistantQuestionsController {
  constructor(private readonly questions: AssistantQuestionService) {}

  @RequirePermission('conversation:read')
  @UsePipes(new ZodValidationPipe(AssistantQuestionQuerySchema))
  @Get('questions')
  async list(
    @Query() query: unknown,
  ): Promise<ListResponse<AssistantQuestion>> {
    return this.questions.list(AssistantQuestionQuerySchema.parse(query));
  }

  /**
   * One exchange, what else the same student asked around the same time, and
   * whether it ever became a real conversation the inbox can open.
   */
  @RequirePermission('conversation:read')
  @Get('questions/:id/context')
  async context(@Param('id', ParseUUIDPipe) id: string): Promise<AssistantQuestionContext> {
    return this.questions.context(id);
  }
}
