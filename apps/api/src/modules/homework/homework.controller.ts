import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { MAX_UPLOAD_BYTES, OUTPUT_MIME } from '@ayman/contracts/admin/media';
import type { MyHomeworkSubmission, StudentHomework } from '@ayman/contracts/homework';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaService, type UploadFile } from '../media/media.service';
import { HomeworkService } from './homework.service';
import { SubmitHomeworkDto } from './homework.dto';

/**
 * الواجب, the student's half.
 *
 * `homework:submit` is self-scoped — see the permission's own note — so every
 * method here reads `user.id` from the session and never a route parameter.
 * There is deliberately no route that takes a submission id for a write: the
 * pair (lesson, student) IS the identity of a submission, and an endpoint that
 * accepted an id would need an ownership check this shape does not.
 */
@Controller('homework')
export class HomeworkController {
  constructor(
    private readonly homework: HomeworkService,
    private readonly media: MediaService,
  ) {}

  /**
   * ⚠️ Declared BEFORE `lessons/:lessonId`-shaped routes for the reason every
   * controller in this codebase repeats: Nest matches in declaration order, and
   * a static segment that comes after a parameterised one is captured by it.
   */
  @RequirePermission('homework:submit')
  @Post('lessons/:lessonId/images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @UploadedFile() file?: UploadFile,
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    /*
     * ⚠️ The missing-file check is in the SERVICE, after the enrolment gate,
     * and not here before it.
     *
     * With it here, a caller with no business seeing this lecture learned
     * something anyway: a 400 about the shape of their request rather than the
     * 404 that says the lesson is not theirs. The order that answers the
     * fewest questions is permission → enrolment → payload, and that is only
     * expressible with the file handed down.
     */
    return this.homework.uploadImage(user.id, lessonId, file);
  }

  @RequirePermission('homework:submit')
  @UsePipes(ZodValidationPipe)
  @Post('lessons/:lessonId/submissions')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body() body: SubmitHomeworkDto,
  ): Promise<MyHomeworkSubmission> {
    return this.homework.submit(user.id, lessonId, body);
  }

  /**
   * The homework block on its own, for a client that wants it without
   * re-fetching the whole player payload — which is what the card does after
   * uploading, so the new status appears without a full route refresh.
   *
   * `null` for a lecture with no published homework, which is most of them.
   */
  @RequirePermission('homework:submit')
  @Get('lessons/:lessonId')
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
  ): Promise<StudentHomework | null> {
    return this.homework.mine(user.id, lessonId);
  }

  /**
   * One page the student uploaded, back to the student who uploaded it.
   *
   * NOT through the public `/media/:prefix/:name` route — `hw/` is three
   * segments precisely so it cannot be — and streamed rather than redirected,
   * for the reason `PlayerController.serveResource` gives at length: a redirect
   * authorises once, to mint a URL that then works forever for anybody.
   *
   * `private, no-store` because a shared machine's browser cache holding a
   * photograph of someone's homework outlives the session that was allowed to
   * read it. `sandbox` + `nosniff` for the same reason every other served file
   * carries them.
   */
  @RequirePermission('homework:submit')
  @Get('images/:imageId')
  async image(
    @CurrentUser() user: AuthenticatedUser,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.homework.studentImage(user.id, imageId);
    await sendImage(this.media, image, response);
  }
}

/**
 * Shared by both controllers because the bytes and the headers are identical —
 * only who is allowed to ask differs, and that is settled by the guard before
 * either method runs.
 */
export async function sendImage(
  media: MediaService,
  image: { key: string; size: number },
  response: Response,
): Promise<void> {
  // The row says the object is there. A missing one is a broken installation,
  // but a 404 is still the better answer than a stream that errors mid-flight
  // with headers already sent.
  const info = await media.statByKey(image.key);
  if (!info) throw new NotFoundException();

  response.set({
    // Always WebP — the sharp re-encode is the only way a byte gets under this
    // prefix, so this is our own statement and not an uploader's.
    'Content-Type': OUTPUT_MIME,
    'Content-Length': String(info.size),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });

  (await media.streamByKey(image.key)).pipe(response);
}
