import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UsePipes } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { RequireFeature } from '../../../auth/decorators/require-feature.decorator';
import { RequirePermission } from '../../../auth/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../../auth/decorators/current-user.decorator';
import {
  AdminHonorPinCreateDto,
  AdminHonorPinPatchDto,
  AdminHonorStudentQueryDto,
} from './honor-board.dto';
import { AdminHonorBoardService } from './honor-board.service';

/**
 * `/admin/honor-board` — «حط حد على لوحة الشرف».
 *
 * ⚠️ `@RequireFeature('honorBoard')` على الكونترولر كله، زي الراوت العام
 * بالظبط. ستاك مقفول فيه الفيتشر مالوش لوحة أصلاً — لا صفحة ولا أرشيف — فشاشة
 * إدارة ليها كانت هتبقى زرار بيكتب في جدول مالوش قارئ.
 *
 * القراية على `honor:read` والكتابة على `honor:write`، وهما اتنين مش واحد
 * لنفس سبب كل زوج في `permissions.ts`: «أشوف مين على اللوحة» و«أنشر اسم طالب
 * على صفحة عامة» مش نفس السلطة.
 */
@Controller('admin/honor-board')
@RequireFeature('honorBoard')
@UsePipes(ZodValidationPipe)
export class AdminHonorBoardController {
  constructor(private readonly board: AdminHonorBoardService) {}

  @RequirePermission('honor:read')
  @Get()
  list() {
    return this.board.list();
  }

  /** ⚠️ متعرّف قبل `@Get(':id')`؟ مفيش `:id` أصلاً — القراية كلها ريكويست
   *  واحد، والبحث هو المسار التاني الوحيد. */
  @RequirePermission('honor:read')
  @Get('students')
  searchStudents(@Query() query: AdminHonorStudentQueryDto) {
    return this.board.searchStudents(query.q, query.limit);
  }

  @RequirePermission('honor:write')
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: AdminHonorPinCreateDto) {
    return this.board.create(body, user.id);
  }

  @RequirePermission('honor:write')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: AdminHonorPinPatchDto) {
    return this.board.patch(id, body);
  }

  @RequirePermission('honor:write')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.board.remove(id);
    return { ok: true };
  }
}
