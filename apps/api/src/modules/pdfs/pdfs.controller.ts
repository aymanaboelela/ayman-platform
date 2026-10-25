import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Throttle, seconds } from '@nestjs/throttler';
import type { Response } from 'express';
import type { PdfDetail, PdfList } from '@ayman/contracts/pdfs';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { IS_AYMAN } from '../../common/tenant';
import { MEDIA_STORAGE, type MediaStorage } from '../media/storage/media-storage';
import { RequireCsrf } from '../security/require-csrf.decorator';
import { PdfCreateDto, PdfPatchDto, PdfSetPublishedDto } from './pdfs.dto';
import { PdfsService } from './pdfs.service';

/** The public reads sit behind a `'use cache'` on the web side, like the news
 *  ones, so this is the same generous ceiling `NewsController` uses. */
const PUBLIC_THROTTLE = {
  short: { limit: 300, ttl: seconds(1) },
  medium: { limit: 3000, ttl: seconds(60) },
  long: { limit: 30_000, ttl: seconds(3600) },
};

/**
 * The download is NOT cached anywhere and every press is a real file — a
 * tighter ceiling per caller, still far above a person pressing a button.
 */
const DOWNLOAD_THROTTLE = {
  short: { limit: 5, ttl: seconds(1) },
  medium: { limit: 60, ttl: seconds(60) },
  long: { limit: 600, ttl: seconds(3600) },
};

/**
 * «ملفات PDF». Ayman's stack only: every route 404s elsewhere, the admin ones
 * included, so another teacher's stack has no surface here at all (CLAUDE.md
 * §2–§3). The permissions are the articles' own — a PDF is published content
 * of the same kind, written and published by the same people.
 */
@Controller()
@UsePipes(ZodValidationPipe)
export class PdfsController {
  constructor(
    private readonly pdfs: PdfsService,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
  ) {}

  @Public()
  @Throttle(PUBLIC_THROTTLE)
  @Get('pdfs')
  listPublic(): Promise<PdfList> {
    gate();
    return this.pdfs.listPublic();
  }

  @Public()
  @Throttle(PUBLIC_THROTTLE)
  @Get('pdfs/:slug')
  async onePublic(@Param('slug') slug: string): Promise<PdfDetail> {
    gate();
    const pdf = await this.pdfs.findPublicBySlug(slug);
    if (!pdf) throw new NotFoundException();
    return pdf;
  }

  /**
   * The link under the YouTube video ends here: no account, one GET, the file.
   *
   * `attachment` so a phone saves it rather than opening a viewer tab, with
   * the TITLE as the file name (RFC 5987 — Arabic). The sandbox CSP and
   * `nosniff` are the same pair the lesson resources ship with: the bytes
   * were magic-checked as a PDF on upload, and this keeps them inert even if
   * a browser decided to render them on our origin.
   */
  @Public()
  @Throttle(DOWNLOAD_THROTTLE)
  @Get('pdfs/:slug/download')
  async download(@Param('slug') slug: string, @Res() response: Response): Promise<void> {
    gate();
    const file = await this.pdfs.startDownload(slug);
    if (!file) throw new NotFoundException();
    const info = await this.storage.stat(file.fileKey);
    if (!info) throw new NotFoundException();

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(info.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${file.title}.pdf`)}`,
      // `no-store`: every press is counted, and a cached copy is a download
      // the counter never saw.
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    (await this.storage.getStream(file.fileKey)).pipe(response);
  }

  @RequirePermission('news:read')
  @Get('admin/pdfs')
  listAdmin() {
    gate();
    return this.pdfs.listAdmin();
  }

  @RequirePermission('news:read')
  @Get('admin/pdfs/:id')
  oneAdmin(@Param('id') id: string) {
    gate();
    return this.pdfs.findAdminById(id);
  }

  @RequirePermission('news:write')
  @RequireCsrf()
  @Post('admin/pdfs')
  create(@Body() body: PdfCreateDto, @CurrentUser() user: AuthenticatedUser) {
    gate();
    return this.pdfs.create(body, user.id);
  }

  @RequirePermission('news:write')
  @RequireCsrf()
  @Patch('admin/pdfs/:id')
  patch(@Param('id') id: string, @Body() body: PdfPatchDto, @CurrentUser() user: AuthenticatedUser) {
    gate();
    return this.pdfs.patch(id, body, user.id);
  }

  @RequirePermission('news:publish')
  @RequireCsrf()
  @Patch('admin/pdfs/:id/published')
  setPublished(
    @Param('id') id: string,
    @Body() body: PdfSetPublishedDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    gate();
    return this.pdfs.setPublished(id, body.isPublished, user.id);
  }

  @RequirePermission('news:write')
  @RequireCsrf()
  @Delete('admin/pdfs/:id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    gate();
    await this.pdfs.remove(id, user.id);
    return { ok: true };
  }
}

function gate(): void {
  if (!IS_AYMAN) throw new NotFoundException();
}
