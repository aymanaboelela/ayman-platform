import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ZodValidationPipe } from 'nestjs-zod';
import { OUTPUT_MIME } from '@ayman/contracts/admin/media';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { MAX_DOCUMENT_BYTES, MAX_UPLOAD_BYTES } from '@ayman/contracts/admin/media';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { MediaListQueryDto, MediaPatchDto } from './media.dto';
import { MediaService } from './media.service';
import { DocumentService } from './document.service';

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Controller()
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly documents: DocumentService,
  ) {}

  @RequirePermission('media:write')
  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.media.upload(file);
  }

  /**
   * Separate from `POST /media` because documents take a different pipeline —
   * see `DocumentService` for why, and for what stands in for the sharp
   * re-encode that method has and this one cannot. Same permission, same
   * size discipline, no sharp.
   *
   * Returns the storage key rather than creating a `media_assets` row: the
   * document's record is the `lesson_resources` row the admin creates next.
   */
  @RequirePermission('media:write')
  @Post('media/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
    }),
  )
  async uploadDocument(@UploadedFile() file?: MulterFile) {
    if (!file) throw new BadRequestException('no file uploaded');
    return this.documents.upload(file);
  }

  @RequirePermission('media:read')
  @Get('admin/media')
  @UsePipes(ZodValidationPipe)
  list(@Query() query: MediaListQueryDto) {
    return this.media.list(query);
  }

  @RequirePermission('media:write')
  @Patch('admin/media/:id')
  @UsePipes(ZodValidationPipe)
  patch(@Param('id') id: string, @Body() body: MediaPatchDto) {
    return this.media.patch(id, body);
  }

  @RequirePermission('media:delete')
  @Post('admin/media/:id/archive')
  archive(@Param('id') id: string) {
    return this.media.archive(id);
  }

  @RequirePermission('media:delete')
  @Post('admin/media/:id/restore')
  restore(@Param('id') id: string) {
    return this.media.restore(id);
  }

  /**
   * A10 — outside `/api` (excluded in `main.ts`), a different origin from
   * the web app under the same-origin policy. `nosniff` + a
   * `Content-Security-Policy: sandbox` + a fixed Content-Type we produced
   * ourselves is belt-and-braces even though every stored byte has already
   * been through the sharp re-encode.
   */
  @Public()
  @Get('media/:prefix/:name')
  async serve(
    @Param('prefix') prefix: string,
    @Param('name') name: string,
    @Res() response: Response,
  ): Promise<void> {
    const key = `${prefix}/${name}`;
    const info = await this.media.statByKey(key);
    if (!info) throw new NotFoundException();

    response.set({
      'Content-Type': OUTPUT_MIME,
      'Content-Length': String(info.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });

    (await this.media.streamByKey(key)).pipe(response);
  }
}
