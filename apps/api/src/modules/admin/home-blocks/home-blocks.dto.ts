import {
  HomeBlockCreateSchema,
  HomeBlockPatchSchema,
  HomeBlockReorderSchema,
} from '@ayman/contracts/admin/home-blocks';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class HomeBlockCreateDto extends createZodDto(HomeBlockCreateSchema) {}
export class HomeBlockPatchDto extends createZodDto(HomeBlockPatchSchema) {}
export class HomeBlockReorderDto extends createZodDto(HomeBlockReorderSchema) {}

export const SetPublishedSchema = z.object({ isPublished: z.boolean() }).strict();
export class SetPublishedDto extends createZodDto(SetPublishedSchema) {}
