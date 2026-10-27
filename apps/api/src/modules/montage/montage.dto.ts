import {
  MontagePublishSchema,
  MontageUploadCompleteSchema,
  MontageUploadResumeSchema,
  MontageUploadStartSchema,
  MontageVideoPatchSchema,
} from '@ayman/contracts/montage';
import { createZodDto } from 'nestjs-zod';

export class MontageUploadStartDto extends createZodDto(MontageUploadStartSchema) {}
export class MontageUploadResumeDto extends createZodDto(MontageUploadResumeSchema) {}
export class MontageUploadCompleteDto extends createZodDto(MontageUploadCompleteSchema) {}
export class MontageVideoPatchDto extends createZodDto(MontageVideoPatchSchema) {}
export class MontagePublishDto extends createZodDto(MontagePublishSchema) {}
