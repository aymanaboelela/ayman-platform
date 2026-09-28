import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { GameBankEnsureResult, GameBanks } from '@ayman/contracts/quiz/game';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { GameBanksService } from './game-banks.service';

/**
 * «أسئلة الألعاب» في لوحة التحكم. نفس صلاحية بنك الأسئلة (`question:write`)
 * لأن الأسئلة نفسها بتتكتب بيه، ونفس فيتشر الألعاب (`quizGame`).
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

  @Post(':courseId')
  ensure(@Param('courseId', ParseUUIDPipe) courseId: string): Promise<GameBankEnsureResult> {
    return this.banks.ensure(courseId);
  }
}
