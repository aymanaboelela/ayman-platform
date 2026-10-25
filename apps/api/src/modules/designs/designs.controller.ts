import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { ZodValidationPipe } from 'nestjs-zod';
import { MAX_DESIGN_BYTES } from '@ayman/contracts/designs';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { IS_AYMAN } from '../../common/tenant';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import {
  DesignAssetPatchDto,
  DesignFolderCreateDto,
  DesignFolderPatchDto,
  DesignPublishDto,
} from './designs.dto';
import { DesignsService, type DesignFile, type UploadFile } from './designs.service';

/**
 * A grid paints up to a few dozen previews at once, and the default limiter
 * (10/s, 60/min) would 429 half of them on the first screen. The previews are
 * versioned and `immutable`, so the browser asks for each one once.
 */
const PREVIEW_THROTTLE = {
  short: { limit: 80, ttl: seconds(1) },
  medium: { limit: 1500, ttl: seconds(60) },
  long: { limit: 20_000, ttl: seconds(3600) },
};

/**
 * Uploads: a designer dropping a folder's worth at once is the normal case,
 * so the minute window is wide — but each request can be 60 MB, so the burst
 * window is narrow. The encode slot behind it is the real ceiling on CPU.
 */
const UPLOAD_THROTTLE = {
  short: { limit: 3, ttl: seconds(1) },
  medium: { limit: 120, ttl: seconds(60) },
  long: { limit: 1500, ttl: seconds(3600) },
};

const UPLOAD = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_DESIGN_BYTES, files: 1, fields: 0 },
});

/**
 * «ستوديو التصميم». Ayman's stack only — every route 404s elsewhere, the
 * same gate as «ملفات PDF».
 *
 * `design:read` / `design:write` are what the `designer` role holds;
 * `design:publish` is not, so the one route that makes a design visible to
 * students is the instructor's alone.
 */
@Controller()
@UsePipes(ZodValidationPipe)
export class DesignsController {
  constructor(
    private readonly designs: DesignsService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  @RequirePermission('design:read')
  @Get('designs')
  studio() {
    gate();
    return this.designs.studio();
  }

  @RequirePermission('design:write')
  @Post('designs/folders')
  createFolder(@Body() body: DesignFolderCreateDto, @CurrentUser() user: AuthenticatedUser) {
    gate();
    return this.designs.createFolder(body, user.id);
  }

  @RequirePermission('design:read')
  @Get('designs/folders/:id')
  folder(@Param('id') id: string) {
    gate();
    return this.designs.folder(id);
  }

  @RequirePermission('design:write')
  @Patch('designs/folders/:id')
  patchFolder(@Param('id') id: string, @Body() body: DesignFolderPatchDto) {
    gate();
    return this.designs.patchFolder(id, body);
  }

  @RequirePermission('design:write')
  @Delete('designs/folders/:id')
  @HttpCode(204)
  async deleteFolder(@Param('id') id: string): Promise<void> {
    gate();
    await this.designs.deleteFolder(id);
  }

  @RequirePermission('design:write')
  @Throttle(UPLOAD_THROTTLE)
  @Post('designs/folders/:id/assets')
  @UseInterceptors(UPLOAD)
  upload(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: UploadFile,
  ) {
    gate();
    if (!file) throw new BadRequestException('no file uploaded');
    return this.designs.upload(id, file, user.id);
  }

  @RequirePermission('design:write')
  @Patch('designs/assets/:id')
  patchAsset(@Param('id') id: string, @Body() body: DesignAssetPatchDto) {
    gate();
    return this.designs.patchAsset(id, body);
  }

  @RequirePermission('design:write')
  @Throttle(UPLOAD_THROTTLE)
  @Post('designs/assets/:id/replace')
  @UseInterceptors(UPLOAD)
  replace(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: UploadFile,
  ) {
    gate();
    if (!file) throw new BadRequestException('no file uploaded');
    return this.designs.replace(id, file, user.id);
  }

  @RequirePermission('design:write')
  @Delete('designs/assets/:id')
  @HttpCode(204)
  async deleteAsset(@Param('id') id: string): Promise<void> {
    gate();
    await this.designs.deleteAsset(id);
  }

  @RequirePermission('design:read')
  @Throttle(PREVIEW_THROTTLE)
  @Get('designs/assets/:id/preview')
  async preview(@Param('id') id: string, @Res() response: Response): Promise<void> {
    gate();
    await this.send(await this.designs.file(id, 'preview'), 'inline', response);
  }

  /** The master, byte for byte what the re-encode wrote — «أنزّلها بجودة عالية». */
  @RequirePermission('design:read')
  @Get('designs/assets/:id/download')
  async download(@Param('id') id: string, @Res() response: Response): Promise<void> {
    gate();
    await this.send(await this.designs.file(id, 'master'), 'attachment', response);
  }

  @RequirePermission('design:publish')
  @Post('admin/designs/assets/:id/publish')
  publish(
    @Param('id') id: string,
    @Body() body: DesignPublishDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    gate();
    return this.designs.publish(id, body.shape, user.id);
  }

  /**
   * Same hardening as the public media route, plus `private`: these bytes are
   * behind a session, so no shared cache may keep them. `immutable` is safe
   * because the URL carries the version and a replace mints new keys.
   */
  private async send(file: DesignFile, disposition: 'inline' | 'attachment', response: Response): Promise<void> {
    const info = await this.storage.stat(file.key);
    if (!info) throw new NotFoundException();
    const ascii = file.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    response.set({
      'Content-Type': file.mime,
      'Content-Length': String(info.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    (await this.storage.getStream(file.key)).pipe(response);
  }
}

function gate(): void {
  if (!IS_AYMAN) throw new NotFoundException();
}
