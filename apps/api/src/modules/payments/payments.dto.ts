import { createZodDto } from 'nestjs-zod';
import { SubmitPaymentSchema } from '@ayman/contracts/payments';
import { AdminPaymentQuerySchema, RejectPaymentSchema } from '@ayman/contracts/admin/payments';

export class SubmitPaymentDto extends createZodDto(SubmitPaymentSchema) {}
export class RejectPaymentDto extends createZodDto(RejectPaymentSchema) {}
export class AdminPaymentQueryDto extends createZodDto(AdminPaymentQuerySchema) {}
