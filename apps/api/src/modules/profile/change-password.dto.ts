import { AdminChangePasswordSchema } from '@ayman/contracts/admin/profile';
import { createZodDto } from 'nestjs-zod';

/**
 * The admin's schema, on purpose: one password rule (8–128, `revokeOtherSessions`
 * off by default) for every self-change on the platform.
 */
export class ChangeOwnPasswordDto extends createZodDto(AdminChangePasswordSchema) {}
