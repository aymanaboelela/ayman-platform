import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type {
  ExternalBookDetail,
  ExternalBookRow,
  ExternalBooks,
} from '@ayman/contracts/quiz/external-books';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  CreateExternalBookDto,
  CreateExternalBookLessonDto,
  CreateExternalBookUnitDto,
  RenameExternalBookCategoryDto,
  UpdateExternalBookDto,
} from './dto/external-books.dto';
import { ExternalBooksService } from './external-books.service';

/**
 * «أسئلة كتب خارجية» في لوحة التحكم. نفس صلاحية بنك الأسئلة (`question:write`)
 * لأن الأسئلة نفسها بتتكتب بيه — نفس القاعدة اللي «أسئلة الألعاب» ماشية
 * عليها. مفيش فيتشر فلاج: الشاشة دي للكل، مش أيمن بس.
 */
@Controller('admin/external-books')
@RequirePermission('question:write')
@UsePipes(ZodValidationPipe)
export class AdminExternalBooksController {
  constructor(private readonly books: ExternalBooksService) {}

  @Get()
  list(): Promise<ExternalBooks> {
    return this.books.list();
  }

  @Post()
  create(@Body() body: CreateExternalBookDto): Promise<ExternalBookRow> {
    return this.books.create(body.title);
  }

  @Get(':bookId')
  detail(@Param('bookId') bookId: string): Promise<ExternalBookDetail> {
    return this.books.detail(bookId);
  }

  @Patch(':bookId')
  update(@Param('bookId') bookId: string, @Body() body: UpdateExternalBookDto): Promise<ExternalBookRow> {
    return this.books.update(bookId, body);
  }

  @Post(':bookId/units')
  createUnit(@Param('bookId') bookId: string, @Body() body: CreateExternalBookUnitDto) {
    return this.books.createUnit(bookId, body.name);
  }

  @Post(':bookId/units/:unitId/lessons')
  createLesson(
    @Param('bookId') bookId: string,
    @Param('unitId') unitId: string,
    @Body() body: CreateExternalBookLessonDto,
  ) {
    return this.books.createLesson(bookId, unitId, body.name);
  }

  @Patch('categories/:categoryId')
  renameCategory(@Param('categoryId') categoryId: string, @Body() body: RenameExternalBookCategoryDto) {
    return this.books.renameCategory(categoryId, body.name);
  }

  @HttpCode(204)
  @Delete('categories/:categoryId')
  deleteCategory(@Param('categoryId') categoryId: string): Promise<void> {
    return this.books.deleteCategory(categoryId);
  }
}
