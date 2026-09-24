import {
  AdminUnlockCodeCreateSchema,
  AdminUnlockCodeQuerySchema,
} from '@ayman/contracts/admin/unlock-codes';
import { RedeemUnlockCodeSchema } from '@ayman/contracts/unlock-codes';
import { createZodDto } from 'nestjs-zod';

export class AdminUnlockCodeCreateDto extends createZodDto(AdminUnlockCodeCreateSchema) {}
export class AdminUnlockCodeQueryDto extends createZodDto(AdminUnlockCodeQuerySchema) {}
export class RedeemUnlockCodeDto extends createZodDto(RedeemUnlockCodeSchema) {}
