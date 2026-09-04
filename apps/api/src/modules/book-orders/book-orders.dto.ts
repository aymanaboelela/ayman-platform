import { createZodDto } from 'nestjs-zod';
import { z } from '@ayman/contracts/zod';
import { CreateBookOrderSchema, SubmitBookOrderPaymentSchema } from '@ayman/contracts/book-orders';
import {
  AdminBookOrderFilterSchema,
  AdminBookOrderQuerySchema,
  AdminCreateBookOrderSchema,
  DeleteBookOrderSchema,
  RejectBookOrderSchema,
} from '@ayman/contracts/admin/book-orders';
import { AdminBookOrderPatchSchema } from '@ayman/contracts/admin/books';

export class CreateBookOrderDto extends createZodDto(CreateBookOrderSchema) {}
export class SubmitBookOrderPaymentDto extends createZodDto(SubmitBookOrderPaymentSchema) {}
export class AdminBookOrderQueryDto extends createZodDto(AdminBookOrderQuerySchema) {}
export class AdminCreateBookOrderDto extends createZodDto(AdminCreateBookOrderSchema) {}
export class AdminBookOrderPatchDto extends createZodDto(AdminBookOrderPatchSchema) {}
/** «ارفض الطلب» / «احذف الطلب» — two routes, two DTOs, one shape.
 *
 *  Deliberately NOT one shared `ReasonDto`: the two reasons are read by
 *  different people (the student reads a rejection, only the admin ever reads a
 *  deletion), and the day one of them grows a field — a category, a
 *  "show to student" flag — a shared class is a change to both routes. */
export class RejectBookOrderDto extends createZodDto(RejectBookOrderSchema) {}
export class DeleteBookOrderDto extends createZodDto(DeleteBookOrderSchema) {}
/** The Excel export's own query — `status` is required, never defaulted.
 *  See `BookOrdersService.exportXlsx`'s own note on why, and why it is the
 *  LIST's filter («المحذوفة» included) rather than a bare status. */
export class ExportBookOrdersQueryDto extends createZodDto(
  z.object({ status: AdminBookOrderFilterSchema }),
) {}
