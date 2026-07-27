import { MediaPatchSchema } from '@ayman/contracts/admin/media';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class MediaPatchDto extends createZodDto(MediaPatchSchema) {}

export const MediaListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(40),
  includeArchived: z.coerce.boolean().default(false),
});

export class MediaListQueryDto extends createZodDto(MediaListQuerySchema) {}
