import { createZodDto } from 'nestjs-zod';
import { z } from '@ayman/contracts/zod';
import {
  BookOrderStatusSchema,
  CreateBookOrderSchema,
  SubmitBookOrderPaymentSchema,
} from '@ayman/contracts/book-orders';
import { AdminBookOrderQuerySchema, AdminCreateBookOrderSchema } from '@ayman/contracts/admin/book-orders';
import { AdminBookOrderPatchSchema } from '@ayman/contracts/admin/books';

export class CreateBookOrderDto extends createZodDto(CreateBookOrderSchema) {}
export class SubmitBookOrderPaymentDto extends createZodDto(SubmitBookOrderPaymentSchema) {}
export class AdminBookOrderQueryDto extends createZodDto(AdminBookOrderQuerySchema) {}
export class AdminCreateBookOrderDto extends createZodDto(AdminCreateBookOrderSchema) {}
export class AdminBookOrderPatchDto extends createZodDto(AdminBookOrderPatchSchema) {}
/** The Excel export's own query — `status` is required, never defaulted.
 *  See `BookOrdersService.exportXlsx`'s own note on why. */
export class ExportBookOrdersQueryDto extends createZodDto(
  z.object({ status: BookOrderStatusSchema }),
) {}
