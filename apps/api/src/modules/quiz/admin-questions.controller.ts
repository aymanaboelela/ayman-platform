import { Body, Controller, Get, Param, Post, Patch, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { QuestionBankService } from './question-bank.service';

@Controller('admin/questions')
@RequirePermission('question:write')
@UsePipes(ZodValidationPipe)
export class AdminQuestionsController {
  constructor(private readonly bank: QuestionBankService) {}

  @Get()
  list(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
  ) {
    return this.bank.list({
      categoryId,
      search,
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateQuestionDto) {
    return this.bank.create(body, user.id);
  }

  @Patch(':bankEntryId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bankEntryId') bankEntryId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.bank.saveDraft(bankEntryId, body, user.id);
  }

  @Post(':versionId/publish')
  publish(@Param('versionId') versionId: string) {
    return this.bank.publish(versionId);
  }

  @Post(':bankEntryId/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('bankEntryId') bankEntryId: string) {
    return this.bank.duplicate(bankEntryId, user.id);
  }
}
