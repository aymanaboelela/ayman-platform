import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { GameBankDetail, GameBankEnsureResult, GameBanks, GameModesConfig } from '@ayman/contracts/quiz/game';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GameModesUpdateDto } from './dto/game-answer.dto';
import { GameBanksService } from './game-banks.service';

/**
 * «أسئلة الألعاب» في لوحة التحكم. نفس صلاحية بنك الأسئلة (`question:write`)
 * لأن الأسئلة نفسها بتتكتب بيه، ونفس فيتشر الألعاب (`quizGame`). وإعدادات كل
 * لعبة (بتسحب منين) تحت نفس الصلاحية: هي نفس سؤال «أنهي أسئلة تتسأل».
 */
@Controller('admin/game-banks')
@RequireFeature('quizGame')
@RequirePermission('question:write')
export class AdminGameBanksController {
  constructor(private readonly banks: GameBanksService) {}

  @Get()
  list(): Promise<GameBanks> {
    return this.banks.list();
  }

  /** كورس واحد: الأسئلة العامة، وكل درس، وإعدادات التلات ألعاب. */
  @Get(':courseId')
  detail(@Param('courseId', ParseUUIDPipe) courseId: string): Promise<GameBankDetail> {
    return this.banks.detail(courseId);
  }

  @Post(':courseId')
  ensure(@Param('courseId', ParseUUIDPipe) courseId: string): Promise<GameBankEnsureResult> {
    return this.banks.ensure(courseId);
  }

  /** تصنيف «أسئلة الألعاب» لدرس — بيتعمل أول مرة، ومرتين = نفس التصنيف. */
  @Post(':courseId/lessons/:lessonId')
  ensureLesson(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<GameBankEnsureResult> {
    return this.banks.ensureLesson(courseId, lessonId);
  }

  /** التلات ألعاب مع بعض — نفس الفورم، فحفظة واحدة. */
  @UsePipes(ZodValidationPipe)
  @Put(':courseId/modes')
  saveModes(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: GameModesUpdateDto,
  ): Promise<GameModesConfig> {
    return this.banks.saveModes(courseId, body.modes);
  }
}
