import { PdfCreateSchema, PdfPatchSchema, PdfSetPublishedSchema } from '@ayman/contracts/pdfs';
import { createZodDto } from 'nestjs-zod';

export class PdfCreateDto extends createZodDto(PdfCreateSchema) {}
export class PdfPatchDto extends createZodDto(PdfPatchSchema) {}
export class PdfSetPublishedDto extends createZodDto(PdfSetPublishedSchema) {}
