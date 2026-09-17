import {
  LessonCreateSchema,
  LessonResourceInputSchema,
  LessonResourceUpdateSchema,
  LessonTextInputSchema,
  LessonUpdateSchema,
  ReorderSchema,
} from '@ayman/contracts/content';
import { LessonVideoInputSchema } from '@ayman/contracts/video';
import {
  VideoUploadAbortSchema,
  VideoUploadCompleteSchema,
  VideoUploadStartSchema,
} from '@ayman/contracts/admin/video-upload';
import { createZodDto } from 'nestjs-zod';

export class CreateLessonDto extends createZodDto(LessonCreateSchema) {}
export class UpdateLessonDto extends createZodDto(LessonUpdateSchema) {}
/**
 * The DTO's INPUT type has `url`; its OUTPUT type has `externalId` and no `url`
 * at all. By the time the controller's `@Body()` is typed, the URL no longer
 * exists as a value the service could accidentally persist.
 */
export class SetLessonVideoDto extends createZodDto(LessonVideoInputSchema) {}
export class SetLessonTextDto extends createZodDto(LessonTextInputSchema) {}

/*
 * «الرفع المباشر» — the three messages around an upload the API never carries.
 *
 * None of them contains a key. `videoId` is matched against `UPLOAD_ID_RE`
 * here and again in the service, and every object key is BUILT from it — so
 * there is no code path where a caller-supplied string reaches the bucket as a
 * path, which is what keeps traversal structurally absent rather than filtered.
 */
export class StartVideoUploadDto extends createZodDto(VideoUploadStartSchema) {}
export class CompleteVideoUploadDto extends createZodDto(VideoUploadCompleteSchema) {}
export class AbortVideoUploadDto extends createZodDto(VideoUploadAbortSchema) {}
/**
 * Same input/output asymmetry as `SetLessonVideoDto` above, for the same
 * reason: a video resource's INPUT has `provider` + `url`, its OUTPUT has
 * `videoProvider` + `videoExternalId` and no `url` at all. The transform also
 * nulls every payload column that does not belong to the declared kind, so the
 * service cannot persist a document carrying a link even if one is posted.
 */
export class AddResourceDto extends createZodDto(LessonResourceInputSchema) {}
export class UpdateResourceDto extends createZodDto(LessonResourceUpdateSchema) {}
export class ReorderDto extends createZodDto(ReorderSchema) {}
