import { createZodDto } from 'nestjs-zod';
import {
  DailyAnswerRequestSchema,
  NoteCreateSchema,
  NoteEditSchema,
  StudyPlanSettingsSchema,
} from '@ayman/contracts/engagement';

export class DailyAnswerDto extends createZodDto(DailyAnswerRequestSchema) {}
export class NoteCreateDto extends createZodDto(NoteCreateSchema) {}
export class NoteEditDto extends createZodDto(NoteEditSchema) {}
export class StudyPlanSettingsDto extends createZodDto(StudyPlanSettingsSchema) {}
