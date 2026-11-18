import {
  Body,
  Controller,
  Get,
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
import { MAX_UPLOAD_BYTES } from '@ayman/contracts/admin/media';
import type { EssayPayload, EssaySummary, MyEssaySubmission } from '@ayman/contracts/daily-essay';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { sendImage } from '../homework/homework.controller';
import { MediaService, type UploadFile } from '../media/media.service';
import { SubmitDailyEssayDto } from './daily-essay.dto';
import { DailyEssayService } from './daily-essay.service';

/**
 * «السؤال المقالي اليومي», the student's half.
 *
 * `homework:submit` rather than a permission of its own: it is the same act —
 * a student handing in written work for a person to mark — held by the same
 * role, and self-scoped the same way. Every method reads `user.id` from the
 * session; no route takes a submission id for a write, because the pair
 * (question, student) IS the identity of an answer.
 */
@RequireFeature('dailyEssay')
@Controller('me/essay')
export class DailyEssayController {
  constructor(
    private readonly essays: DailyEssayService,
    private readonly media: MediaService,
  ) {}

  @RequirePermission('homework:submit')
  @Get()
  page(@CurrentUser() user: AuthenticatedUser): Promise<EssayPayload> {
    return this.essays.page(user.id);
  }

  /** The home card — its own read, so the dashboard does not pay for thirty past questions. */
  @RequirePermission('homework:submit')
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser): Promise<EssaySummary> {
    return this.essays.summary(user.id);
  }

  /**
   * One page the student uploaded, back to that student. Streamed through the
   * API with `private, no-store`, never the public media route — see
   * `HomeworkController.image`, whose helper this reuses.
   *
   * ⚠️ Declared BEFORE `:essayId/...`: Nest matches in declaration order.
   */
  @RequirePermission('homework:submit')
  @Get('images/:imageId')
  async image(
    @CurrentUser() user: AuthenticatedUser,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Res() response: Response,
  ): Promise<void> {
    const image = await this.essays.studentImage(user.id, imageId);
    await sendImage(this.media, image, response);
  }

  @RequirePermission('homework:submit')
  @Post(':essayId/images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  uploadImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('essayId', ParseUUIDPipe) essayId: string,
    @UploadedFile() file?: UploadFile,
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    // The missing-file check is in the SERVICE, after the audience gate:
    // permission → audience → payload, so a caller with no business here
    // learns nothing about the shape of their request.
    return this.essays.uploadImage(user.id, essayId, file);
  }

  @RequirePermission('homework:submit')
  @UsePipes(ZodValidationPipe)
  @Post(':essayId/answer')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('essayId', ParseUUIDPipe) essayId: string,
    @Body() body: SubmitDailyEssayDto,
  ): Promise<MyEssaySubmission> {
    return this.essays.submit(user.id, essayId, body);
  }
}
