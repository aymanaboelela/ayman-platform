// Imported from the `/content` subpath, not the package root: index.ts
// re-exports through extensionless relative specifiers, which Node's native
// ESM loader cannot resolve at runtime. content.ts has no relative imports of
// its own, so importing it directly sidesteps the barrel. Same reasoning as
// modules/profile/onboarding.dto.ts.
import {
  CourseCreateSchema,
  CourseStatusPatchSchema,
  CourseUpdateSchema,
} from '@ayman/contracts/content';
import { createZodDto } from 'nestjs-zod';

/**
 * Three DTOs, three permissions, on purpose. `CreateCourseDto` and
 * `UpdateCourseDto` contain no `status` field at all, so the only way to publish
 * is through `SetCourseStatusDto` behind `course:publish` — an editor who may
 * fix a typo cannot also push a half-finished course live by adding one key to
 * a PATCH body. Every schema is `.strict()`, so the attempt is a 400, not a
 * silent strip.
 */
export class CreateCourseDto extends createZodDto(CourseCreateSchema) {}
export class UpdateCourseDto extends createZodDto(CourseUpdateSchema) {}
export class SetCourseStatusDto extends createZodDto(CourseStatusPatchSchema) {}
