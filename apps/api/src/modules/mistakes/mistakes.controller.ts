import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { MistakeAnswerResult, MistakeNotebook } from '@ayman/contracts/mistakes';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { NoAnswerLeak } from '../quiz/interceptors/no-answer-leak.decorator';
import { MistakesOpenGuard } from './mistakes-gate.service';
import { MistakeAnswerDto } from './mistakes.dto';
import { MistakesService } from './mistakes.service';

/**
 * «دفتر غلطاتي» — `/api/me/mistakes`، تحت `me` زي الساحة والألعاب: مفيش id
 * طالب في الرابط. `quiz:read` نفسها بالظبط (القراية دي كويز الطالب هو
 * نفسه)، و`MistakesOpenGuard` = فلاج `mistakes.enabled`.
 */
@Controller('me/mistakes')
@UseGuards(MistakesOpenGuard)
@RequirePermission('quiz:read')
export class MistakesController {
  constructor(private readonly mistakes: MistakesService) {}

  /** الدفتر: اللي لسه محتاج مراجعة، واللي اتصلح. */
  @NoAnswerLeak()
  @Get()
  notebook(@CurrentUser() user: AuthenticatedUser): Promise<MistakeNotebook> {
    return this.mistakes.notebook(user.id);
  }

  /**
   * إجابة في الدفتر — بترجّع الصح على طول (مش زي الكويز الأصلي)، عشان دي
   * مراجعة فورية مش امتحان. ٤٠٤ لو السؤال ده مش من غلطات الطالب ده أصلًا.
   */
  @Post(':questionVersionId/answer')
  @UsePipes(ZodValidationPipe)
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('questionVersionId', ParseUUIDPipe) questionVersionId: string,
    @Body() dto: MistakeAnswerDto,
  ): Promise<MistakeAnswerResult> {
    return this.mistakes.answer(user.id, questionVersionId, dto.optionIds);
  }
}
