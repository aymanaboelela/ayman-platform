import {
  PracticeQuestionBatchSchema,
  PracticeQuestionInputSchema,
  PracticeQuestionReorderSchema,
  PracticeSetCreateSchema,
  PracticeSetPatchSchema,
} from '@ayman/contracts/practice';
import { createZodDto } from 'nestjs-zod';

export class PracticeSetCreateDto extends createZodDto(PracticeSetCreateSchema) {}
export class PracticeSetPatchDto extends createZodDto(PracticeSetPatchSchema) {}
export class PracticeQuestionBatchDto extends createZodDto(PracticeQuestionBatchSchema) {}
export class PracticeQuestionInputDto extends createZodDto(PracticeQuestionInputSchema) {}
export class PracticeQuestionReorderDto extends createZodDto(PracticeQuestionReorderSchema) {}
