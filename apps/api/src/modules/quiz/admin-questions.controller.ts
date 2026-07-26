import { Body, Controller, Get, Param, Post, Patch, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { BulkImportDto } from './dto/bulk-import.dto';
import { CreateCategoryDto } from './dto/category.dto';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { QuestionBankService } from './question-bank.service';

@Controller('admin/questions')
@RequirePermission('question:write')
@UsePipes(ZodValidationPipe)
export class AdminQuestionsController {
  constructor(private readonly bank: QuestionBankService) {}

  // Registered BEFORE `@Get()`'s sibling param-free list route matters only
  // if a future param route (`:bankEntryId`) is ever added to GET — there
  // isn't one today, but static-before-param is the safe habit regardless.
  @Get('categories')
  listCategories() {
    return this.bank.listCategories();
  }

  @Post('categories')
  createCategory(@Body() body: CreateCategoryDto) {
    return this.bank.createCategory(body.name);
  }

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

  @Get(':bankEntryId')
  getForEdit(@Param('bankEntryId') bankEntryId: string) {
    return this.bank.getForEdit(bankEntryId);
  }

  @Patch(':bankEntryId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bankEntryId') bankEntryId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.bank.saveDraft(bankEntryId, body, user.id);
  }

  // Wrapped in a plain object — Nest's Express adapter sends a bare string or
  // `void` return as `response.send(String(body))`, not valid JSON, and every
  // browser caller here does `await response.json()` (see the identical note
  // on `AdminQuizzesController`).
  @Post(':versionId/publish')
  async publish(@Param('versionId') versionId: string) {
    await this.bank.publish(versionId);
    return { ok: true };
  }

  @Post(':bankEntryId/duplicate')
  async duplicate(@CurrentUser() user: AuthenticatedUser, @Param('bankEntryId') bankEntryId: string) {
    return { bankEntryId: await this.bank.duplicate(bankEntryId, user.id) };
  }

  @Post('bulk')
  bulk(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkImportDto) {
    return this.bank.bulkImport(body.text, body.categoryId, user.id);
  }
}
