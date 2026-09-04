import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import type { BookOrder } from '@ayman/contracts/book-orders';
import type {
  DeleteBookOrderResult,
  MarkBookOrderDeliveredResult,
  RejectBookOrderResult,
  RestoreBookOrderResult,
} from '@ayman/contracts/admin/book-orders';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService } from '../media/media.service';
import { RequireCsrf } from '../security/require-csrf.decorator';
import {
  AdminBookOrderPatchDto,
  AdminBookOrderQueryDto,
  AdminCreateBookOrderDto,
  DeleteBookOrderDto,
  ExportBookOrdersQueryDto,
  RejectBookOrderDto,
} from './book-orders.dto';
import { BookOrdersService } from './book-orders.service';

/**
 * `/admin/books` — الكتاب الورقي, the shipping queue. `book-order:read` sees
 * it; `book-order:ship` decides where the parcel got to — «اتشحن» and «وصل»,
 * the two halves of the courier leg, on the same authority because they are
 * the same desk closing the same parcel one step apart.
 *
 * The three JUDGEMENTS about an order — «ارفض», «احذف», «رجّعه» — sit on
 * `book-order:write` beside editing the basket instead. Moving a parcel along
 * is fulfilment; deciding an order should not happen changes what somebody who
 * has already been quoted a number gets, and a shipping clerk should plausibly
 * hold the first and never the second. See the permission catalogue's own note.
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

  /** The book-order revenue tile on `/admin/finance` — see
   *  `BookOrdersService.adminRevenueSummary`'s own note on why it is its own
   *  route rather than something `FinanceService` reaches into this module
   *  for. */
  @RequirePermission('book-order:read')
  @Get('summary')
  summary() {
    return this.bookOrders.adminRevenueSummary();
  }

  /**
   * «أضف طلب كتاب» — an admin recording a customer's order directly, rather
   * than the customer going through the public/guest form. See
   * `BookOrdersService.adminCreate` for what this actually writes.
   */
  @RequirePermission('book-order:create')
  @RequireCsrf()
  @Post()
  @UsePipes(ZodValidationPipe)
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: AdminCreateBookOrderDto): Promise<BookOrder> {
    return this.bookOrders.adminCreate(user.id, body);
  }

  /**
   * «أعدل الطلب» — the basket, the delivery fee, the discount, the address and
   * the internal note, in one PATCH.
   *
   * One route rather than four because changing a quantity and waiving the
   * delivery fee is one decision made in one phone call, and splitting it would
   * let an order sit half-edited between two requests with its total disagreeing
   * with its lines — a state the database rejects anyway, as a 500 the admin
   * cannot act on. `book-order:write` and not `book-order:create`: inventing an
   * order and changing what an already-quoted customer owes are different
   * risks. See `BookOrdersService.adminPatch` for what is deliberately NOT
   * editable here.
   */
  @RequirePermission('book-order:write')
  @RequireCsrf()
  @Patch(':id')
  @UsePipes(ZodValidationPipe)
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AdminBookOrderPatchDto,
  ): Promise<BookOrder> {
    return this.bookOrders.adminPatch(user.id, id, body);
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
  @RequireCsrf()
  @Post(':id/ship')
  markShipped(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookOrders.markShipped(user.id, id);
  }

  /**
   * «وصل» — the arrival confirmation, and the notification that goes with it.
   *
   * `book-order:ship` and not `book-order:write`: this is the same person, on
   * the same row, one step after «اتشحن». It takes no body — there is nothing
   * to say about a parcel arriving beyond that it did, and the WHO is the
   * session. See `BookOrdersService.markDelivered` for why it is reachable from
   * `paid` as well as `shipped`.
   */
  @RequirePermission('book-order:ship')
  @RequireCsrf()
  @Post(':id/deliver')
  markDelivered(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkBookOrderDeliveredResult> {
    return this.bookOrders.markDelivered(user.id, id);
  }

  /**
   * «ارفض الطلب» — turn it down, with a reason the student reads verbatim.
   *
   * `book-order:write`, not `book-order:ship`: this decides that an order
   * somebody has already been quoted a price for is not going to happen.
   */
  @RequirePermission('book-order:write')
  @RequireCsrf()
  @Post(':id/reject')
  @UsePipes(ZodValidationPipe)
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RejectBookOrderDto,
  ): Promise<RejectBookOrderResult> {
    return this.bookOrders.reject(user.id, id, body.reason);
  }

  /**
   * «احذف الطلب» — hide it from every working list. SOFT: see
   * `BookOrdersService.softDelete` for why the row survives and why the student
   * is told nothing.
   *
   * A `DELETE` with a BODY, which is unusual and is deliberate: the reason is
   * mandatory, and putting it in a query string would print it in every access
   * log and proxy trace on the way. Express and Nest both parse it; the web
   * client sends it as JSON like any other write.
   */
  @RequirePermission('book-order:write')
  @RequireCsrf()
  @Delete(':id')
  @UsePipes(ZodValidationPipe)
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: DeleteBookOrderDto,
  ): Promise<DeleteBookOrderResult> {
    return this.bookOrders.softDelete(user.id, id, body.reason);
  }

  /** «رجّعه» — undo a deletion. No body: putting something back is not a
   *  decision anybody has to justify, and the audit row records who did it. */
  @RequirePermission('book-order:write')
  @RequireCsrf()
  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RestoreBookOrderResult> {
    return this.bookOrders.restore(user.id, id);
  }
}
