import { createZodDto } from 'nestjs-zod';
import { PublishDraftsRequestSchema } from '@ayman/contracts/quiz/publish-drafts';

/** `{ categoryId }` or `{ versionIds }` (up to 500) — exactly one of them. */
export class PublishDraftsDto extends createZodDto(PublishDraftsRequestSchema) {}
