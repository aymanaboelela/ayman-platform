import {
  LessonAttachmentInputSchema,
  LessonCreateSchema,
  LessonTextInputSchema,
  LessonUpdateSchema,
  ReorderSchema,
} from '@ayman/contracts/content';
import { LessonVideoInputSchema } from '@ayman/contracts/video';
import { createZodDto } from 'nestjs-zod';

export class CreateLessonDto extends createZodDto(LessonCreateSchema) {}
export class UpdateLessonDto extends createZodDto(LessonUpdateSchema) {}
/**
 * The DTO's INPUT type has `url`; its OUTPUT type has `externalId` and no `url`
 * at all. By the time the controller's `@Body()` is typed, the URL no longer
 * exists as a value the service could accidentally persist.
 */
export class SetLessonVideoDto extends createZodDto(LessonVideoInputSchema) {}
export class SetLessonTextDto extends createZodDto(LessonTextInputSchema) {}
export class AddAttachmentDto extends createZodDto(LessonAttachmentInputSchema) {}
export class ReorderDto extends createZodDto(ReorderSchema) {}
