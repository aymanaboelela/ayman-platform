import {
  AdminExpenseCreateSchema,
  AdminExpensePatchSchema,
  AdminExpenseQuerySchema,
} from '@ayman/contracts/admin/expenses';
import { createZodDto } from 'nestjs-zod';

export class AdminExpenseCreateDto extends createZodDto(AdminExpenseCreateSchema) {}
export class AdminExpensePatchDto extends createZodDto(AdminExpensePatchSchema) {}
export class AdminExpenseQueryDto extends createZodDto(AdminExpenseQuerySchema) {}
