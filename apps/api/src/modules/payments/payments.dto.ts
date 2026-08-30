import { createZodDto } from 'nestjs-zod';
import { SubmitPaymentSchema } from '@ayman/contracts/payments';
import {
  AdminManualSubscribeSchema,
  AdminPaymentQuerySchema,
  RejectPaymentSchema,
} from '@ayman/contracts/admin/payments';
import {
  AdminFinanceCancelSchema,
  AdminFinanceEditAmountSchema,
  AdminFinanceEditDatesSchema,
  AdminFinanceQuerySchema,
} from '@ayman/contracts/admin/finance';

export class SubmitPaymentDto extends createZodDto(SubmitPaymentSchema) {}
export class RejectPaymentDto extends createZodDto(RejectPaymentSchema) {}
export class AdminPaymentQueryDto extends createZodDto(AdminPaymentQuerySchema) {}
export class AdminFinanceQueryDto extends createZodDto(AdminFinanceQuerySchema) {}
export class AdminManualSubscribeDto extends createZodDto(AdminManualSubscribeSchema) {}
export class AdminFinanceEditAmountDto extends createZodDto(AdminFinanceEditAmountSchema) {}
export class AdminFinanceEditDatesDto extends createZodDto(AdminFinanceEditDatesSchema) {}
export class AdminFinanceCancelDto extends createZodDto(AdminFinanceCancelSchema) {}
