import {
  SocialConnectionWriteSchema,
  SocialMarkPublishedSchema,
  SocialPostPatchSchema,
} from '@ayman/contracts/social/posts';
import { createZodDto } from 'nestjs-zod';

export class SocialPostPatchDto extends createZodDto(SocialPostPatchSchema) {}
export class SocialMarkPublishedDto extends createZodDto(SocialMarkPublishedSchema) {}
export class SocialConnectionWriteDto extends createZodDto(SocialConnectionWriteSchema) {}
