import { createZodDto } from 'nestjs-zod';
import { z } from '@ayman/contracts/zod';
import {
  BookOrderStatusSchema,
  CreateBookOrderSchema,
  SubmitBookOrderPaymentSchema,
} from '@ayman/contracts/book-orders';
import { AdminBookOrderQuerySchema } from '@ayman/contracts/admin/book-orders';

export class CreateBookOrderDto extends createZodDto(CreateBookOrderSchema) {}
export class SubmitBookOrderPaymentDto extends createZodDto(SubmitBookOrderPaymentSchema) {}
export class AdminBookOrderQueryDto extends createZodDto(AdminBookOrderQuerySchema) {}
/** The Excel export's own query — `status` is required, never defaulted.
 *  See `BookOrdersService.exportXlsx`'s own note on why. */
export class ExportBookOrdersQueryDto extends createZodDto(
  z.object({ status: BookOrderStatusSchema }),
) {}
