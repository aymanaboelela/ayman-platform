import { createZodDto } from 'nestjs-zod';
import { CheckoutIntentInputSchema } from '@ayman/contracts/outreach/auto';

export class CheckoutIntentDto extends createZodDto(CheckoutIntentInputSchema) {}
