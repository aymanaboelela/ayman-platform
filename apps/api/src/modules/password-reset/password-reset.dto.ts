import { createZodDto } from 'nestjs-zod';
import { PasswordResetConfirmSchema, PasswordResetRequestSchema } from '@ayman/contracts/password-reset';

export class PasswordResetRequestDto extends createZodDto(PasswordResetRequestSchema) {}
export class PasswordResetConfirmDto extends createZodDto(PasswordResetConfirmSchema) {}
