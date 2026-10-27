import { createZodDto } from 'nestjs-zod';
import {
  BotAnswerCreateSchema,
  BotAnswerPutSchema,
  BotPreviewRequestSchema,
  BotSettingsSchema,
  LeadPatchSchema,
  WaChatPatchSchema,
  WaReplySchema,
} from '@ayman/contracts/wa-bot/schemas';

export class BotSettingsDto extends createZodDto(BotSettingsSchema) {}
export class BotAnswerPutDto extends createZodDto(BotAnswerPutSchema) {}
export class BotAnswerCreateDto extends createZodDto(BotAnswerCreateSchema) {}
export class BotPreviewDto extends createZodDto(BotPreviewRequestSchema) {}
export class LeadPatchDto extends createZodDto(LeadPatchSchema) {}
export class WaChatPatchDto extends createZodDto(WaChatPatchSchema) {}
export class WaReplyDto extends createZodDto(WaReplySchema) {}
