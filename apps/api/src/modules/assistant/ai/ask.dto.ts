import { AskRequestSchema } from '@ayman/contracts/assistant/ask';
import { createZodDto } from 'nestjs-zod';

/**
 * `POST /api/assistant/ask`.
 *
 * `.strict()` in the contract, which is what closes the door on a body that
 * carries `system`, `model`, `max_tokens` or anything else shaped like a knob
 * on the model behind it. There are no knobs on this route: the question, the
 * history, and nothing else reaches `AssistantAiService`.
 */
export class AskDto extends createZodDto(AskRequestSchema) {}
