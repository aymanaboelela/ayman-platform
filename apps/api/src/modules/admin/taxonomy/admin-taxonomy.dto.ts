import {
  AcademicYearPatchSchema,
  GovernoratePatchSchema,
  SubjectCreateSchema,
  SubjectOfferingPatchSchema,
  SubjectOfferingSchema,
  SubjectPatchSchema,
  SystemPatchSchema,
  TrackCreateSchema,
  TrackPatchSchema,
} from '@ayman/contracts/admin/taxonomy';
import { createZodDto } from 'nestjs-zod';

export class GovernoratePatchDto extends createZodDto(GovernoratePatchSchema) {}
export class SystemPatchDto extends createZodDto(SystemPatchSchema) {}
export class AcademicYearPatchDto extends createZodDto(AcademicYearPatchSchema) {}
export class TrackCreateDto extends createZodDto(TrackCreateSchema) {}
export class TrackPatchDto extends createZodDto(TrackPatchSchema) {}
export class SubjectCreateDto extends createZodDto(SubjectCreateSchema) {}
export class SubjectPatchDto extends createZodDto(SubjectPatchSchema) {}
export class SubjectOfferingCreateDto extends createZodDto(SubjectOfferingSchema) {}
export class SubjectOfferingPatchDto extends createZodDto(SubjectOfferingPatchSchema) {}
