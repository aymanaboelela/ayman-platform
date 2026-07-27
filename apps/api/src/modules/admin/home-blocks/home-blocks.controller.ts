import { Body, Controller, Delete, Get, Param, Patch, Post, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { Public } from '../../../auth/decorators/public.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import {
  HomeBlockCreateDto,
  HomeBlockPatchDto,
  HomeBlockReorderDto,
  SetPublishedDto,
} from './home-blocks.dto';
import { HomeBlocksService } from './home-blocks.service';

@Controller()
@UsePipes(ZodValidationPipe)
export class HomeBlocksController {
  constructor(private readonly blocks: HomeBlocksService) {}

  /** Public: this is what `getHomeBlocks()`'s cached loader reads. */
  @Public()
  @Get('home-blocks')
  listPublic() {
    return this.blocks.listPublic();
  }

  @RequirePermission('home:read')
  @Get('admin/home-blocks')
  listAdmin() {
    return this.blocks.listAdmin();
  }

  @RequirePermission('home:write')
  @Post('admin/home-blocks')
  create(@Body() body: HomeBlockCreateDto) {
    return this.blocks.create(body);
  }

  @RequirePermission('home:write')
  @Patch('admin/home-blocks/:id')
  patch(@Param('id') id: string, @Body() body: HomeBlockPatchDto) {
    return this.blocks.patch(id, body);
  }

  @RequirePermission('home:write')
  @Patch('admin/home-blocks/:id/published')
  setPublished(@Param('id') id: string, @Body() body: SetPublishedDto) {
    return this.blocks.setPublished(id, body.isPublished);
  }

  @RequirePermission('home:write')
  @Delete('admin/home-blocks/:id')
  async archive(@Param('id') id: string) {
    await this.blocks.archive(id);
    return { ok: true };
  }

  @RequirePermission('home:write')
  @Post('admin/home-blocks/:id/restore')
  async restore(@Param('id') id: string) {
    await this.blocks.restore(id);
    return { ok: true };
  }

  @RequirePermission('home:write')
  @Post('admin/home-blocks/order')
  async reorder(@Body() body: HomeBlockReorderDto) {
    await this.blocks.reorder(body);
    return { ok: true };
  }
}
