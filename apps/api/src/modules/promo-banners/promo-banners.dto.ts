import {
  PromoBannerCreateSchema,
  PromoBannerPatchSchema,
  PromoBannerReorderSchema,
} from '@ayman/contracts/admin/promo-banners';
import { createZodDto } from 'nestjs-zod';

export class PromoBannerCreateDto extends createZodDto(PromoBannerCreateSchema) {}
export class PromoBannerPatchDto extends createZodDto(PromoBannerPatchSchema) {}
export class PromoBannerReorderDto extends createZodDto(PromoBannerReorderSchema) {}
