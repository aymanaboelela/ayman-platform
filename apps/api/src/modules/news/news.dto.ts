import { NewsCreateSchema, NewsPatchSchema, NewsSetPublishedSchema } from '@ayman/contracts/news';
import { createZodDto } from 'nestjs-zod';

export class NewsCreateDto extends createZodDto(NewsCreateSchema) {}
export class NewsPatchDto extends createZodDto(NewsPatchSchema) {}
export class NewsSetPublishedDto extends createZodDto(NewsSetPublishedSchema) {}
