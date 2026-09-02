import { Body, Controller, Delete, Get, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import type { AdminBookRow } from '@ayman/contracts/admin/books';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { AdminBookCreateDto, AdminBookPatchDto } from './books.dto';
import { BooksService } from './books.service';

/**
 * «قسم الكتب» — the shelf, from the admin side.
 *
 * `book:read` / `book:write` and never `book-order:*`: what is ON SALE and what
 * somebody has BOUGHT are different objects with different risks. See the note
 * in `permissions.ts` for why that split is worth two more strings.
 */
@Controller('admin/books')
@UsePipes(ZodValidationPipe)
export class AdminBooksController {
  constructor(private readonly books: BooksService) {}

  @RequirePermission('book:read')
  @Get()
  list(): Promise<AdminBookRow[]> {
    return this.books.adminList();
  }

  @RequirePermission('book:write')
  @RequireCsrf()
  @Post()
  create(
    @Body() body: AdminBookCreateDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminBookRow> {
    return this.books.create(user.id, body);
  }

  @RequirePermission('book:write')
  @RequireCsrf()
  @Patch(':id')
  patch(
    @Param('id') id: string,
    @Body() body: AdminBookPatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AdminBookRow> {
    return this.books.patch(user.id, id, body);
  }

  /**
   * Deleting a book leaves every order that bought it intact — the line keeps
   * its own title and price and its `book_id` goes null. Still the rarer
   * action: the screen leads with «اخفيه», because a title that comes back next
   * term should not have to be retyped.
   */
  @RequirePermission('book:write')
  @RequireCsrf()
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.books.remove(user.id, id);
    return { ok: true };
  }
}
