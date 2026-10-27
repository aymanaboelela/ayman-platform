import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UsePipes } from '@nestjs/common';
import { permissionsForUser } from '../../auth/permissions';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import {
  MontageEditorCreateDto,
  MontageEditorPasswordDto,
  MontagePublishDto,
  MontageUploadCompleteDto,
  MontageUploadResumeDto,
  MontageUploadStartDto,
  MontageVideoPatchDto,
} from './montage.dto';
import { MontageService } from './montage.service';

/** A uuid route param that is not one is a 404, never a Prisma error. */
const Id = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/**
 * «المونتاج» — see `MontageService`.
 *
 * `montage:read` / `montage:write` are what the `video_editor` role holds;
 * `montage:publish` is not, so the two routes that touch lessons — and the
 * one that lists every course to pick from — are the instructor's alone.
 * Behind `montage` on the whole class: a stack without the feature answers
 * 404 everywhere, before the session is even read.
 */
@Controller()
@RequireFeature('montage')
@UsePipes(ZodValidationPipe)
export class MontageController {
  constructor(private readonly montage: MontageService) {}

  @RequirePermission('montage:read')
  @Get('montage')
  list() {
    return this.montage.list();
  }

  @RequirePermission('montage:write')
  @Post('montage/uploads')
  start(@Body() body: MontageUploadStartDto, @CurrentUser() user: AuthenticatedUser) {
    return this.montage.start(body, user.id);
  }

  @RequirePermission('montage:write')
  @Post('montage/:id/upload/resume')
  resume(@Param('id', Id) id: string, @Body() body: MontageUploadResumeDto) {
    return this.montage.resume(id, body);
  }

  @RequirePermission('montage:write')
  @Post('montage/:id/upload/complete')
  complete(@Param('id', Id) id: string, @Body() body: MontageUploadCompleteDto) {
    return this.montage.complete(id, body);
  }

  @RequirePermission('montage:write')
  @Patch('montage/:id')
  patch(@Param('id', Id) id: string, @Body() body: MontageVideoPatchDto) {
    return this.montage.patch(id, body);
  }

  /**
   * Also «إلغاء» for an upload still in flight — the parts go with the row.
   *
   * A video that has ARRIVED is the instructor's to delete, not the editor's:
   * `montage:write` cancels an upload, `montage:publish` is what deletes a
   * finished one. The owner's words: «بعد الرفع هو ميقدرش يمسح… أنا اللي أقدر».
   */
  @RequirePermission('montage:write')
  @Delete('montage/:id')
  @HttpCode(204)
  async remove(@Param('id', Id) id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.montage.remove(id, permissionsForUser(user.id, user.role).includes('montage:publish'));
  }

  @RequirePermission('montage:read')
  @Get('montage/:id/download')
  download(@Param('id', Id) id: string) {
    return this.montage.download(id);
  }

  @RequirePermission('montage:publish')
  @Get('admin/montage/targets')
  targets() {
    return this.montage.targets();
  }

  /*
   * «المونتيرين». `montage:publish` — the instructor's side of the feature —
   * and every service method refuses an account that is not `video_editor`,
   * so none of these can reach a student, an assistant or the instructor.
   */
  @RequirePermission('montage:publish')
  @Get('admin/montage/editors')
  editors() {
    return this.montage.editors();
  }

  @RequirePermission('montage:publish')
  @Post('admin/montage/editors')
  createEditor(@Body() body: MontageEditorCreateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.montage.createEditor(body, user.id);
  }

  @RequirePermission('montage:publish')
  @Post('admin/montage/editors/:userId/password')
  setEditorPassword(
    @Param('userId') userId: string,
    @Body() body: MontageEditorPasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.montage.setEditorPassword(userId, body.password, user.id);
  }

  @RequirePermission('montage:publish')
  @Post('admin/montage/editors/:userId/disable')
  disableEditor(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.montage.setEditorDisabled(userId, true, user.id);
  }

  @RequirePermission('montage:publish')
  @Post('admin/montage/editors/:userId/enable')
  enableEditor(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.montage.setEditorDisabled(userId, false, user.id);
  }

  @RequirePermission('montage:publish')
  @Post('admin/montage/:id/publish')
  publish(@Param('id', Id) id: string, @Body() body: MontagePublishDto, @CurrentUser() user: AuthenticatedUser) {
    return this.montage.publish(id, body, user.id);
  }
}
