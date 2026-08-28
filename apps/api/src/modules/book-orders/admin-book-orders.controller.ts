import { Controller, Get, NotFoundException, Param, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import { AdminBookOrderQueryDto, ExportBookOrdersQueryDto } from './book-orders.dto';
import { BookOrdersService } from './book-orders.service';

/**
 * `/admin/books` — الكتاب الورقي, the shipping queue. `book-order:read` sees
 * it; `book-order:ship` decides «اتشحن» — see the permission catalogue's own
 * note on why the two are split even though a book order grants no access.
 */
@Controller('admin/book-orders')
export class AdminBookOrdersController {
  constructor(
    private readonly bookOrders: BookOrdersService,
    private readonly media: MediaService,
  ) {}

  @RequirePermission('book-order:read')
  @Get()
  @UsePipes(ZodValidationPipe)
  list(@Query() query: AdminBookOrderQueryDto) {
    return this.bookOrders.adminList(query);
  }

  /**
   * The proof-of-payment screenshot — gated by permission rather than an
   * unguessable key, same reasoning as `AdminPaymentsController.screenshot`.
   */
  @RequirePermission('book-order:read')
  @Get(':id/screenshot')
  async screenshot(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const key = await this.bookOrders.screenshotKeyFor(id);
    const info = await this.media.statByKey(key);
    if (!info) throw new NotFoundException();

    response.set({
      'Content-Type': OUTPUT_MIME,
      'Content-Length': String(info.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    (await this.media.streamByKey(key)).pipe(response);
  }

  /**
   * The shipping-desk spreadsheet. `status` is a required, explicit query
   * param — see `BookOrdersService.exportXlsx`'s own note on why this is
   * never a silent default.
   */
  @RequirePermission('book-order:read')
  @Get('export')
  @UsePipes(ZodValidationPipe)
  async export(@Query() query: ExportBookOrdersQueryDto, @Res() response: Response): Promise<void> {
    const buffer = await this.bookOrders.exportXlsx(query.status);
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="book-orders-${query.status}.xlsx"`,
      'Cache-Control': 'private, no-store',
    });
    response.send(buffer);
  }

  @RequirePermission('book-order:ship')
  @Post(':id/ship')
  markShipped(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookOrders.markShipped(user.id, id);
  }
}
