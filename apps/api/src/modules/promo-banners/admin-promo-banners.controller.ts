import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../auth/decorators/require-permission.decorator';
import { PromoBannerCreateDto, PromoBannerPatchDto, PromoBannerReorderDto } from './promo-banners.dto';
import { PromoBannersService } from './promo-banners.service';

/**
 * `/admin/promo-banners` — «البانرات الترويجية».
 *
 * On `home:read`/`home:write`, the pair that already owns «الصفحة الرئيسية»:
 * both decide what a reader sees first on a page, and a role trusted with the
 * landing page's sections is the one to trust with these. A separate pair
 * would be a box nobody remembers to tick on an assistant's role.
 *
 * `@RequireFeature` on the whole controller, like the public read: a stack
 * without the feature has no strip to feed, and a screen writing rows nobody
 * reads is exactly the trap CLAUDE.md §2 rule 3 describes.
 */
@Controller('admin/promo-banners')
@RequireFeature('promoBanners')
@UsePipes(ZodValidationPipe)
export class AdminPromoBannersController {
  constructor(private readonly banners: PromoBannersService) {}

  @RequirePermission('home:read')
  @Get()
  list() {
    return this.banners.listAdmin();
  }

  @RequirePermission('home:write')
  @Post()
  create(@Body() body: PromoBannerCreateDto) {
    return this.banners.create(body);
  }

  /** Declared before `:id` routes only for reading order — the method differs
   *  (`POST` here, `PATCH`/`DELETE` there), so nothing can swallow it. */
  @RequirePermission('home:write')
  @Post('order')
  async reorder(@Body() body: PromoBannerReorderDto) {
    await this.banners.reorder(body);
    return { ok: true };
  }

  @RequirePermission('home:write')
  @Patch(':id')
  patch(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: PromoBannerPatchDto) {
    return this.banners.patch(id, body);
  }

  @RequirePermission('home:write')
  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.banners.remove(id);
    return { ok: true };
  }
}
