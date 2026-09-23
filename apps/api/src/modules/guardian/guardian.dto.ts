import { createZodDto } from 'nestjs-zod';
import { GuardianSignInSchema } from '@ayman/contracts/guardian';

export class GuardianSignInDto extends createZodDto(GuardianSignInSchema) {}
