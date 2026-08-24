import { createZodDto } from 'nestjs-zod';
import { z } from '@ayman/contracts/zod';
import {
  AudienceSchema,
  CampaignCreateSchema,
  CampaignPatchSchema,
  PacingSchema,
} from '@ayman/contracts/marketing/campaign';

export class CampaignCreateDto extends createZodDto(CampaignCreateSchema) {}
export class CampaignPatchDto extends createZodDto(CampaignPatchSchema) {}

/** The audience picker's live count — takes the pacing too, so the estimate
 *  it shows is the estimate the campaign would actually run at. */
export const AudiencePreviewRequestSchema = z.object({
  audience: AudienceSchema,
  pacing: PacingSchema,
});
export class AudiencePreviewDto extends createZodDto(AudiencePreviewRequestSchema) {}

export const OptOutCreateSchema = z.object({
  phone: z.string().trim().min(6).max(20),
  reason: z.string().trim().max(300).nullable(),
});
export class OptOutCreateDto extends createZodDto(OptOutCreateSchema) {}
