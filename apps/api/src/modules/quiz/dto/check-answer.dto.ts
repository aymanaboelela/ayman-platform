import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Practice mode's instant-feedback request body. `slotPosition` is a route
 * param, not a body field — this carries only the attemptToken, so there is
 * no room here for a client-supplied answer or score; the grading call
 * re-reads the already-saved response itself.
 */
export const CheckAnswerSchema = z.object({ attemptToken: z.string().uuid() }).strict();

export class CheckAnswerDto extends createZodDto(CheckAnswerSchema) {}
