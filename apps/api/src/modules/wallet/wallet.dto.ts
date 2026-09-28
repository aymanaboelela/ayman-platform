import { createZodDto } from 'nestjs-zod';
import { SubmitWalletTopupSchema, WalletPurchaseSchema } from '@ayman/contracts/wallet';
import {
  AdminApproveWalletTopupSchema,
  AdminRejectWalletTopupSchema,
  AdminWalletCreditSchema,
  AdminWalletDebitSchema,
  AdminWalletSearchQuerySchema,
  AdminWalletTopupQuerySchema,
} from '@ayman/contracts/admin/wallet';

export class SubmitWalletTopupDto extends createZodDto(SubmitWalletTopupSchema) {}
export class WalletPurchaseDto extends createZodDto(WalletPurchaseSchema) {}
export class AdminWalletCreditDto extends createZodDto(AdminWalletCreditSchema) {}
export class AdminWalletDebitDto extends createZodDto(AdminWalletDebitSchema) {}
export class AdminWalletSearchQueryDto extends createZodDto(AdminWalletSearchQuerySchema) {}
export class AdminWalletTopupQueryDto extends createZodDto(AdminWalletTopupQuerySchema) {}
export class AdminApproveWalletTopupDto extends createZodDto(AdminApproveWalletTopupSchema) {}
export class AdminRejectWalletTopupDto extends createZodDto(AdminRejectWalletTopupSchema) {}
