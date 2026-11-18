import { createZodDto } from 'nestjs-zod';
import {
  DailyEssayBatchSchema,
  DailyEssayMarkSchema,
  DailyEssaySubmitSchema,
  DailyEssayUpdateSchema,
} from '@ayman/contracts/daily-essay';

export class SubmitDailyEssayDto extends createZodDto(DailyEssaySubmitSchema) {}
export class CreateDailyEssaysDto extends createZodDto(DailyEssayBatchSchema) {}
export class UpdateDailyEssayDto extends createZodDto(DailyEssayUpdateSchema) {}
export class MarkDailyEssayDto extends createZodDto(DailyEssayMarkSchema) {}
