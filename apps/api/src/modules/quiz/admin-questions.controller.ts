import { Body, Controller, Get, HttpCode, Param, Post, Patch, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { BulkImportDto } from './dto/bulk-import.dto';
import { CreateCategoryDto } from './dto/category.dto';
import { CreateQuestionDto, UpdateQuestionDto } from './dto/question.dto';
import { QuestionRemovalDto } from './dto/question-removal.dto';
import { QuestionTypeSchema } from '@ayman/contracts/quiz/question';
import { QuestionBankService } from './question-bank.service';
import { QuestionRemovalService } from './question-removal.service';

@Controller('admin/questions')
@RequirePermission('question:write')
@UsePipes(ZodValidationPipe)
export class AdminQuestionsController {
  constructor(
    private readonly bank: QuestionBankService,
    private readonly removal: QuestionRemovalService,
  ) {}

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
    /* The service has always supported this and the controller never passed
       it, so «ورّيني الاختيار من متعدد بس» was built and unreachable. Parsed
       through the enum rather than cast: it lands in a Prisma `where`, and an
       unrecognised value should read as "no filter" rather than as a 500. */
    @Query('type') type?: string,
    @Query('take') take = '50',
    @Query('skip') skip = '0',
    /* «اللي اتشالت» — the archived questions, and nothing else. Anything but
       `1` is the bank itself, so every existing caller (the slot picker, the
       games screen's links) keeps seeing only what is still in it. */
    @Query('archived') archived?: string,
  ) {
    return this.bank.list({
      categoryId,
      search,
      type: QuestionTypeSchema.safeParse(type).data,
      archived: archived === '1',
      take: Math.min(Number(take) || 50, 200),
      skip: Number(skip) || 0,
    });
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateQuestionDto) {
    return this.bank.create(body, user.id);
  }

  /*
   * «امسح السؤال» — two routes, one per click. The plan is what the confirm
   * dialog shows (which questions go for good, which leave the bank and keep
   * their results, which a quiz still holds); the delete decides the same
   * thing again inside its own transaction and does it. POST, not DELETE: the
   * body is a list of up to 200 ids, and a DELETE body is ignored by half the
   * proxies between a browser and here.
   *
   * Both are static segments declared before `:bankEntryId` — the same
   * static-before-param habit as `categories` above.
   */
  @Post('delete-plan')
  @HttpCode(200)
  planRemoval(@Body() body: QuestionRemovalDto) {
    return this.removal.plan(body.ids);
  }

  @Post('delete')
  @HttpCode(200)
  remove(@Body() body: QuestionRemovalDto) {
    return this.removal.remove(body.ids);
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

  /** «رجّعه للبنك» — the undo for an archive. */
  @Post(':bankEntryId/restore')
  @HttpCode(200)
  restore(@Param('bankEntryId') bankEntryId: string) {
    return this.removal.restore(bankEntryId);
  }

  @Post(':bankEntryId/duplicate')
  async duplicate(@CurrentUser() user: AuthenticatedUser, @Param('bankEntryId') bankEntryId: string) {
    return { bankEntryId: await this.bank.duplicate(bankEntryId, user.id) };
  }

  @Post('bulk')
  bulk(@CurrentUser() user: AuthenticatedUser, @Body() body: BulkImportDto) {
    return this.bank.bulkImport(body.text, body.categoryId, user.id, { lessonId: body.lessonId, status: body.status });
  }
}
