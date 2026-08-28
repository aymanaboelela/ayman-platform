import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MAX_UPLOAD_BYTES } from '@ayman/contracts/admin/media';
import type { BookOrder } from '@ayman/contracts/book-orders';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { CreateBookOrderDto, SubmitBookOrderPaymentDto } from './book-orders.dto';
import { BookOrdersService } from './book-orders.service';

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * The student half. `book-order:submit` is self-scoped — every method here
 * reads `user.id` from the session and never a route parameter, same
 * discipline as `PaymentsController`.
 */
@Controller('book-orders')
export class BookOrdersController {
  constructor(private readonly bookOrders: BookOrdersService) {}

  /** Step one of the two-step upload — same shape as `PaymentsController`. */
  @RequirePermission('book-order:submit')
  @Post('screenshot')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async uploadScreenshot(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.bookOrders.uploadScreenshot(file);
  }

  /** The address form — saved BEFORE any payment. */
  @RequirePermission('book-order:submit')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateBookOrderDto): Promise<BookOrder> {
    return this.bookOrders.create(user.id, body);
  }

  /** The payment — moves an existing order from `address_only` to `paid`. */
  @RequirePermission('book-order:submit')
  @Post(':id/payment')
  submitPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SubmitBookOrderPaymentDto,
  ): Promise<BookOrder> {
    return this.bookOrders.submitPayment(user.id, id, body);
  }

  @RequirePermission('book-order:submit')
  @Get('mine')
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<BookOrder[]> {
    return this.bookOrders.listMine(user.id);
  }
}
