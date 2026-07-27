import { Body, Controller, Delete, Get, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Public } from '../../../auth/decorators/public.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import { NavigationCreateDto, NavigationPatchDto, NavigationReorderDto } from './navigation.dto';
import { NavigationService } from './navigation.service';

@Controller()
@UsePipes(ZodValidationPipe)
export class NavigationController {
  constructor(private readonly navigation: NavigationService) {}

  /** Public: this is what `getNavigation()`'s cached loader reads. */
  @Public()
  @Get('navigation')
  listPublic() {
    return this.navigation.listPublic();
  }

  @RequirePermission('nav:read')
  @Get('admin/navigation')
  listAdmin() {
    return this.navigation.listAdmin();
  }

  @RequirePermission('nav:write')
  @Post('admin/navigation')
  create(@Body() body: NavigationCreateDto) {
    return this.navigation.create(body);
  }

  @RequirePermission('nav:write')
  @Patch('admin/navigation/:id')
  patch(@Param('id') id: string, @Body() body: NavigationPatchDto) {
    return this.navigation.patch(id, body);
  }

  @RequirePermission('nav:write')
  @Delete('admin/navigation/:id')
  async archive(@Param('id') id: string) {
    await this.navigation.archive(id);
    return { ok: true };
  }

  @RequirePermission('nav:write')
  @Post('admin/navigation/:id/restore')
  async restore(@Param('id') id: string) {
    await this.navigation.restore(id);
    return { ok: true };
  }

  /**
   * Fixed path, not `:parentId` — `parentId` (nullable, identifying the
   * TOP level) lives in the body, which a path segment cannot represent
   * for the null case without a magic string standing in for "no parent".
   */
  @RequirePermission('nav:write')
  @Post('admin/navigation/order')
  async reorder(@Body() body: NavigationReorderDto) {
    await this.navigation.reorder(body);
    return { ok: true };
  }
}
