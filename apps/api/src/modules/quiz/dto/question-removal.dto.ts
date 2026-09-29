import { createZodDto } from 'nestjs-zod';
import { QuestionRemovalRequestSchema } from '@ayman/contracts/quiz/question-removal';

/** `{ ids }` — one to 200 bank entry ids, for both the plan and the delete. */
export class QuestionRemovalDto extends createZodDto(QuestionRemovalRequestSchema) {}
