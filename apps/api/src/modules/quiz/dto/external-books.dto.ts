import { createZodDto } from 'nestjs-zod';
import {
  CreateExternalBookLessonSchema,
  CreateExternalBookSchema,
  CreateExternalBookUnitSchema,
  RenameExternalBookCategorySchema,
  UpdateExternalBookSchema,
} from '@ayman/contracts/quiz/external-books';

export class CreateExternalBookDto extends createZodDto(CreateExternalBookSchema) {}
export class UpdateExternalBookDto extends createZodDto(UpdateExternalBookSchema) {}
export class CreateExternalBookUnitDto extends createZodDto(CreateExternalBookUnitSchema) {}
export class CreateExternalBookLessonDto extends createZodDto(CreateExternalBookLessonSchema) {}
export class RenameExternalBookCategoryDto extends createZodDto(RenameExternalBookCategorySchema) {}
