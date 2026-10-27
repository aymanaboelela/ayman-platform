import { createZodDto } from 'nestjs-zod';
import {
  CardReviewSchema,
  DailyAnswerRequestSchema,
  FocusStartSchema,
  LeagueSettingsSchema,
  NoteCreateSchema,
  NoteEditSchema,
  StudyPlanSettingsSchema,
} from '@ayman/contracts/engagement';

export class DailyAnswerDto extends createZodDto(DailyAnswerRequestSchema) {}
export class NoteCreateDto extends createZodDto(NoteCreateSchema) {}
export class NoteEditDto extends createZodDto(NoteEditSchema) {}
export class StudyPlanSettingsDto extends createZodDto(StudyPlanSettingsSchema) {}
export class CardReviewDto extends createZodDto(CardReviewSchema) {}
export class FocusStartDto extends createZodDto(FocusStartSchema) {}
export class LeagueSettingsDto extends createZodDto(LeagueSettingsSchema) {}
