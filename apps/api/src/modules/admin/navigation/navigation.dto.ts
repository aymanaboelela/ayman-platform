import {
  NavigationCreateSchema,
  NavigationPatchSchema,
  ReorderSchema,
} from '@ayman/contracts/admin/navigation';
import { createZodDto } from 'nestjs-zod';

export class NavigationCreateDto extends createZodDto(NavigationCreateSchema) {}
export class NavigationPatchDto extends createZodDto(NavigationPatchSchema) {}
export class NavigationReorderDto extends createZodDto(ReorderSchema) {}
